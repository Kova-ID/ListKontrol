/**
 * ListKontrol - Map Capture Module
 * =================================
 * 
 * Handles map screenshot capture for HTML report generation.
 * Two capture methods are supported:
 * 
 * 1. leaflet-simple-map-screenshoter (preferred):
 *    - Renders the Leaflet canvas directly to an image
 *    - ~4-5x faster than html2canvas
 *    - Requires the screenshoter plugin to be loaded
 * 
 * 2. html2canvas (fallback):
 *    - Captures the DOM element as a screenshot
 *    - Slower but works everywhere
 *    - May miss some tile layers due to CORS restrictions
 * 
 * Critical safety: All async operations use withTimeout() to prevent
 * infinite hangs. If a capture fails, it returns null instead of blocking
 * the entire report generation. The finally block always restores the
 * map state (center, zoom, layers) even on error.
 */

/**
 * Capture a zoomed-in map screenshot centered on a specific point.
 * Used for individual point detail views in the HTML report.
 * 
 * Process:
 * 1. Save current map state (center, zoom, layers)
 * 2. Switch to the requested tile layer (standard/satellite)
 * 3. Center on the point at high zoom (19)
 * 4. Add a "TRAVAUX ICI" marker
 * 5. Capture screenshot
 * 6. Restore original map state
 * 
 * @param {Object} point - Point object with lat, lng, title
 * @param {string} layerType - 'standard' or 'satellite'
 * @param {number} zoomLevel - Zoom level for capture (default: 19)
 * @returns {Promise<string|null>} Base64 JPEG data URL, or null on failure
 */
async function captureMapForPoint(point, layerType = 'standard', zoomLevel = 19) {
    console.log(`➡️ Starting capture for point: ${point.title}`);

    // Save original state for restoration in finally block
    const originalCenter = map.getCenter();
    const originalZoom = map.getZoom();

    // Store and remove current tile layers
    const savedLayers = [];
    map.eachLayer(layer => {
        if (layer instanceof L.TileLayer) {
            savedLayers.push(layer);
        }
    });
    savedLayers.forEach(layer => map.removeLayer(layer));

    // Add the requested capture layer
    const captureLayer = window.mapLayers[layerType];
    captureLayer.addTo(map);

    // Center on point with no animation (faster for batch capture)
    map.setView([point.lat, point.lng], zoomLevel, { animate: false });
    map.invalidateSize();

    // Wait for tiles to fully load before capturing
    // 800ms was too short and caused grey/missing tiles (field-tested)
    await new Promise(resolve => {
        let resolved = false;
        const done = () => { if (!resolved) { resolved = true; resolve(); } };
        
        // Primary: listen for the 'load' event on the tile layer
        captureLayer.once('load', () => setTimeout(done, 300));
        
        // Safety timeout: proceed after 3s even if tiles didn't fully load
        setTimeout(done, 3000);
    });

    // Create the "TRAVAUX ICI" marker
    // High z-index ensures it renders above all map elements
    const captureIcon = L.divIcon({
        className: 'capture-marker',
        html: `
            <div style="position:relative;z-index:10000;">
                <div style="background:#f97316;width:50px;height:50px;border-radius:50%;border:5px solid white;box-shadow:0 6px 16px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:28px;">📍</div>
                <div style="position:absolute;bottom:-30px;left:50%;transform:translateX(-50%);background:#f97316;color:white;padding:6px 12px;border-radius:6px;font-weight:bold;font-size:14px;box-shadow:0 3px 10px rgba(0,0,0,.4);border:2px solid white;z-index:10001;">🎯 TRAVAUX ICI</div>
            </div>
        `,
        iconSize: [50, 50],
        iconAnchor: [25, 25]
    });

    let captureMarker = null;
    let imageData = null;

    try {
        captureMarker = L.marker([point.lat, point.lng], {
            icon: captureIcon,
            zIndexOffset: 10000
        }).addTo(map);

        // Brief delay for marker to render in the DOM
        await new Promise(resolve => setTimeout(resolve, 200));

        // Attempt fast capture with screenshoter plugin
        if (window.mapScreenshoter) {
            try {
                console.log('📸 Fast capture with screenshoter');

                const screenshot = await withTimeout(
                    window.mapScreenshoter.takeScreen('image', { caption: null }),
                    6000,
                    'screenshoter.takeScreen'
                );

                const img = await loadImage(screenshot, 4000);

                // Convert to JPEG for smaller file size
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                imageData = canvas.toDataURL('image/jpeg', 0.85);
                console.log('✅ Captured (screenshoter):', point.title);

            } catch (err) {
                console.warn('⚠️ Screenshoter failed, falling back to html2canvas:', err.message);
                // Fall through to html2canvas fallback below
                imageData = await captureWithHtml2canvas();
            }
        } else {
            // No screenshoter available, use html2canvas directly
            imageData = await captureWithHtml2canvas();
        }

    } catch (error) {
        console.error('❌ Capture error for', point.title, ':', error.message);
        imageData = null;  // Return null instead of hanging

    } finally {
        // CRITICAL: Always clean up, even on error
        // Without this, the map would be stuck on the wrong view
        if (captureMarker) {
            try { map.removeLayer(captureMarker); } catch (e) {}
        }

        try { map.removeLayer(captureLayer); } catch (e) {}

        savedLayers.forEach(layer => {
            try { layer.addTo(map); } catch (e) {}
        });

        map.setView(originalCenter, originalZoom, { animate: false });
    }

    return imageData;
}

