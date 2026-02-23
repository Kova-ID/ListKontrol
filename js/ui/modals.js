/**
 * ListKontrol - Modal Management
 * ==============================
 * 
 * Centralized modal dialog open/close logic.
 * Modals use CSS class toggling (.active) rather than display property
 * to enable CSS transitions (fadeIn, slideUp).
 * 
 * Special behavior: Closing the new point modal also cleans up
 * the temporary map marker, preventing orphaned markers.
 */

/**
 * Close a modal dialog by its ID.
 * Also handles cleanup for specific modals (e.g., removing temp markers).
 * 
 * @param {string} modalId - The DOM id of the modal to close
 */
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');

    // Clean up temporary marker when cancelling new point creation
    // Without this, a yellow pulsing marker would remain on the map
    if (modalId === 'newPointModal' && currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
        currentLatLng = null;
    }
}

/**
 * Show the new project creation modal.
 */
function showNewProjectModal() {
    document.getElementById('newProjectModal').classList.add('active');
}

/**
 * Show the new point creation modal.
 * Called after the user clicks on the map to place a point.
 */
function showNewPointModal() {
    document.getElementById('newPointModal').classList.add('active');
}

/**
 * Show the archives list modal.
 * Renders the current archives before displaying.
 */
function showArchivesModal() {
    renderArchivesList();
    document.getElementById('archivesModal').classList.add('active');
}

/**
 * Show the sync import modal.
 * Used to import changes from interactive reports back into the app.
 */
function showSyncImportModal() {
    document.getElementById('syncImportModal').classList.add('active');
}
