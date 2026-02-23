/**
 * ListKontrol - Standard HTML Report Generator
 * =============================================
 * 
 * Generates a static (non-interactive) HTML report with:
 * - Project overview with stats
 * - Overview map showing all points
 * - Individual point details with photos and map captures
 * - Status history timeline
 * - Google Maps links for each point
 * 
 * This is the original report format from Alpha 0.5.x.
 * For the interactive version, see reports/interactive.js
 */

/**
 * Generate a static HTML report with map screenshots.
 * 
 * @param {string} layerType - 'standard' or 'satellite' 
 * @param {number} zoomLevel - Map zoom (default: 19)
 */
async function generateHTMLReportWithMaps(layerType = 'standard', zoomLevel = 19) {
    reportGenerationCancelled = false;

    const button = document.querySelector('#projectTools button[onclick="generateReport()"]');
    const originalText = button.textContent;
    button.textContent = '⏳ Génération...';
    button.disabled = true;

    try {
        const points = [...currentProject.points];
        const stats = getProjectStats(currentProject);

        let htmlReport = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Rapport ${currentProject.name}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 1000px; margin: 40px auto; padding: 20px; background: #f8fafc; }
                    .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                    h1 { color: #0f172a; border-bottom: 4px solid #f97316; padding-bottom: 15px; margin-bottom: 30px; }
                    .header { background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 25px; border-radius: 10px; margin-bottom: 40px; border-left: 4px solid #f97316; }
                    .header h2 { margin: 0 0 15px 0; color: #0f172a; }
                    .header p { margin: 5px 0; color: #64748b; }
                    .overview-section { background: #fef3c7; padding: 25px; border-radius: 10px; margin-bottom: 40px; border: 2px solid #f97316; }
                    .overview-section h3 { margin: 0 0 15px 0; color: #92400e; }
                    .overview-map { width: 100%; border-radius: 10px; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.2); margin-top: 15px; }
                    .point { background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 25px; margin-bottom: 40px; page-break-inside: avoid; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
                    .point-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #f1f5f9; }
                    .point-number { background: #f97316; color: white; width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; margin-right: 15px; box-shadow: 0 2px 8px rgba(249,115,22,0.4); }
                    .point-title { font-size: 22px; font-weight: bold; color: #0f172a; flex: 1; }
                    .badge { display: inline-block; padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
                    .badge-todo { background: #fef3c7; color: #92400e; }
                    .badge-progress { background: #dbeafe; color: #1e40af; }
                    .badge-done { background: #d1fae5; color: #065f46; }
                    .meta { color: #64748b; font-size: 14px; margin: 15px 0; line-height: 1.8; }
                    .gps-link { color: #f97316; text-decoration: none; font-weight: 600; padding: 4px 8px; background: #fff7ed; border-radius: 4px; display: inline-block; }
                    .gps-link:hover { background: #f97316; color: white; }
                    .status-history { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px 20px; margin: 20px 0; border-radius: 8px; }
                    .status-history h4 { color: #0f172a; margin-bottom: 10px; font-size: 14px; }
                    .status-entry { display: flex; gap: 12px; align-items: center; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
                    .status-entry:last-child { border-bottom: none; }
                    .status-entry-label { font-weight: 600; min-width: 120px; }
                    .status-entry-date { color: #64748b; }
                    .status-entry-user { color: #94a3b8; font-style: italic; }
                    .comment { margin: 15px 0; line-height: 1.6; }
                    .images { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 20px; }
                    .image-container { border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                    .image-container img { width: 100%; display: block; }
                    .image-label { padding: 10px; text-align: center; font-size: 13px; color: #64748b; background: #f8fafc; font-weight: 600; }
                    .report-footer { text-align: center; padding: 30px; color: #94a3b8; font-size: 13px; border-top: 2px solid #e2e8f0; margin-top: 40px; }
                    @media print { body { margin: 0; } .container { box-shadow: none; } }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📋 Rapport de Suivi - ${currentProject.name}</h1>
                    <div class="header">
                        <h2>📊 Informations du projet</h2>
                        <p><strong>Projet:</strong> ${currentProject.name}</p>
                        ${currentProject.description ? `<p><strong>Description:</strong> ${currentProject.description}</p>` : ''}
                        <p><strong>Date du rapport:</strong> ${new Date().toLocaleString('fr-FR')}</p>
                        <p><strong>Nombre de points:</strong> ${points.length}</p>
                        <p><strong>Avancement:</strong> ⏸ ${stats.todo} à faire | ⏳ ${stats.progress} en cours | ✅ ${stats.done} terminé</p>
                    </div>
        `;

        // Overview map
        console.log('🗺️ Capturing overview map...');
        showReportProgress(0, points.length + 1, 'Capture de la carte générale...');
        const overviewMapImage = await captureOverviewMap(points, layerType);

        if (overviewMapImage) {
            htmlReport += `
                <div class="overview-section">
                    <h3>🗺️ Vue d'ensemble - Tous les points</h3>
                    <img src="${overviewMapImage}" class="overview-map" alt="Carte générale">
                </div>
            `;
        }

        // Individual points
        for (let i = 0; i < points.length; i++) {
            if (reportGenerationCancelled) {
                hideReportProgress();
                alert('❌ Génération annulée');
                return;
            }

            const point = points[i];
            showReportProgress(i + 1, points.length + 1, `Point ${point.number}: ${point.title}`);

            const statusClass = point.status === 'done' ? 'badge-done' :
                              point.status === 'progress' ? 'badge-progress' : 'badge-todo';
            const statusText = point.status === 'done' ? '✓ Terminé' :
                             point.status === 'progress' ? '⏳ En cours' : '⏸ À faire';

            const mapImage = await captureMapForPoint(point, layerType, zoomLevel);
            const googleMapsLink = `https://www.google.com/maps?q=${point.lat},${point.lng}`;
            const photos = getPointPhotos(point);

            htmlReport += `
                <div class="point">
                    <div class="point-header">
                        <div style="display: flex; align-items: center; flex: 1;">
                            <span class="point-number">${point.number}</span>
                            <div class="point-title">${point.title}</div>
                        </div>
                        <span class="badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="meta">
                        📍 <strong>Adresse:</strong> ${point.address}<br>
                        📅 <strong>Date:</strong> ${new Date(point.createdAt).toLocaleString('fr-FR')}<br>
                        🌐 <strong>GPS:</strong> <a href="${googleMapsLink}" target="_blank" class="gps-link">📍 ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)} - Ouvrir dans Maps</a>
                    </div>
                    ${point.statusHistory && point.statusHistory.length > 0 ? `
                    <div class="status-history">
                        <h4>📊 Historique du statut</h4>
                        <div class="status-timeline">
                            ${point.statusHistory.map(entry => {
                                const label = entry.status === 'done' ? '✅ Terminé' :
                                             entry.status === 'progress' ? '⏳ En cours' : '⏸️ À faire';
                                const d = new Date(entry.date);
                                return `<div class="status-entry">
                                    <span class="status-entry-label">${label}</span>
                                    <span class="status-entry-date">le ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</span>
                                    <span class="status-entry-user">par ${entry.user}</span>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                    ` : ''}
                    <div class="comment">
                        <strong>📝 Travaux à effectuer:</strong>
                        ${point.comment.replace(/\n/g, '<br>')}
                    </div>
                    <div class="images">
                        ${photos.map((photo, pi) => `
                        <div class="image-container">
                            <img src="${photo}" alt="Photo ${pi + 1}">
                            <div class="image-label">📷 Photo ${pi + 1}</div>
                        </div>
                        `).join('')}
                        ${mapImage ? `
                        <div class="image-container">
                            <img src="${mapImage}" alt="Localisation">
                            <div class="image-label">🗺️ Localisation</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        hideReportProgress();

        htmlReport += `
                    <div class="report-footer">
                        <p>Rapport généré par <strong>ListKontrol</strong> Alpha 0.7.0</p>
                        <p>🏗️ Outil open-source de suivi de chantiers VRD</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const blob = new Blob([htmlReport], { type: 'text/html;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ListK_${currentProject.name}_${Date.now()}.html`;
        link.click();

        alert('✅ Rapport HTML généré avec succès !');

    } catch (error) {
        console.error('Report generation error:', error);
        hideReportProgress();
        alert('❌ Erreur: ' + error.message);
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}
