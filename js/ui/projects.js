/**
 * ListKontrol - Project Management UI
 * ====================================
 * 
 * Handles project CRUD operations and sidebar rendering.
 * Projects are the top-level container: each project has a name,
 * description, and an array of points.
 * 
 * Deletion uses two-step confirmation (confirm + type project name)
 * to prevent accidental data loss - localStorage deletion is permanent.
 */

/**
 * Create a new project from modal form data.
 * Uses Date.now() as unique ID (sufficient for single-user app).
 */
async function createProject() {
    const name = document.getElementById('projectName').value.trim();
    const description = document.getElementById('projectDescription').value.trim();

    if (!name) {
        alert('Veuillez saisir un nom de projet');
        return;
    }

    const project = {
        id: Date.now().toString(),
        name: name,
        description: description,
        createdAt: new Date().toISOString(),
        points: []
    };

    projects.push(project);

    try {
        await saveProject(project);
    } catch (error) {
        console.error('Project save failed:', error);
        projects.pop();
        alert('Erreur lors de la creation: ' + error.message);
        return;
    }

    closeModal('newProjectModal');
    document.getElementById('projectName').value = '';
    document.getElementById('projectDescription').value = '';
    renderProjects();
    selectProject(project.id);
}

/**
 * Render the project list in the sidebar.
 * Each card shows name, point count, completion stats, and delete button.
 * Delete button uses addEventListener (not inline onclick) so
 * stopPropagation works correctly to prevent card selection.
 */
function renderProjects() {
    const projectList = document.getElementById('projectList');
    projectList.innerHTML = '';

    if (projects.length === 0) {
        projectList.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--text-muted);">Aucun projet. Creez-en un !</p>';
        return;
    }

    projects.forEach(project => {
        const stats = getProjectStats(project);
        const card = document.createElement('div');
        card.className = 'project-card' + (currentProject && currentProject.id === project.id ? ' active' : '');
        card.onclick = function() { selectProject(project.id); };

        card.innerHTML =
            '<div class="project-name">' + project.name + '</div>' +
            '<div class="project-meta">' +
            '  <span>📍 ' + project.points.length + ' pts</span>' +
            '  <span>✅ ' + stats.done + '/' + project.points.length + '</span>' +
            '</div>' +
            '<button class="btn-icon btn-delete-project" data-project-id="' + project.id + '" title="Supprimer projet">🗑️</button>';

        var deleteBtn = card.querySelector('.btn-delete-project');
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            deleteProjectConfirm(project.id);
        });

        projectList.appendChild(card);
    });
}

/**
 * Calculate completion statistics for a project.
 * @param {Object} project - Project with points array
 * @returns {Object} {todo, progress, done} counts
 */
function getProjectStats(project) {
    var stats = { todo: 0, progress: 0, done: 0 };
    project.points.forEach(function(point) { stats[point.status]++; });
    return stats;
}

/**
 * Select a project and display its points on the map.
 * @param {string} projectId - ID of the project to select
 */
function selectProject(projectId) {
    currentProject = projects.find(function(p) { return p.id === projectId; });
    if (!currentProject) return;

    document.getElementById('currentProjectName').textContent = currentProject.name;
    document.getElementById('projectTools').style.display = 'flex';

    renderProjects();
    renderMapMarkers();
    updatePointsCount();

    // Auto-close sidebar on mobile
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('mobile-open');
    }

    // Center map on all points using fitBounds
    if (currentProject.points.length > 0) {
        var bounds = L.latLngBounds(currentProject.points.map(function(p) { return [p.lat, p.lng]; }));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
    }
}

/**
 * Delete a project with two-step confirmation.
 * Step 1: confirm() with project info
 * Step 2: prompt() requiring user to type project name
 * @param {string} projectId - ID of the project to delete
 */
async function deleteProjectConfirm(projectId) {
    var project = projects.find(function(p) { return p.id === projectId; });
    if (!project) return;

    if (!confirm(
        'SUPPRIMER DEFINITIVEMENT LE PROJET ?\n\n' +
        'Projet : ' + project.name + '\n' +
        'Points : ' + project.points.length + '\n\n' +
        'Cette action est IRREVERSIBLE !'
    )) return;

    var finalConfirm = prompt('Pour confirmer, tapez le nom du projet :\n"' + project.name + '"');
    if (finalConfirm !== project.name) {
        alert('Nom incorrect. Suppression annulee.');
        return;
    }

    await deleteProjectFromStorage(project.id);
    projects = projects.filter(function(p) { return p.id !== project.id; });

    if (currentProject && currentProject.id === project.id) {
        currentProject = null;
        document.getElementById('currentProjectName').textContent = 'Selectionnez un projet';
        document.getElementById('projectTools').style.display = 'none';
        clearMap();
    }

    renderProjects();
    hidePointsPanel();
    alert('Projet supprime avec succes');
}

/**
 * Delete the currently selected project (toolbar button).
 */
async function deleteCurrentProject() {
    if (!currentProject) return;

    if (!confirm(
        'SUPPRIMER DEFINITIVEMENT LE PROJET ?\n\n' +
        'Projet : ' + currentProject.name + '\n' +
        'Points : ' + currentProject.points.length + '\n\n' +
        'Cette action est IRREVERSIBLE !'
    )) return;

    var finalConfirm = prompt('Pour confirmer, tapez le nom du projet :\n"' + currentProject.name + '"');
    if (finalConfirm !== currentProject.name) {
        alert('Nom incorrect. Suppression annulee.');
        return;
    }

    await deleteProjectFromStorage(currentProject.id);
    projects = projects.filter(function(p) { return p.id !== currentProject.id; });

    currentProject = null;
    document.getElementById('currentProjectName').textContent = 'Selectionnez un projet';
    document.getElementById('projectTools').style.display = 'none';

    clearMap();
    renderProjects();
    hidePointsPanel();
    alert('Projet supprime definitivement');
}

/**
 * Open the archive modal for the current project.
 */
function archiveProject() {
    if (!currentProject) return;
    document.getElementById('archiveProjectName').textContent = currentProject.name;
    document.getElementById('archiveModal').classList.add('active');
}

/**
 * Confirm archiving: move project to archives with expiration date.
 */
async function confirmArchive() {
    var duration = parseInt(document.getElementById('archiveDuration').value);

    var archiveData = Object.assign({}, currentProject, {
        archivedAt: new Date().toISOString(),
        deleteAfter: new Date(Date.now() + duration * 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    await saveArchive(archiveData);
    await deleteProjectFromStorage(currentProject.id);
    projects = projects.filter(function(p) { return p.id !== currentProject.id; });

    currentProject = null;
    document.getElementById('currentProjectName').textContent = 'Selectionnez un projet';
    document.getElementById('projectTools').style.display = 'none';
    clearMap();

    closeModal('archiveModal');
    renderProjects();
    hidePointsPanel();

    alert('Projet archive pour ' + duration + ' mois');
    await loadArchives();
}

/**
 * Update the project stats in the sidebar after point changes.
 */
function updateProjectStats() {
    if (!currentProject) return;
    renderProjects();
    var pointsCount = document.getElementById('pointsCount');
    if (pointsCount) {
        pointsCount.textContent = currentProject.points.length;
    }
}
