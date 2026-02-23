/**
 * ListKontrol - Core Helper Utilities
 * ===================================
 * 
 * Robust async helpers that prevent infinite Promise hangs.
 * These are critical for report generation where map tile loading,
 * screenshot capture, and image processing can stall indefinitely.
 * 
 * Why these exist:
 * - Leaflet tile loading has no guaranteed completion callback
 * - html2canvas can hang on CORS-restricted tiles
 * - Image.onload never fires if src is invalid/empty
 * - Promise.race with timeouts guarantees forward progress
 */

/**
 * Race a promise against a timeout.
 * Prevents infinite waiting if an async operation never resolves.
 * 
 * @param {Promise} promise - The operation to race
 * @param {number} ms - Timeout in milliseconds
 * @param {string} label - Description for error messages
 * @returns {Promise} Resolves with the promise result or rejects on timeout
 */
function withTimeout(promise, ms, label = 'operation') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
        )
    ]);
}

/**
 * Load an image element with guaranteed resolution.
 * Standard img.onload can hang forever if the src is broken.
 * This wraps it with a timeout for safety.
 * 
 * @param {string} src - Image source URL or data URI
 * @param {number} ms - Timeout in milliseconds (default: 3000)
 * @returns {Promise<HTMLImageElement>} Loaded image element
 */
function loadImage(src, ms = 3000) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        const timeoutId = setTimeout(() => {
            img.onload = img.onerror = null;
            reject(new Error(`Image load timeout (${ms}ms)`));
        }, ms);

        img.onload = () => {
            clearTimeout(timeoutId);
            img.onload = img.onerror = null;
            resolve(img);
        };

        img.onerror = () => {
            clearTimeout(timeoutId);
            img.onload = img.onerror = null;
            reject(new Error('Image load error'));
        };

        img.src = src;
    });
}

/**
 * Wait for Leaflet map tiles to finish loading.
 * Uses the map 'load' event with a safety timeout fallback,
 * because tiles may already be cached (event won't fire) or
 * may fail to load on spotty mobile connections.
 * 
 * @param {number} timeout - Maximum wait time in ms (default: 2000)
 * @returns {Promise<void>}
 */
function waitForTiles(timeout = 2000) {
    return new Promise(resolve => {
        let loaded = false;

        const onLoad = () => {
            if (!loaded) {
                loaded = true;
                map.off('load', onLoad);
                resolve();
            }
        };

        map.once('load', onLoad);
        // Safety: resolve after timeout even if tiles haven't loaded
        setTimeout(onLoad, timeout);
    });
}

/**
 * Compress an image file to JPEG with max width constraint.
 * Reduces storage usage for photos taken on modern smartphones
 * (which can be 4000x3000+ pixels at 5MB+).
 * 
 * Target: 1200px max width, 70% JPEG quality ≈ 100-200KB per photo.
 * This is a good balance between visual quality for reports and storage efficiency.
 * 
 * @param {File} file - The image file from input[type=file]
 * @returns {Promise<string>} Compressed image as data URL
 */
function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');

                // Max 1200px wide - sufficient for HTML reports while keeping file size down
                let width = img.width;
                let height = img.height;
                const maxWidth = 1200;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // 70% JPEG quality: good visual quality, ~80% size reduction
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);

                console.log('Image compressed:',
                    (e.target.result.length / 1024).toFixed(0), 'KB →',
                    (compressedDataUrl.length / 1024).toFixed(0), 'KB'
                );

                resolve(compressedDataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
