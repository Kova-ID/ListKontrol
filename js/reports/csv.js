/**
 * ListKontrol - CSV Report Export
 * ================================
 * 
 * Generates a CSV file compatible with Excel, Google Sheets, etc.
 * Useful for data analysis and bulk status tracking.
 * 
 * Format: Standard CSV with header row, quoted fields to handle
 * commas in addresses and comments.
 */

/**
 * Generate and download a CSV report of the current project.
 */
async function generateExcelReport() {
    let csv = 'Titre,Adresse,Commentaire,Statut,Coordonnées,Date de création\n';

    currentProject.points.forEach(point => {
        const status = point.status === 'done' ? 'Terminé' :
                      point.status === 'progress' ? 'En cours' : 'À faire';

        // Quote all fields to handle commas and line breaks in content
        csv += `"${point.title}","${point.address}","${point.comment}","${status}","${point.lat}, ${point.lng}","${new Date(point.createdAt).toLocaleString('fr-FR')}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ListK_${currentProject.name}_rapport_${Date.now()}.csv`;
    link.click();
}
