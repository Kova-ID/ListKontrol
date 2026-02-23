/**
 * ListKontrol - Map Module
 * ========================
 * 
 * Handles Leaflet map initialization, tile layers, and marker management.
 * 
 * Map layers:
 * - OpenStreetMap: Default street map, good for address identification
 * - Esri Satellite: Aerial imagery, useful for terrain/construction context
 * 
 * Marker design:
 * - Numbered circles with status-based colors (yellow/blue/green)
 * - "Travaux ici" label uses high z-index to always appear on top
 * - Temporary pulse marker for new point placement
 * 
 * The screenshoter plugin (leaflet-simple-map-screenshoter) is initialized
 * here for fast report capture. It renders the map to canvas directly,
 * which is 4-5x faster than html2canvas.
 */

/**
 * Initialize the Leaflet map with layers and controls.
 * Called once on app startup from initApp().
 * 
 * Default view: Paris (48.8566, 2.3522) at zoom 13.
 * This is overridden when a project with points is selected.
 */
function initMap() {
    map = L.map('map', {
        maxZoom: 19  // Level 19 is the highest with reliable tile coverage
    }).setView([48.8566, 2.3522], 13);

    // OpenStreetMap: Standard street map layer
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    });

    // Esri World Imagery: Satellite/aerial photography
    // Chosen over Google Maps tiles because: free, no API key, reliable, global coverage
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri, Maxar, Earthstar Geographics',
        maxZoom: 19
    });

    // Add default layer
    osmLayer.addTo(map);

    // Layer switcher control (top-right corner)
    const baseLayers = {
        "🗺️ Carte standard": osmLayer,
        "🛰️ Satellite": satelliteLayer
    };
    L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);

    // Store layers globally for report capture (capture.js needs to switch layers)
    window.mapLayers = {
        standard: osmLayer,
        satellite: satelliteLayer
    };

    // Initialize screenshoter for fast report generation
    // This renders the map canvas directly, much faster than html2canvas
    try {
        const screenshoter = L.simpleMapScreenshoter({
            hidden: true  // Don't show the screenshot button on the map
        }).addTo(map);
        console.log('✅ Map screenshoter initialized');
        window.mapScreenshoter = screenshoter;
    } catch (e) {
        console.warn('⚠️ Screenshoter unavailable, html2canvas fallback will be used');
        window.mapScreenshoter = null;
    }

    // Click handler: Place a new point where the user clicks
    map.on('click', function(e) {
        if (currentProject) {
            currentLatLng = e.latlng;

            // Remove previous temporary marker
            if (currentMarker) {
                map.removeLayer(currentMarker);
            }

            // Temporary pulsing marker to show where the point will be placed
            // High z-index (10000) ensures it's visible above existing points
            const icon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: #f59e0b; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); animation: pulse 1s infinite;"></div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            currentMarker = L.marker([e.latlng.lat, e.latlng.lng], {
                icon: icon,
                zIndexOffset: 10000
            }).addTo(map);

            // Reverse geocode to get street address
            getAddressFromLatLng(e.latlng.lat, e.latlng.lng);
            showNewPointModal();
        } else {
            alert('Veuillez d\'abord sélectionner un projet');
        }
    });
}

/**
 * Render all markers for the current project on the map.
 * Clears existing markers and recreates them with current status colors.
 * 
 * Marker colors by status:
 * - todo (yellow #f59e0b): Work not started
 * - progress (blue #3b82f6): Work in progress
 * - done (green #10b981): Work completed
 */
function renderMapMarkers() {
    // Clear all existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    if (!currentProject) return;

    currentProject.points.forEach(point => {
        const color = point.status === 'done' ? '#10b981' :
                     point.status === 'progress' ? '#3b82f6' : '#f59e0b';

        // Numbered circle marker with status color
        const icon = L.divIcon({
            className: 'custom-marker',
            html: `
                <div style="
                    background: ${color}; 
                    color: white;
                    width: 36px; 
                    height: 36px; 
                    border-radius: 50%; 
                    border: 3px solid white; 
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 16px;
                ">${point.number || '?'}</div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });

        const marker = L.marker([point.lat, point.lng], { icon })
            .addTo(map)
            .bindPopup(createPopupContent(point), {
                className: 'custom-popup',
                maxWidth: 240
            });

        marker.pointId = point.id;
        marker.on('click', () => selectPointOnMap(point.id));
        markers.push(marker);
    });
}

/**
 * Generate HTML content for a point's map popup.
 * Shows status badge, title, comment preview, photo thumbnail, and edit button.
 * 
 * @param {Object} point - The point data object
 * @returns {string} HTML string for Leaflet popup
 */
function createPopupContent(point) {
    const statusBadge = point.status === 'done' ? 'badge-done' :
                       point.status === 'progress' ? 'badge-progress' : 'badge-todo';
    const statusText = point.status === 'done' ? 'Terminé' :
                      point.status === 'progress' ? 'En cours' : 'À faire';

    // Support both legacy single photo and new multi-photo format
    const firstPhoto = point.photos ? point.photos[0] : point.photo;

    return `
        <div class="popup-content">
            <div class="popup-status">
                <span class="badge ${statusBadge}">${statusText}</span>
            </div>
            <strong>${point.title}</strong>
            <div class="popup-comment">${point.comment}</div>
            ${firstPhoto ? `<img src="${firstPhoto}" class="popup-image">` : ''}
            <button class="btn btn-secondary btn-sm" onclick="editPointModal('${point.id}')" style="width: 100%;">
                ✏️ Modifier
            </button>
        </div>
    `;
}

/**
 * Highlight a point in the points panel when its marker is clicked.
 * Scrolls the panel to show the selected point.
 * 
 * @param {string} pointId - ID of the point to highlight
 */
function selectPointOnMap(pointId) {
    document.querySelectorAll('.point-item').forEach(item => {
        item.classList.remove('selected');
    });

    const pointElement = document.querySelector(`[data-point-id="${pointId}"]`);
    if (pointElement) {
        pointElement.classList.add('selected');
        pointElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * Clear all markers from the map.
 * Used when deselecting a project or deleting the current project.
 */
function clearMap() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

/**
 * Reverse geocode coordinates to a street address.
 * Uses Nominatim (OpenStreetMap's geocoding service).
 * 
 * Why Nominatim: Free, no API key, no usage limits for low-volume use.
 * Falls back to raw coordinates if the service is unavailable.
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 */
async function getAddressFromLatLng(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        document.getElementById('pointAddress').value = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (error) {
        document.getElementById('pointAddress').value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
}
