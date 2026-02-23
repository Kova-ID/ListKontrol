/**
 * ListKontrol - Application Entry Point
 * =======================================
 * Load order: This file must be loaded LAST (depends on all other modules).
 */

// === Global Application State ===
let map = null;
let currentProject = null;
let projects = [];
let currentMarker = null;
let currentLatLng = null;
let markers = [];
let editingPointId = null;
let archives = [];
let reportGenerationCancelled = false;

// === Initialization ===
async function initApp() {
    await loadProjects();
    await loadArchives();
    // Update archive count badge directly (safe - no dependency on load order)
    var archiveCountEl = document.getElementById('archiveCount');
    if (archiveCountEl) archiveCountEl.textContent = archives.length;
    initMap();
    renderProjects();
    cleanExpiredArchives();
    // Initialize cloud sync (non-blocking — app works without it)
    if (typeof initCloud === 'function') {
        initCloud().catch(e => console.warn('☁️ Cloud init skipped:', e.message));
    }
    console.log('ListKontrol Alpha 0.7.0 initialized');
}

document.addEventListener('DOMContentLoaded', initApp);

// === Report Format Selection ===
// Option 2 is the NEW interactive report (key feature of 0.6.0)
async function generateReport() {
    if (!currentProject || currentProject.points.length === 0) {
        alert('Aucun point a exporter pour ce projet');
        return;
    }

    const format = prompt(
        'Choisissez le format de rapport :\n\n' +
        '1 - Rapport HTML (statique, pour impression)\n' +
        '2 - Rapport HTML INTERACTIF (modifiable par entreprise)\n' +
        '3 - Fichier CSV/Excel\n' +
        '4 - Fichier texte simple\n\n' +
        'Entrez 1, 2, 3 ou 4 :'
    );

    if (format === '1' || format === '2') {
        const mapLayer = prompt(
            'Quel fond de carte ?\n\n1 - Carte standard\n2 - Satellite\n\nEntrez 1 ou 2 :'
        );
        const layerChoice = mapLayer === '2' ? 'satellite' : 'standard';

        if (format === '1') {
            await generateHTMLReportWithMaps(layerChoice, 19);
        } else {
            await generateInteractiveReport(layerChoice, 19);
        }
    } else if (format === '3') {
        await generateExcelReport();
    } else if (format === '4') {
        generateTextReport();
    } else if (format !== null) {
        alert('Format invalide. Choisissez 1, 2, 3 ou 4');
    }
}

// === Report Progress UI ===
function showReportProgress(current, total, detail) {
    document.getElementById('reportProgress').style.display = 'block';
    document.getElementById('reportProgressBackdrop').style.display = 'block';
    document.getElementById('reportProgressText').textContent = 'Point ' + current + '/' + total;
    document.getElementById('reportProgressDetail').textContent = detail;
    document.getElementById('reportProgressBar').style.width = ((current / total) * 100) + '%';
}

function hideReportProgress() {
    document.getElementById('reportProgress').style.display = 'none';
    document.getElementById('reportProgressBackdrop').style.display = 'none';
}

function cancelReportGeneration() {
    if (confirm('Voulez-vous vraiment annuler la generation du rapport ?')) {
        reportGenerationCancelled = true;
        hideReportProgress();
    }
}

// === Modal Background Click to Close ===
document.querySelectorAll('.modal').forEach(function(modal) {
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// === Mobile Menu Toggle ===
function toggleMobileMenu() {
    document.querySelector('.sidebar').classList.toggle('mobile-open');
}

// === Geolocation ===
// Requires HTTPS - discovered during Alpha 0.5.0 field testing.
// Browsers block geolocation on non-secure origins for privacy.
function centerOnMyLocation() {
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        alert(
            'HTTPS REQUIS POUR LA GEOLOCALISATION\n\n' +
            'Solutions :\n' +
            '1. Cliquez directement sur la carte\n' +
            '2. Deployez sur GitHub Pages (HTTPS auto)'
        );
        return;
    }

    if (!navigator.geolocation) {
        alert('La geolocalisation n\'est pas supportee par votre navigateur');
        return;
    }

    var button = event.target;
    var originalText = button.textContent;
    button.textContent = 'Localisation...';
    button.disabled = true;

    navigator.geolocation.getCurrentPosition(
        function(position) {
            var lat = position.coords.latitude;
            var lng = position.coords.longitude;

            map.setView([lat, lng], 18);

            var myLocationIcon = L.divIcon({
                className: 'my-location-marker',
                html: '<div style="background:#3b82f6;color:white;width:44px;height:44px;border-radius:50%;border:4px solid white;box-shadow:0 4px 12px rgba(59,130,246,0.5);display:flex;align-items:center;justify-content:center;font-size:24px;animation:pulse 2s infinite;">&#x1F4CD;</div>',
                iconSize: [44, 44],
                iconAnchor: [22, 22]
            });

            var myMarker = L.marker([lat, lng], { icon: myLocationIcon })
                .addTo(map)
                .bindPopup('Vous etes ici<br><small>Precision: +/-' + position.coords.accuracy.toFixed(0) + 'm</small>')
                .openPopup();

            // Remove after 10 seconds to keep map clean
            setTimeout(function() { map.removeLayer(myMarker); }, 10000);

            button.textContent = originalText;
            button.disabled = false;
        },
        function(error) {
            var msg = '';
            switch(error.code) {
                case error.PERMISSION_DENIED: msg = 'Autorisation refusee'; break;
                case error.POSITION_UNAVAILABLE: msg = 'Position indisponible'; break;
                case error.TIMEOUT: msg = 'Delai depasse'; break;
                default: msg = 'Erreur de geolocalisation';
            }
            alert(msg);
            button.textContent = originalText;
            button.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// Close mobile menu when clicking outside
document.addEventListener('click', function(e) {
    var sidebar = document.querySelector('.sidebar');
    var menuToggle = document.querySelector('.menu-toggle');

    if (window.innerWidth <= 768 &&
        sidebar.classList.contains('mobile-open') &&
        !sidebar.contains(e.target) &&
        !menuToggle.contains(e.target)) {
        sidebar.classList.remove('mobile-open');
    }
});
