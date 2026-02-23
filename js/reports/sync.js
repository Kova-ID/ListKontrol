/**
 * ListKontrol - Sync Import Module
 * =================================
 * 
 * Handles importing changes from interactive report sync files (.json)
 * back into the application. This closes the collaboration loop:
 * 
 * Admin generates report → Enterprise modifies → Exports sync JSON
 * → Admin imports sync file → All changes applied with full traceability
 * 
 * Sync file format (version 0.6.0):
 * {
 *   version: "0.6.0",
 *   type: "listk-sync",
 *   projectId: string,
 *   projectName: string,
 *   syncCreatedAt: string (ISO date),
 *   editor: string (name of person who made changes),
 *   changes: {
 *     [pointId]: {
 *       statusChange: { previousStatus, newStatus, date, user },
 *       addedPhotos: [{ data (base64), date, user }],
 *       addedNotes: [{ text, date, user }]
 *     }
 *   }
 * }
 */

// Temporary storage for the loaded sync data before applying
let pendingSyncData = null;

/**
 * Handle sync file selection from the import modal.
 * Validates the file format and shows a preview of changes.
 * 
 * @param {Event} event - File input change event
 */
function handleSyncFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);

            // Validate sync file format
            if (data.type !== 'listk-sync') {
                alert('❌ Ce fichier n\'est pas un fichier de synchronisation ListKontrol valide.');
                return;
            }

            if (!data.changes || Object.keys(data.changes).length === 0) {
                alert('ℹ️ Ce fichier ne contient aucune modification.');
                return;
            }

            pendingSyncData = data;
            renderSyncPreview(data);

        } catch (error) {
            alert('❌ Erreur de lecture du fichier: ' + error.message);
        }
    };
    reader.readAsText(file);
}

/**
 * Render a preview of the sync changes before applying.
 * Shows what will be modified so the admin can review before confirming.
 * 
 * @param {Object} data - Parsed sync file data
 */
function renderSyncPreview(data) {
    const preview = document.getElementById('syncPreview');
    const applyBtn = document.getElementById('applySyncBtn');

    let statusChanges = 0;
    let photosAdded = 0;
    let notesAdded = 0;

    for (const pointId in data.changes) {
        const c = data.changes[pointId];
        if (c.statusChange) statusChanges++;
        if (c.addedPhotos) photosAdded += c.addedPhotos.length;
        if (c.addedNotes) notesAdded += c.addedNotes.length;
    }

    // Check if this sync belongs to the current project
    const matchesProject = currentProject && currentProject.id === data.projectId;

    preview.style.display = 'block';
    preview.innerHTML = `
        <div style="background: ${matchesProject ? '#d1fae5' : '#fef3c7'}; padding: 16px; border-radius: 8px; margin-bottom: 12px;">
            <strong>${matchesProject ? '✅ Projet correspondant' : '⚠️ Projet différent'}</strong>
            <br>Projet: ${data.projectName}
            <br>Modifié par: ${data.editor}
            <br>Date: ${new Date(data.syncCreatedAt).toLocaleString('fr-FR')}
        </div>
        <div style="background: var(--bg); padding: 16px; border-radius: 8px;">
            <strong>Modifications à appliquer:</strong>
            <ul style="margin-top: 8px; padding-left: 20px;">
                ${statusChanges > 0 ? `<li>${statusChanges} changement(s) de statut</li>` : ''}
                ${photosAdded > 0 ? `<li>${photosAdded} photo(s) ajoutée(s)</li>` : ''}
                ${notesAdded > 0 ? `<li>${notesAdded} note(s) ajoutée(s)</li>` : ''}
            </ul>
        </div>
    `;

    applyBtn.disabled = !matchesProject;
    
    if (!matchesProject) {
        preview.innerHTML += `
            <div style="background: #fef3c7; padding: 12px; border-radius: 8px; margin-top: 12px; color: #92400e;">
                ⚠️ Ce fichier de synchronisation ne correspond pas au projet actuellement sélectionné.
                Veuillez sélectionner le projet "${data.projectName}" avant d'importer.
            </div>
        `;
    }
}

/**
 * Apply all changes from the sync file to the current project.
 * Updates point statuses, adds photos, adds notes to comments,
 * and records everything in the status history for traceability.
 */
async function applySyncChanges() {
    if (!pendingSyncData || !currentProject) return;

    const data = pendingSyncData;
    let appliedCount = 0;

    for (const pointId in data.changes) {
        const point = currentProject.points.find(p => p.id === pointId);
        if (!point) {
            console.warn(`Point ${pointId} not found in project, skipping`);
            continue;
        }

        const c = data.changes[pointId];

        // Apply status change
        if (c.statusChange) {
            const oldStatus = point.status;
            point.status = c.statusChange.newStatus;

            if (!point.statusHistory) point.statusHistory = [];
            point.statusHistory.push({
                status: c.statusChange.newStatus,
                date: c.statusChange.date,
                user: c.statusChange.user,
                previousStatus: oldStatus,
                source: 'sync-import'  // Mark as imported change
            });
            appliedCount++;
        }

        // Apply added photos
        if (c.addedPhotos && c.addedPhotos.length > 0) {
            if (!point.photos) {
                point.photos = getPointPhotos(point);
            }
            c.addedPhotos.forEach(photo => {
                point.photos.push(photo.data);
            });
            // Update legacy field
            if (!point.photo && point.photos.length > 0) {
                point.photo = point.photos[0];
            }
            appliedCount += c.addedPhotos.length;
        }

        // Apply notes as comments appended to the existing comment
        if (c.addedNotes && c.addedNotes.length > 0) {
            c.addedNotes.forEach(note => {
                const noteDate = new Date(note.date).toLocaleString('fr-FR');
                point.comment += `\n\n--- Note de ${note.user} (${noteDate}) ---\n${note.text}`;
            });
            appliedCount += c.addedNotes.length;
        }
    }

    // Save and refresh UI
    await saveProject(currentProject);
    renderMapMarkers();
    renderPointsList();
    updateProjectStats();

    // Clean up
    pendingSyncData = null;
    closeModal('syncImportModal');
    document.getElementById('syncFileInput').value = '';
    document.getElementById('syncPreview').style.display = 'none';
    document.getElementById('applySyncBtn').disabled = true;

    alert(
        `✅ Synchronisation réussie !\n\n` +
        `${appliedCount} modification(s) appliquée(s) depuis le rapport de ${data.editor}.`
    );
}