/**
 * Fallback capture method using html2canvas.
 * Slower but more compatible. Used when screenshoter plugin fails.
 * 
 * @returns {Promise<string|null>} Base64 JPEG data URL
 */
async function captureWithHtml2canvas() {
    try {
        console.log('📸 Capture with html2canvas fallback');
        const mapElement = document.getElementById('map');
        const canvas = await withTimeout(
            html2canvas(mapElement, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#f0f0f0',
                scale: 2,      // 2x for retina quality
                logging: false  // Suppress verbose html2canvas logs
            }),
            12000,
            'html2canvas'
        );

        return canvas.toDataURL('image/jpeg', 0.90);
    } catch (err) {
        console.error('❌ html2canvas failed:', err.message);
        return null;
    }
}

/**
 * Capture an overview map showing all project points.
 * Uses fitBounds to auto-zoom to include all points with padding.
 * The existing numbered markers from renderMapMarkers() are captured as-is.
 * 
 * @param {Array} points - Array of point objects with lat, lng
 * @param {string} layerType - 'standard' or 'satellite'
 * @returns {Promise<string|null>} Base64 JPEG data URL
 */
async function captureOverviewMap(points, layerType = 'standard') {
    return new Promise((resolve) => {
        const originalCenter = map.getCenter();
        const originalZoom = map.getZoom();

        // Swap to requested tile layer
        const currentLayers = [];
        map.eachLayer(layer => {
            if (layer instanceof L.TileLayer) {
                currentLayers.push(layer);
            }
        });
        currentLayers.forEach(layer => map.removeLayer(layer));

        const chosenLayer = window.mapLayers[layerType];
        if (chosenLayer) chosenLayer.addTo(map);

        // Fit map to show all points with padding
        const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
        map.invalidateSize();

        // Wait for tiles to fully load using the 'load' event
        // The 'load' event fires when all visible tiles have finished loading
        let captured = false;

        const doCapture = async () => {
            if (captured) return;
            captured = true;

            // Extra buffer after tiles report loaded
            await new Promise(r => setTimeout(r, 500));

            try {
                const mapElement = document.getElementById('map');
                const canvas = await html2canvas(mapElement, {
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#f0f0f0',
                    scale: 2,
                    logging: false
                });

                const imageData = canvas.toDataURL('image/jpeg', 0.90);
                console.log('Overview map captured');

                // Restore
                if (chosenLayer) try { map.removeLayer(chosenLayer); } catch (e) {}
                currentLayers.forEach(layer => { try { layer.addTo(map); } catch (e) {} });
                map.setView(originalCenter, originalZoom, { animate: false });

                resolve(imageData);
            } catch (error) {
                console.error('Overview capture error:', error);
                if (chosenLayer) try { map.removeLayer(chosenLayer); } catch (e) {}
                currentLayers.forEach(layer => { try { layer.addTo(map); } catch (e) {} });
                map.setView(originalCenter, originalZoom, { animate: false });
                resolve(null);
            }
        };

        // Listen for tile load completion
        if (chosenLayer) {
            chosenLayer.on('load', doCapture);
        }

        // Safety timeout: capture anyway after 5 seconds
        setTimeout(doCapture, 5000);
    });
}

/**
 * Sort points by geographic proximity using nearest-neighbor algorithm.
 * Used to optimize capture order, reducing map pan distance between points.
 * 
 * Algorithm: Greedy nearest-neighbor starting from the first point.
 * Not optimal (that would be TSP), but good enough and O(n²).
 * 
 * @param {Array} points - Array of point objects with lat, lng
 * @returns {Array} Points sorted by proximity
 */
function sortPointsByProximity(points) {
    if (points.length <= 1) return points;

    const sorted = [];
    const remaining = [...points];

    sorted.push(remaining.shift());

    while (remaining.length > 0) {
        const lastPoint = sorted[sorted.length - 1];
        let closestIndex = 0;
        let minDistance = Infinity;

        for (let i = 0; i < remaining.length; i++) {
            // Euclidean distance on lat/lng - adequate for nearby points
            const distance = Math.sqrt(
                Math.pow(remaining[i].lat - lastPoint.lat, 2) +
                Math.pow(remaining[i].lng - lastPoint.lng, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = i;
            }
        }

        sorted.push(remaining.splice(closestIndex, 1)[0]);
    }

    sorted.forEach((point, index) => {
        point.sortedNumber = index + 1;
    });

    return sorted;
}
