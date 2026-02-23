/**
 * ListKontrol - Interactive HTML Report Generator
 * ================================================
 * 
 * THIS IS THE KEY FEATURE OF ALPHA 0.6.0
 * 
 * Generates a self-contained HTML file that recipients can:
 * 1. View all points with maps and photos (same as standard report)
 * 2. Change point statuses directly in the report
 * 3. Add photos to points
 * 4. Add comments/notes
 * 5. Export all changes as a .json sync file
 * 
 * The sync file can then be imported back into ListKontrol to apply
 * all modifications with full traceability (who changed what, when).
 * 
 * WHY THIS APPROACH:
 * - No authentication needed (just email/share the HTML file)
 * - Works 100% offline (no server required)
 * - Simple workflow: send HTML → get back JSON → import
 * - Enterprises can work without installing anything
 * - Full audit trail of all changes
 * 
 * ARCHITECTURE:
 * The generated HTML file embeds:
 * - All point data as a JSON blob in a <script> tag
 * - All photos as base64 inline images
 * - All map screenshots as base64 inline images
 * - A complete JavaScript application for interaction
 * - CSS for the interactive UI (status buttons, upload areas, etc.)
 * 
 * Changes are tracked in-memory within the report and can be exported
 * as a JSON file for re-import into the main app.
 */

/**
 * Generate an interactive HTML report for the current project.
 * This is the main entry point, called from the report format selection.
 * 
 * @param {string} layerType - Map tile layer ('standard' or 'satellite')
 * @param {number} zoomLevel - Map zoom level for point captures
 */
