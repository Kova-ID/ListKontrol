/**
 * ListKontrol - Point Management UI
 * ==================================
 * 
 * Handles point CRUD operations, multi-photo support, and status tracking.
 * 
 * Data model for a point:
 * {
 *   id: string,           // Unique ID (Date.now())
 *   number: number,       // Sequential display number
 *   title: string,        // Short description
 *   comment: string,      // Detailed work description
 *   status: 'todo'|'progress'|'done',
 *   statusHistory: [{status, date, user, previousStatus}],
 *   address: string,      // Reverse-geocoded address
 *   lat: number,          // GPS latitude
 *   lng: number,          // GPS longitude
 *   photos: string[],     // Array of base64 data URLs (NEW in 0.6.0)
 *   photo: string|null,   // Legacy single photo (backward compatible)
 *   createdAt: string     // ISO date
 * }
 * 
 * Multi-photo support (NEW in 0.6.0):
 * - Points now store photos in a `photos` array instead of single `photo`
 * - Legacy points with `photo` are automatically migrated on read
 * - Photos are compressed to 1200px max width, 70% JPEG quality
 * - Grid preview in the modal shows all photos with remove buttons
 */

// Temporary storage for photos being added in the current modal session
let pendingPhotos = [];
let editPendingPhotos = [];

/**
 * Show the points panel (floating side panel).
 */
function showPointsPanel() {
    document.getElementById('pointsPanel').classList.add('active');
    renderPointsList();
}

/**
 * Hide the points panel.
 */
function hidePointsPanel() {
    document.getElementById('pointsPanel').classList.remove('active');
}

/**
 * Update the points count badge in the toolbar.
 */
function updatePointsCount() {
    if (currentProject) {
        document.getElementById('pointsCount').textContent = currentProject.points.length;
    }
}

/**
 * Render the points list in the floating panel.
 * Each point shows title, address, comment preview, status badge,
 * and quick-toggle status buttons.
 */
function renderPointsList() {
    const pointsList = document.getElementById('pointsList');
    pointsList.innerHTML = '';

    if (!currentProject || currentProject.points.length === 0) {
        pointsList.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--text-muted);">Aucun point sur ce projet</p>';
        return;
    }

    currentProject.points.forEach(point => {
        const statusBadge = point.status === 'done' ? 'badge-done' :
                           point.status === 'progress' ? 'badge-progress' : 'badge-todo';
        const statusText = point.status === 'done' ? 'Terminé' :
                          point.status === 'progress' ? 'En cours' : 'À faire';

        const item = document.createElement('div');
        item.className = 'point-item';
        item.setAttribute('data-point-id', point.id);
        item.onclick = () => {
            map.setView([point.lat, point.lng], 18);
            markers.find(m => m.pointId === point.id)?.openPopup();
        };

        item.innerHTML = `
            <div class="point-header">
                <div class="point-title">${point.title}</div>
                <span class="badge ${statusBadge}">${statusText}</span>
            </div>
            <div class="point-address">${point.address}</div>
            <div class="point-comment">${point.comment.substring(0, 100)}${point.comment.length > 100 ? '...' : ''}</div>
            <div class="point-actions">
                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); editPointModal('${point.id}')">
                    ✏️ Modifier
                </button>
                <div class="status-selector">
                    <button 
                        class="btn-status ${point.status === 'todo' ? 'active status-todo' : 'status-todo'}" 
                        onclick="event.stopPropagation(); setPointStatus('${point.id}', 'todo')"
                        title="À faire">
                        ⏸️
                    </button>
                    <button 
                        class="btn-status ${point.status === 'progress' ? 'active status-progress' : 'status-progress'}" 
                        onclick="event.stopPropagation(); setPointStatus('${point.id}', 'progress')"
                        title="En cours">
                        ⏳
                    </button>
                    <button 
                        class="btn-status ${point.status === 'done' ? 'active status-done' : 'status-done'}" 
                        onclick="event.stopPropagation(); setPointStatus('${point.id}', 'done')"
                        title="Terminé">
                        ✅
                    </button>
                </div>
            </div>
        `;

        pointsList.appendChild(item);
    });
}

