/**
 * ListKontrol - Storage Module
 * ============================
 * 
 * Handles data persistence for projects and archives.
 * Currently uses localStorage as primary storage.
 * 
 * Architecture decision: localStorage first, not IndexedDB
 * - Simpler API, synchronous reads for faster UI
 * - 5-10MB limit is adequate for project metadata
 * - Photos are base64-encoded inline (compressed to ~100-200KB each)
 * - For heavy photo usage, future versions will use external storage (R2/S3)
 * 
 * The window.storage API (from Claude artifacts) is supported as an
 * alternative backend, with automatic fallback to localStorage.
 * 
 * Future: This module will be extended with Scaleway cloud sync
 * for multi-device support and persistent remote storage.
 */

/**
 * Load all projects from storage.
 * Tries window.storage first (artifact environment), falls back to localStorage.
 * 
 * @returns {Promise<Array>} Array of project objects
 */
async function loadProjects() {
    // Check for artifact storage API (available in Claude.ai environment)
    if (!window.storage) {
        // Migration: rename old vrd_projects key to listk_projects
        const oldStored = localStorage.getItem('vrd_projects');
        if (oldStored && !localStorage.getItem('listk_projects')) {
            localStorage.setItem('listk_projects', oldStored);
            localStorage.removeItem('vrd_projects');
            console.log('📦 Migrated vrd_projects → listk_projects');
        }
        const stored = localStorage.getItem('listk_projects');
        projects = stored ? JSON.parse(stored) : [];
        return;
    }

    try {
        const result = await window.storage.list('project:');
        if (result && result.keys) {
            projects = [];
            for (const key of result.keys) {
                const data = await window.storage.get(key);
                if (data) {
                    projects.push(JSON.parse(data.value));
                }
            }
        }
    } catch (error) {
        // Graceful degradation: fall back to localStorage
        console.log('Storage API unavailable, using localStorage');
        const stored = localStorage.getItem('listk_projects');
        projects = stored ? JSON.parse(stored) : [];
    }
}

/**
 * Save a project to storage.
 * Updates the in-memory projects array and persists to storage backend.
 * 
 * @param {Object} project - The project object to save
 * @throws {Error} If both storage backends fail (usually quota exceeded)
 */
async function saveProject(project) {
    // Update in-memory array
    const index = projects.findIndex(p => p.id === project.id);
    if (index >= 0) {
        projects[index] = project;
    } else {
        projects.push(project);
    }

    if (!window.storage) {
        try {
            localStorage.setItem('listk_projects', JSON.stringify(projects));
        } catch (e) {
            console.error('localStorage save failed:', e);
            throw e;
        }
        // Cloud sync (non-blocking)
        if (typeof cloudPushProject === 'function') {
            cloudPushProject(project).catch(() => {});
        }
        return;
    }

    try {
        await window.storage.set(`project:${project.id}`, JSON.stringify(project));
    } catch (error) {
        // Fallback to localStorage if cloud storage fails
        console.log('Cloud storage failed, saving to localStorage');
        try {
            localStorage.setItem('listk_projects', JSON.stringify(projects));
        } catch (e) {
            console.error('All storage backends failed:', e);
            throw e;
        }
    }
}

/**
 * Delete a project from storage.
 * Removes from both in-memory array and persistent storage.
 * 
 * @param {string} projectId - ID of the project to delete
 */
async function deleteProjectFromStorage(projectId) {
    if (!window.storage) {
        projects = projects.filter(p => p.id !== projectId);
        localStorage.setItem('listk_projects', JSON.stringify(projects));
        return;
    }

    try {
        await window.storage.delete(`project:${projectId}`);
    } catch (error) {
        projects = projects.filter(p => p.id !== projectId);
        localStorage.setItem('listk_projects', JSON.stringify(projects));
    }
}

/**
 * Load all archives from storage.
 * Archives are projects that have been shelved with an expiration date.
 */
async function loadArchives() {
    if (!window.storage) {
        // Migration: rename old vrd_archives key
        const oldArchives = localStorage.getItem('vrd_archives');
        if (oldArchives && !localStorage.getItem('listk_archives')) {
            localStorage.setItem('listk_archives', oldArchives);
            localStorage.removeItem('vrd_archives');
            console.log('📦 Migrated vrd_archives → listk_archives');
        }
        archives = JSON.parse(localStorage.getItem('listk_archives') || '[]');
    } else {
        try {
            const result = await window.storage.list('archive:');
            if (result && result.keys) {
                archives = [];
                for (const key of result.keys) {
                    const data = await window.storage.get(key);
                    if (data) {
                        archives.push(JSON.parse(data.value));
                    }
                }
            }
        } catch (error) {
            archives = JSON.parse(localStorage.getItem('listk_archives') || '[]');
        }
    }
    // Update UI badge if the function is available
    // (may not be loaded yet during initial startup - app.js handles that case)
    if (typeof updateArchiveCount === 'function') updateArchiveCount();
}

/**
 * Save an archive entry.
 * 
 * @param {Object} archiveData - Project data with archive metadata (archivedAt, deleteAfter)
 */
async function saveArchive(archiveData) {
    if (!window.storage) {
        const allArchives = JSON.parse(localStorage.getItem('listk_archives') || '[]');
        allArchives.push(archiveData);
        localStorage.setItem('listk_archives', JSON.stringify(allArchives));
    } else {
        try {
            await window.storage.set(`archive:${archiveData.id}`, JSON.stringify(archiveData));
        } catch (error) {
            const allArchives = JSON.parse(localStorage.getItem('listk_archives') || '[]');
            allArchives.push(archiveData);
            localStorage.setItem('listk_archives', JSON.stringify(allArchives));
        }
    }
}

/**
 * Delete an archive entry.
 * 
 * @param {string} archiveId - ID of the archive to delete
 */
async function deleteArchiveFromStorage(archiveId) {
    if (!window.storage) {
        archives = archives.filter(a => a.id !== archiveId);
        localStorage.setItem('listk_archives', JSON.stringify(archives));
    } else {
        try {
            await window.storage.delete(`archive:${archiveId}`);
        } catch (error) {
            archives = archives.filter(a => a.id !== archiveId);
            localStorage.setItem('listk_archives', JSON.stringify(archives));
        }
    }
}

/**
 * Remove archives that have passed their expiration date.
 * Called on app startup to keep storage clean.
 */
async function cleanExpiredArchives() {
    const now = new Date();
    const expiredArchives = archives.filter(a => new Date(a.deleteAfter) < now);

    for (const archive of expiredArchives) {
        await deleteArchiveFromStorage(archive.id);
    }

    if (expiredArchives.length > 0) {
        await loadArchives();
        console.log(`${expiredArchives.length} expired archives cleaned`);
    }
}
