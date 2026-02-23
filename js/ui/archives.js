/**
 * Update the archive count badge in the sidebar.
 */
function updateArchiveCount() {
    document.getElementById('archiveCount').textContent = archives.length;
}

/**
 * Render the archives list inside the archives modal.
 * Shows archive date, expiration countdown, and restore/delete buttons.
 */
function renderArchivesList() {
    const archivesList = document.getElementById('archivesList');

    if (archives.length === 0) {
        archivesList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px;">Aucune archive</p>';
        return;
    }

    archivesList.innerHTML = archives.map(archive => {
        const archivedDate = new Date(archive.archivedAt).toLocaleDateString('fr-FR');
        const deleteDate = new Date(archive.deleteAfter).toLocaleDateString('fr-FR');
        const daysLeft = Math.ceil((new Date(archive.deleteAfter) - new Date()) / (1000 * 60 * 60 * 24));

        return `
            <div style="background: var(--bg); border: 2px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                    <div>
                        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">${archive.name}</div>
                        <div style="font-size: 12px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">
                            📅 Archivé le ${archivedDate}<br>
                            🗑️ Suppression le ${deleteDate} (dans ${daysLeft} jours)<br>
                            📍 ${archive.points.length} points
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-success btn-sm" onclick="restoreArchive('${archive.id}')">
                        ↩️ Restaurer
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteArchive('${archive.id}')">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Restore an archive back to active projects.
 * Removes archive metadata and saves as a regular project.
 * 
 * @param {string} archiveId - ID of the archive to restore
 */
async function restoreArchive(archiveId) {
    const archive = archives.find(a => a.id === archiveId);
    if (!archive) return;

    if (!confirm(`Restaurer le projet "${archive.name}" dans les projets actifs ?`)) {
        return;
    }

    // Remove archive-specific metadata
    delete archive.archivedAt;
    delete archive.deleteAfter;

    projects.push(archive);
    await saveProject(archive);
    await deleteArchiveFromStorage(archiveId);

    await loadArchives();
    renderProjects();
    closeModal('archivesModal');
    alert('✅ Projet restauré avec succès !');
}

/**
 * Permanently delete an archive.
 * 
 * @param {string} archiveId - ID of the archive to delete
 */
async function deleteArchive(archiveId) {
    const archive = archives.find(a => a.id === archiveId);
    if (!archive) return;

    if (!confirm(`Supprimer définitivement l'archive "${archive.name}" ?\nCette action est irréversible.`)) {
        return;
    }

    await deleteArchiveFromStorage(archiveId);
    await loadArchives();
    renderArchivesList();
    alert('🗑️ Archive supprimée définitivement');
}