/**
 * Get all photos for a point, handling legacy single-photo format.
 * Migrates old `photo` field to `photos` array transparently.
 * 
 * @param {Object} point - Point data object
 * @returns {string[]} Array of photo data URLs
 */
function getPointPhotos(point) {
    if (point.photos && point.photos.length > 0) {
        return point.photos;
    }
    if (point.photo) {
        return [point.photo];
    }
    return [];
}

/**
 * Handle multi-photo selection in the new point modal.
 * Compresses each selected photo and adds to pending array.
 * 
 * @param {Event} event - File input change event
 */
async function previewPhotos(event) {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
        const compressed = await compressImage(file);
        pendingPhotos.push(compressed);
    }
    
    renderPhotoPreviewGrid('photoPreviews', pendingPhotos, false);
}

/**
 * Handle multi-photo selection in the edit point modal.
 * 
 * @param {Event} event - File input change event
 */
async function previewEditPhotos(event) {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
        const compressed = await compressImage(file);
        editPendingPhotos.push(compressed);
    }
    
    renderPhotoPreviewGrid('editPhotoPreviews', editPendingPhotos, true);
}

/**
 * Render a grid of photo thumbnails with remove buttons.
 * Used in both new and edit point modals.
 * 
 * @param {string} containerId - DOM id of the preview container
 * @param {string[]} photos - Array of photo data URLs
 * @param {boolean} isEdit - Whether this is the edit modal
 */
function renderPhotoPreviewGrid(containerId, photos, isEdit) {
    const container = document.getElementById(containerId);
    
    container.innerHTML = photos.map((photo, index) => `
        <div class="photo-thumb">
            <img src="${photo}" alt="Photo ${index + 1}">
            <button class="remove-photo" onclick="removePhoto(${index}, ${isEdit})" title="Supprimer">✕</button>
        </div>
    `).join('');
}

/**
 * Remove a photo from the pending array.
 * 
 * @param {number} index - Photo index to remove
 * @param {boolean} isEdit - Whether removing from edit modal
 */
function removePhoto(index, isEdit) {
    if (isEdit) {
        editPendingPhotos.splice(index, 1);
        renderPhotoPreviewGrid('editPhotoPreviews', editPendingPhotos, true);
    } else {
        pendingPhotos.splice(index, 1);
        renderPhotoPreviewGrid('photoPreviews', pendingPhotos, false);
    }
}

/**
 * Save a new point from the modal form data.
 * Creates the point object, adds it to the current project,
 * and persists to storage.
 */
async function savePoint() {
    const title = document.getElementById('pointTitle').value.trim();
    const comment = document.getElementById('pointComment').value.trim();
    const status = document.getElementById('pointStatus').value;
    const address = document.getElementById('pointAddress').value;

    if (!title || !comment) {
        alert('Veuillez remplir tous les champs obligatoires');
        return;
    }

    if (!currentLatLng) {
        alert('Erreur: Position non définie. Veuillez cliquer sur la carte.');
        return;
    }

    if (!currentProject) {
        alert('Erreur: Aucun projet sélectionné');
        return;
    }

    const point = {
        id: Date.now().toString(),
        // Number based on max existing, not array length (handles deletions)
        number: currentProject.points.length > 0
            ? Math.max(...currentProject.points.map(p => p.number || 0)) + 1
            : 1,
        title: title,
        comment: comment,
        status: status,
        statusHistory: [{
            status: status,
            date: new Date().toISOString(),
            user: 'Admin'
        }],
        address: address || `${currentLatLng.lat.toFixed(6)}, ${currentLatLng.lng.toFixed(6)}`,
        lat: currentLatLng.lat,
        lng: currentLatLng.lng,
        photos: [...pendingPhotos],  // Multi-photo array (NEW in 0.6.0)
        photo: pendingPhotos[0] || null,  // Legacy compat: keep first photo in old field
        createdAt: new Date().toISOString()
    };

    if (!currentProject.points) {
        currentProject.points = [];
    }
    currentProject.points.push(point);

    try {
        await saveProject(currentProject);

        closeModal('newPointModal');
        resetPointForm();

        if (currentMarker) {
            map.removeLayer(currentMarker);
            currentMarker = null;
        }

        renderMapMarkers();
        renderPointsList();
        updatePointsCount();
        updateProjectStats();
        currentLatLng = null;

    } catch (error) {
        console.error('Point save failed:', error);
        currentProject.points.pop();

        if (error.message.includes('quota')) {
            alert('⚠️ Espace de stockage saturé!\n\nSolutions:\n• Archivez les anciens projets\n• Utilisez moins de photos');
        } else {
            alert('❌ Erreur: ' + error.message);
        }
    }
}