async function generateInteractiveReport(layerType = 'standard', zoomLevel = 19) {
    reportGenerationCancelled = false;

    const button = document.querySelector('#projectTools button[onclick="generateReport()"]');
    const originalText = button.textContent;
    button.textContent = '⏳ Génération...';
    button.disabled = true;

    try {
        const points = [...currentProject.points];
        const projectData = {
            id: currentProject.id,
            name: currentProject.name,
            description: currentProject.description,
            generatedAt: new Date().toISOString(),
            generatedBy: 'Admin',
            points: []
        };

        // Capture overview map
        console.log('🗺️ Capturing overview map...');
        showReportProgress(0, points.length + 1, 'Capture de la carte générale...');
        const overviewMapImage = await captureOverviewMap(points, layerType);

        // Capture individual point maps
        for (let i = 0; i < points.length; i++) {
            if (reportGenerationCancelled) {
                hideReportProgress();
                alert('❌ Génération annulée');
                return;
            }

            const point = points[i];
            showReportProgress(i + 1, points.length + 1, `Capture du point ${point.number}: ${point.title}`);

            const mapImage = await captureMapForPoint(point, layerType, zoomLevel);

            projectData.points.push({
                id: point.id,
                number: point.number,
                title: point.title,
                comment: point.comment,
                status: point.status,
                statusHistory: point.statusHistory || [],
                address: point.address,
                lat: point.lat,
                lng: point.lng,
                photos: getPointPhotos(point),
                mapImage: mapImage,
                createdAt: point.createdAt
            });
        }

        hideReportProgress();

        // Build the self-contained interactive HTML
        const htmlReport = buildInteractiveHTML(projectData, overviewMapImage);

        // Download
        const blob = new Blob([htmlReport], { type: 'text/html;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ListK_${currentProject.name}_interactif_${Date.now()}.html`;
        link.click();

        alert(
            '✅ Rapport interactif généré !\n\n' +
            '📧 Envoyez ce fichier HTML à l\'entreprise.\n' +
            'Elle pourra modifier les statuts, ajouter des photos et des notes.\n\n' +
            '📥 Pour récupérer les modifications, importez le fichier .json\n' +
            'qu\'elle vous renverra via le bouton "📥 Importer" dans la toolbar.'
        );

    } catch (error) {
        console.error('Interactive report generation error:', error);
        hideReportProgress();
        alert('❌ Erreur: ' + error.message);
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}

/**
 * Build the complete self-contained interactive HTML string.
 * This is a large function because the HTML must include ALL code
 * needed for the interactive features (no external dependencies).
 * 
 * @param {Object} projectData - Serialized project with base64 images
 * @param {string|null} overviewMapImage - Base64 overview map image
 * @returns {string} Complete HTML document string
 */
function buildInteractiveHTML(projectData, overviewMapImage) {
    const stats = {
        todo: projectData.points.filter(p => p.status === 'todo').length,
        progress: projectData.points.filter(p => p.status === 'progress').length,
        done: projectData.points.filter(p => p.status === 'done').length
    };

    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rapport Interactif - ${projectData.name}</title>
    <style>
        /* ============================================================
           Interactive Report Styles
           Self-contained CSS for the standalone HTML report.
           No external dependencies needed.
           ============================================================ */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f8fafc;
            color: #0f172a;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
        }

        .report-card {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        h1 { 
            color: #0f172a; 
            border-bottom: 4px solid #f97316; 
            padding-bottom: 15px;
            margin-bottom: 10px;
        }

        .interactive-banner {
            background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 10px;
            margin: 20px 0 30px 0;
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 15px;
        }

        .interactive-banner strong { font-size: 17px; }

        /* Sync bar: Shows number of pending changes */
        .sync-bar {
            position: sticky;
            top: 0;
            z-index: 100;
            background: #1e293b;
            color: white;
            padding: 12px 24px;
            display: none;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .sync-bar.has-changes { display: flex; }

        .sync-bar .btn-sync {
            background: #10b981;
            color: white;
            border: none;
            padding: 8px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
        }

        .sync-bar .btn-sync:hover { background: #059669; }

        .header-info {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            padding: 25px;
            border-radius: 10px;
            margin-bottom: 30px;
            border-left: 4px solid #f97316;
        }

        .header-info h2 { margin: 0 0 15px 0; color: #0f172a; }
        .header-info p { margin: 5px 0; color: #64748b; }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin: 20px 0 30px 0;
        }

        .stat-card {
            padding: 16px;
            border-radius: 8px;
            text-align: center;
            font-weight: 600;
        }

        .stat-todo { background: #fef3c7; color: #92400e; }
        .stat-progress { background: #dbeafe; color: #1e40af; }
        .stat-done { background: #d1fae5; color: #065f46; }

        .stat-card .stat-number { font-size: 28px; display: block; }
        .stat-card .stat-label { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }

        .overview-section {
            background: #fef3c7;
            padding: 25px;
            border-radius: 10px;
            margin-bottom: 40px;
            border: 2px solid #f97316;
        }

        .overview-section h3 { margin: 0 0 15px 0; color: #92400e; }

        .overview-map {
            width: 100%;
            border-radius: 10px;
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            margin-top: 15px;
        }

        /* Point card with interactive elements */
        .point {
            background: white;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 30px;
            page-break-inside: avoid;
            transition: border-color 0.3s;
        }

        .point.modified {
            border-color: #f97316;
            box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }

        .point-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #f1f5f9;
        }

        .point-number {
            background: #f97316;
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 18px;
            margin-right: 15px;
        }

        .point-title { font-size: 20px; font-weight: bold; color: #0f172a; flex: 1; }

        .badge {
            display: inline-block;
            padding: 6px 14px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .badge-todo { background: #fef3c7; color: #92400e; }
        .badge-progress { background: #dbeafe; color: #1e40af; }
        .badge-done { background: #d1fae5; color: #065f46; }

        .meta { color: #64748b; font-size: 14px; margin: 15px 0; line-height: 1.8; }

        .gps-link {
            color: #f97316;
            text-decoration: none;
            font-weight: 600;
            padding: 4px 8px;
            background: #fff7ed;
            border-radius: 4px;
        }

        .gps-link:hover { background: #f97316; color: white; }

        .comment { margin: 15px 0; line-height: 1.6; }

        /* Status history timeline */
        .status-history {
            background: #f8fafc;
            border-left: 4px solid #3b82f6;
            padding: 16px 20px;
            margin: 20px 0;
            border-radius: 8px;
        }
        .status-history h4 { color: #0f172a; margin-bottom: 10px; font-size: 14px; }
        .status-entry { display: flex; gap: 12px; align-items: center; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
        .status-entry:last-child { border-bottom: none; }
        .status-entry-label { font-weight: 600; min-width: 120px; }
        .status-entry-date { color: #64748b; }
        .status-entry-user { color: #94a3b8; font-style: italic; }

        /* Images grid */
        .images {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            margin-top: 20px;
        }

        .image-container { border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .image-container img { width: 100%; display: block; }
        .image-label { padding: 10px; text-align: center; font-size: 13px; color: #64748b; background: #f8fafc; font-weight: 600; }

        /* ============================================================
           INTERACTIVE CONTROLS - New in 0.6.0
           These elements allow the report recipient to make changes
           ============================================================ */

        .interactive-section {
            background: #fffbeb;
            border: 2px dashed #f59e0b;
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
        }

        .interactive-section h4 {
            color: #92400e;
            margin-bottom: 12px;
            font-size: 15px;
        }

        /* Status toggle buttons */
        .status-buttons {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
        }

        .status-btn {
            padding: 10px 20px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            background: white;
            transition: all 0.2s;
        }

        .status-btn:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .status-btn.active-todo { border-color: #f59e0b; background: #fef3c7; }
        .status-btn.active-progress { border-color: #3b82f6; background: #dbeafe; }
        .status-btn.active-done { border-color: #10b981; background: #d1fae5; }

        /* Photo upload area */
        .add-photo-area {
            border: 2px dashed #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
            margin-bottom: 12px;
        }

        .add-photo-area:hover { border-color: #f97316; background: #fff7ed; }

        .added-photos-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
            gap: 8px;
            margin-top: 8px;
        }

        .added-photos-grid img {
            width: 100%;
            aspect-ratio: 1;
            object-fit: cover;
            border-radius: 6px;
        }

        /* Notes/comments textarea */
        .add-note-area textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-family: inherit;
            font-size: 14px;
            resize: vertical;
            min-height: 80px;
        }

        .add-note-area textarea:focus {
            outline: none;
            border-color: #f97316;
        }

        .added-notes {
            margin-top: 12px;
        }

        .note-item {
            background: white;
            border-left: 3px solid #f97316;
            padding: 10px 14px;
            margin-bottom: 8px;
            border-radius: 0 6px 6px 0;
            font-size: 14px;
        }

        .note-item .note-date {
            font-size: 12px;
            color: #94a3b8;
            margin-top: 4px;
        }

        .modified-badge {
            display: inline-block;
            background: #f97316;
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            margin-left: 8px;
        }

        /* Footer */
        .report-footer {
            text-align: center;
            padding: 30px;
            color: #94a3b8;
            font-size: 13px;
            border-top: 2px solid #e2e8f0;
            margin-top: 40px;
        }

        @media (max-width: 600px) {
            .report-card { padding: 20px; }
            .stats-grid { grid-template-columns: 1fr; }
            .images { grid-template-columns: 1fr; }
            .status-buttons { flex-direction: column; }
        }
    </style>
</head>
<body>

<!-- Sync bar: Appears when changes are made -->
<div class="sync-bar" id="syncBar">
    <span>🔄 <strong id="changeCount">0</strong> modification(s) en attente</span>
    <button class="btn-sync" onclick="exportSyncFile()">💾 Télécharger fichier de synchronisation</button>
</div>

<div class="container">
    <div class="report-card">
        <h1>📋 Rapport de Suivi - ${projectData.name}</h1>

        <div class="interactive-banner">
            <span style="font-size: 24px;">✏️</span>
            <div>
                <strong>Rapport interactif</strong><br>
                Vous pouvez modifier les statuts, ajouter des photos et des notes directement dans ce document.
                Cliquez sur "Télécharger fichier de synchronisation" pour renvoyer vos modifications.
            </div>
        </div>

        <div class="header-info">
            <h2>📊 Informations du projet</h2>
            <p><strong>Projet:</strong> ${projectData.name}</p>
            ${projectData.description ? `<p><strong>Description:</strong> ${projectData.description}</p>` : ''}
            <p><strong>Rapport généré le:</strong> ${new Date(projectData.generatedAt).toLocaleString('fr-FR')}</p>
            <p><strong>Nombre de points:</strong> ${projectData.points.length}</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card stat-todo">
                <span class="stat-number" id="statTodo">${stats.todo}</span>
                <span class="stat-label">À faire</span>
            </div>
            <div class="stat-card stat-progress">
                <span class="stat-number" id="statProgress">${stats.progress}</span>
                <span class="stat-label">En cours</span>
            </div>
            <div class="stat-card stat-done">
                <span class="stat-number" id="statDone">${stats.done}</span>
                <span class="stat-label">Terminé</span>
            </div>
        </div>

        ${overviewMapImage ? `
        <div class="overview-section">
            <h3>🗺️ Vue d'ensemble</h3>
            <img src="${overviewMapImage}" class="overview-map" alt="Carte générale">
        </div>
        ` : ''}

        ${projectData.points.map((point, i) => {
            const statusClass = point.status === 'done' ? 'badge-done' :
                              point.status === 'progress' ? 'badge-progress' : 'badge-todo';
            const statusText = point.status === 'done' ? '✓ Terminé' :
                             point.status === 'progress' ? '⏳ En cours' : '⏸ À faire';
            const googleMapsLink = `https://www.google.com/maps?q=${point.lat},${point.lng}`;

            return `
        <div class="point" id="point-${point.id}" data-point-id="${point.id}">
            <div class="point-header">
                <div style="display: flex; align-items: center; flex: 1;">
                    <span class="point-number">${point.number}</span>
                    <div class="point-title">${point.title}</div>
                </div>
                <span class="badge ${statusClass}" id="badge-${point.id}">${statusText}</span>
            </div>

            <div class="meta">
                📍 <strong>Adresse:</strong> ${point.address}<br>
                📅 <strong>Date:</strong> ${new Date(point.createdAt).toLocaleString('fr-FR')}<br>
                🌐 <strong>GPS:</strong> <a href="${googleMapsLink}" target="_blank" class="gps-link">📍 ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)} - Ouvrir dans Maps</a>
            </div>

            ${point.statusHistory && point.statusHistory.length > 0 ? `
            <div class="status-history" id="history-${point.id}">
                <h4>📊 Historique du statut</h4>
                <div class="status-timeline">
                    ${point.statusHistory.map(entry => {
                        const label = entry.status === 'done' ? '✅ Terminé' :
                                     entry.status === 'progress' ? '⏳ En cours' : '⏸️ À faire';
                        const d = new Date(entry.date);
                        return `
                    <div class="status-entry">
                        <span class="status-entry-label">${label}</span>
                        <span class="status-entry-date">le ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</span>
                        <span class="status-entry-user">par ${entry.user}</span>
                    </div>`;
                    }).join('')}
                </div>
            </div>
            ` : ''}

            <div class="comment">
                <strong>📝 Travaux à effectuer:</strong><br>
                ${point.comment.replace(/\\n/g, '<br>')}
            </div>

            <div class="images">
                ${point.photos.map((photo, pi) => `
                <div class="image-container">
                    <img src="${photo}" alt="Photo ${pi + 1}">
                    <div class="image-label">📷 Photo ${pi + 1}</div>
                </div>
                `).join('')}
                ${point.mapImage ? `
                <div class="image-container">
                    <img src="${point.mapImage}" alt="Localisation">
                    <div class="image-label">🗺️ Localisation</div>
                </div>
                ` : ''}
            </div>

            <!-- INTERACTIVE CONTROLS -->
            <div class="interactive-section">
                <h4>✏️ Modifier ce point</h4>

                <!-- Status buttons -->
                <div class="status-buttons">
                    <button class="status-btn ${point.status === 'todo' ? 'active-todo' : ''}" 
                            onclick="changeStatus('${point.id}', 'todo')" id="btn-todo-${point.id}">
                        ⏸️ À faire
                    </button>
                    <button class="status-btn ${point.status === 'progress' ? 'active-progress' : ''}" 
                            onclick="changeStatus('${point.id}', 'progress')" id="btn-progress-${point.id}">
                        ⏳ En cours
                    </button>
                    <button class="status-btn ${point.status === 'done' ? 'active-done' : ''}" 
                            onclick="changeStatus('${point.id}', 'done')" id="btn-done-${point.id}">
                        ✅ Terminé
                    </button>
                </div>

                <!-- Photo upload -->
                <div class="add-photo-area" onclick="document.getElementById('photo-input-${point.id}').click()">
                    📷 Cliquer pour ajouter une photo
                    <input type="file" id="photo-input-${point.id}" accept="image/*" capture="environment" 
                           style="display:none" onchange="addPhoto('${point.id}', event)">
                </div>
                <div class="added-photos-grid" id="added-photos-${point.id}"></div>

                <!-- Notes -->
                <div class="add-note-area">
                    <textarea id="note-input-${point.id}" placeholder="Ajouter une note ou un commentaire..."></textarea>
                    <button class="status-btn" style="margin-top: 8px;" onclick="addNote('${point.id}')">
                        💬 Ajouter la note
                    </button>
                </div>
                <div class="added-notes" id="added-notes-${point.id}"></div>
            </div>
        </div>
        `;
        }).join('')}

        <div class="report-footer">
            <p>Rapport généré par <strong>ListKontrol</strong> Alpha 0.7.0</p>
            <p>🏗️ Outil open-source de suivi de chantiers VRD</p>
        </div>
    </div>
</div>

<script>
/**
 * ================================================================
 * INTERACTIVE REPORT - Embedded JavaScript
 * ================================================================
 * 
 * This code runs inside the generated HTML report file.
 * It manages all interactive features: status changes, photo uploads,
 * notes, and sync file export.
 * 
 * Changes are stored in the 'changes' object and can be exported
 * as a JSON file for import back into ListKontrol.
 */

// Project data embedded at generation time
var projectData = ${JSON.stringify({
    id: projectData.id,
    name: projectData.name,
    generatedAt: projectData.generatedAt,
    generatedBy: projectData.generatedBy,
    points: projectData.points.map(p => ({
        id: p.id,
        number: p.number,
        title: p.title,
        status: p.status,
        statusHistory: p.statusHistory
    }))
})};

// Track all modifications made in this report
var changes = {};
var editorName = null;

/**
 * Prompt for the editor's name (first interaction only).
 * Used for traceability in the sync file.
 */
function getEditorName() {
    if (!editorName) {
        editorName = prompt(
            "Veuillez entrer votre nom ou celui de votre entreprise.\\n" +
            "Ce nom apparaîtra dans l'historique des modifications."
        ) || 'Utilisateur externe';
    }
    return editorName;
}

/**
 * Initialize or get the changes object for a point.
 */
function getPointChanges(pointId) {
    if (!changes[pointId]) {
        changes[pointId] = {
            statusChange: null,
            addedPhotos: [],
            addedNotes: []
        };
    }
    return changes[pointId];
}

/**
 * Update the sync bar to show number of pending changes.
 */
function updateSyncBar() {
    var count = 0;
    for (var id in changes) {
        var c = changes[id];
        if (c.statusChange) count++;
        count += c.addedPhotos.length;
        count += c.addedNotes.length;
    }

    document.getElementById('changeCount').textContent = count;
    var bar = document.getElementById('syncBar');
    if (count > 0) {
        bar.classList.add('has-changes');
    } else {
        bar.classList.remove('has-changes');
    }
}

/**
 * Update stats display.
 */
function updateStats() {
    var todo = 0, progress = 0, done = 0;
    projectData.points.forEach(function(p) {
        var c = changes[p.id];
        var status = (c && c.statusChange) ? c.statusChange.newStatus : p.status;
        if (status === 'todo') todo++;
        else if (status === 'progress') progress++;
        else if (status === 'done') done++;
    });
    document.getElementById('statTodo').textContent = todo;
    document.getElementById('statProgress').textContent = progress;
    document.getElementById('statDone').textContent = done;
}

/**
 * Change the status of a point.
 * Updates the visual badge, button states, and tracks the change.
 */
function changeStatus(pointId, newStatus) {
    var name = getEditorName();
    var c = getPointChanges(pointId);

    // Find original status
    var point = projectData.points.find(function(p) { return p.id === pointId; });
    var originalStatus = point.status;

    c.statusChange = {
        previousStatus: originalStatus,
        newStatus: newStatus,
        date: new Date().toISOString(),
        user: name
    };

    // Update badge
    var badge = document.getElementById('badge-' + pointId);
    badge.className = 'badge badge-' + (newStatus === 'done' ? 'done' : newStatus === 'progress' ? 'progress' : 'todo');
    badge.textContent = newStatus === 'done' ? '✓ Terminé' : newStatus === 'progress' ? '⏳ En cours' : '⏸ À faire';

    // Update buttons
    ['todo', 'progress', 'done'].forEach(function(s) {
        var btn = document.getElementById('btn-' + s + '-' + pointId);
        btn.className = 'status-btn' + (s === newStatus ? ' active-' + s : '');
    });

    // Mark point as modified
    document.getElementById('point-' + pointId).classList.add('modified');

    // Add to status history display
    var historyEl = document.getElementById('history-' + pointId);
    if (historyEl) {
        var timeline = historyEl.querySelector('.status-timeline');
        var label = newStatus === 'done' ? '✅ Terminé' : newStatus === 'progress' ? '⏳ En cours' : '⏸️ À faire';
        var now = new Date();
        timeline.innerHTML += '<div class="status-entry">' +
            '<span class="status-entry-label">' + label + '<span class="modified-badge">MODIFIÉ</span></span>' +
            '<span class="status-entry-date">le ' + now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}) + '</span>' +
            '<span class="status-entry-user">par ' + name + '</span>' +
            '</div>';
    }

    updateSyncBar();
    updateStats();
}

/**
 * Add a photo to a point from file input.
 * Compresses the image and stores it in the changes object.
 */
function addPhoto(pointId, event) {
    var name = getEditorName();
    var file = event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
        // Compress
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            var maxW = 1200;
            var w = img.width, h = img.height;
            if (w > maxW) { h = (h * maxW) / w; w = maxW; }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            var dataUrl = canvas.toDataURL('image/jpeg', 0.7);

            var c = getPointChanges(pointId);
            c.addedPhotos.push({
                data: dataUrl,
                date: new Date().toISOString(),
                user: name
            });

            // Show preview
            var grid = document.getElementById('added-photos-' + pointId);
            grid.innerHTML += '<img src="' + dataUrl + '" alt="Photo ajoutée">';

            document.getElementById('point-' + pointId).classList.add('modified');
            updateSyncBar();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * Add a text note to a point.
 */
function addNote(pointId) {
    var name = getEditorName();
    var textarea = document.getElementById('note-input-' + pointId);
    var text = textarea.value.trim();
    if (!text) return;

    var c = getPointChanges(pointId);
    var noteData = {
        text: text,
        date: new Date().toISOString(),
        user: name
    };
    c.addedNotes.push(noteData);

    // Show note
    var container = document.getElementById('added-notes-' + pointId);
    var now = new Date();
    container.innerHTML += '<div class="note-item">' +
        '<div>' + text.replace(/\\n/g, '<br>') + '</div>' +
        '<div class="note-date">💬 ' + name + ' - ' + now.toLocaleString('fr-FR') + '</div>' +
        '</div>';

    textarea.value = '';
    document.getElementById('point-' + pointId).classList.add('modified');
    updateSyncBar();
}

/**
 * Export all changes as a JSON sync file.
 * This file is sent back to the ListKontrol admin for import.
 */
function exportSyncFile() {
    var syncData = {
        version: '0.6.0',
        type: 'listk-sync',
        projectId: projectData.id,
        projectName: projectData.name,
        generatedAt: projectData.generatedAt,
        syncCreatedAt: new Date().toISOString(),
        editor: editorName || 'Anonyme',
        changes: {}
    };

    // Only include points that have actual changes
    for (var id in changes) {
        var c = changes[id];
        if (c.statusChange || c.addedPhotos.length > 0 || c.addedNotes.length > 0) {
            syncData.changes[id] = c;
        }
    }

    var blob = new Blob([JSON.stringify(syncData, null, 2)], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ListK_sync_' + projectData.name.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.json';
    link.click();

    alert(
        '✅ Fichier de synchronisation téléchargé !\\n\\n' +
        '📧 Envoyez ce fichier .json au responsable du projet.\\n' +
        'Il pourra importer vos modifications dans ListKontrol.'
    );
}
<\/script>
</body>
</html>`;
}