/**
 * Open the edit modal for an existing point.
 * Pre-fills all form fields with current point data.
 * 
 * @param {string} pointId - ID of the point to edit
 */
function editPointModal(pointId) {
    editingPointId = pointId;
    const point = currentProject.points.find(p => p.id === pointId);
    if (!point) return;

    document.getElementById('editPointTitle').value = point.title;
    document.getElementById('editPointComment').value = point.comment;
    document.getElementById('editPointStatus').value = point.status;

    // Load existing photos into edit pending array
    editPendingPhotos = [...getPointPhotos(point)];
    renderPhotoPreviewGrid('editPhotoPreviews', editPendingPhotos, true);

    document.getElementById('editPointModal').classList.add('active');
}

/**
 * Save changes to an existing point.
 * Updates status history if status changed.
 */
async function updatePoint() {
    const point = currentProject.points.find(p => p.id === editingPointId);
    if (!point) return;

    const newStatus = document.getElementById('editPointStatus').value;
    const oldStatus = point.status;

    point.title = document.getElementById('editPointTitle').value.trim();
    point.comment = document.getElementById('editPointComment').value.trim();
    point.status = newStatus;

    // Track status changes in history
    if (oldStatus !== newStatus) {
        if (!point.statusHistory) {
            point.statusHistory = [{
                status: oldStatus,
                date: point.createdAt,
                user: 'Admin'
            }];
        }
        point.statusHistory.push({
            status: newStatus,
            date: new Date().toISOString(),
            user: 'Admin',
            previousStatus: oldStatus
        });
    }

    // Update photos
    point.photos = [...editPendingPhotos];
    point.photo = editPendingPhotos[0] || null;  // Legacy compat

    await saveProject(currentProject);
    closeModal('editPointModal');
    renderMapMarkers();
    renderPointsList();
    updateProjectStats();
}

/**
 * Delete the currently edited point.
 */
async function deletePoint() {
    if (!confirm('Voulez-vous vraiment supprimer ce point ?')) return;

    currentProject.points = currentProject.points.filter(p => p.id !== editingPointId);
    await saveProject(currentProject);

    closeModal('editPointModal');
    renderMapMarkers();
    renderPointsList();
    updatePointsCount();
    updateProjectStats();
}

/**
 * Quick-set point status from the points panel status buttons.
 * Updates status history and refreshes the UI.
 * 
 * @param {string} pointId - ID of the point
 * @param {string} newStatus - New status ('todo'|'progress'|'done')
 */
async function setPointStatus(pointId, newStatus) {
    const point = currentProject.points.find(p => p.id === pointId);
    if (!point || point.status === newStatus) return;

    const oldStatus = point.status;
    point.status = newStatus;

    if (!point.statusHistory) {
        point.statusHistory = [];
    }
    point.statusHistory.push({
        status: newStatus,
        date: new Date().toISOString(),
        user: 'Admin',
        previousStatus: oldStatus
    });

    await saveProject(currentProject);
    renderMapMarkers();
    renderPointsList();
    updateProjectStats();
}

/**
 * Reset the new point form to clean state.
 */
function resetPointForm() {
    document.getElementById('pointTitle').value = '';
    document.getElementById('pointComment').value = '';
    document.getElementById('pointStatus').value = 'todo';
    document.getElementById('pointAddress').value = '';
    document.getElementById('photoInput').value = '';
    document.getElementById('photoPreviews').innerHTML = '';
    pendingPhotos = [];
}
