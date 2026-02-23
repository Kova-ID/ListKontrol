/**
 * ListKontrol - Cloud Storage Module (Scaleway)
 * ================================================
 * 
 * Handles synchronization between the local app (localStorage) and
 * the Scaleway cloud backend (Warsaw datacenter).
 * 
 * Architecture:
 * - Serverless SQL Database (PostgreSQL) for project/point data
 * - Object Storage (S3-compatible) for photos
 * - Serverless Functions for the REST API
 * 
 * Sync strategy: LOCAL-FIRST
 * - All operations write to localStorage immediately (fast, offline-capable)
 * - Then sync to cloud in background (async, non-blocking)
 * - On startup, cloud data is pulled and merged with local data
 * - If offline, changes are queued and synced when back online
 * 
 * This module does NOT replace storage.js — it extends it.
 * storage.js handles localStorage, cloud.js handles the remote sync.
 */

// === Cloud Configuration ===
// These values are set after Scaleway account setup
const CLOUD_CONFIG = {
    apiUrl: '',       // Scaleway Serverless Function URL (set after deployment)
    apiKey: '',       // API key for authentication
    enabled: false,   // Toggle cloud sync on/off
    region: 'pl-waw'  // Warsaw datacenter
};

// Sync state tracking
let cloudSyncStatus = 'disconnected'; // disconnected | syncing | synced | error
let pendingSyncQueue = [];             // Operations queued while offline
let lastSyncTimestamp = null;

/**
 * Initialize cloud connection.
 * Called from initApp() after localStorage is loaded.
 * Checks if cloud is configured, tests connection, then pulls latest data.
 */
async function initCloud() {
    // Load cloud config from localStorage (user sets this in settings)
    const savedConfig = localStorage.getItem('listk_cloud_config');
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            CLOUD_CONFIG.apiUrl = config.apiUrl || '';
            CLOUD_CONFIG.apiKey = config.apiKey || '';
            CLOUD_CONFIG.enabled = config.enabled || false;
        } catch (e) {
            console.warn('⚠️ Invalid cloud config in localStorage');
        }
    }

    // Load pending sync queue
    const savedQueue = localStorage.getItem('listk_sync_queue');
    if (savedQueue) {
        try { pendingSyncQueue = JSON.parse(savedQueue); } catch (e) { pendingSyncQueue = []; }
    }

    if (!CLOUD_CONFIG.enabled || !CLOUD_CONFIG.apiUrl) {
        updateCloudStatusUI('disconnected');
        console.log('☁️ Cloud sync disabled');
        return;
    }

    // Test connection and pull data
    try {
        updateCloudStatusUI('syncing');
        await cloudPing();
        await cloudPullAll();
        await flushSyncQueue();
        updateCloudStatusUI('synced');
        console.log('☁️ Cloud sync connected (Warsaw)');
    } catch (error) {
        updateCloudStatusUI('error');
        console.error('☁️ Cloud connection failed:', error.message);
    }
}

// === API Communication ===

/**
 * Make an authenticated request to the Scaleway API.
 * 
 * @param {string} endpoint - API path (e.g., '/projects')
 * @param {string} method - HTTP method
 * @param {Object} body - Request body (for POST/PUT)
 * @returns {Promise<Object>} Response data
 */
async function cloudFetch(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + CLOUD_CONFIG.apiKey
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(CLOUD_CONFIG.apiUrl + endpoint, options);

    if (!response.ok) {
        throw new Error(`Cloud API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Test cloud connection.
 */
async function cloudPing() {
    const result = await cloudFetch('/ping');
    if (result.status !== 'ok') throw new Error('Ping failed');
    return true;
}

// === Data Sync Operations ===

/**
 * Pull all projects from the cloud and merge with local data.
 * Cloud data wins for conflicts (cloud is source of truth when online).
 */
async function cloudPullAll() {
    const cloudProjects = await cloudFetch('/projects');

    for (const cloudProject of cloudProjects) {
        const localProject = projects.find(p => p.id === cloudProject.id);

        if (!localProject) {
            // New project from cloud — add locally
            projects.push(cloudProject);
            await saveProject(cloudProject);
        } else {
            // Merge: cloud wins if more recent
            const cloudDate = new Date(cloudProject.updatedAt || 0);
            const localDate = new Date(localProject.updatedAt || 0);

            if (cloudDate > localDate) {
                Object.assign(localProject, cloudProject);
                await saveProject(localProject);
            }
        }
    }

    lastSyncTimestamp = new Date().toISOString();
    localStorage.setItem('listk_last_sync', lastSyncTimestamp);
}

/**
 * Push a project to the cloud.
 * Called after every local save operation.
 * 
 * @param {Object} project - The project to sync
 */
async function cloudPushProject(project) {
    if (!CLOUD_CONFIG.enabled) return;

    // Add updatedAt timestamp for conflict resolution
    project.updatedAt = new Date().toISOString();

    try {
        updateCloudStatusUI('syncing');
        await cloudFetch('/projects/' + project.id, 'PUT', project);
        updateCloudStatusUI('synced');
    } catch (error) {
        console.warn('☁️ Push failed, queuing for later:', error.message);
        queueSyncOperation({ type: 'push_project', projectId: project.id, data: project });
        updateCloudStatusUI('error');
    }
}

/**
 * Delete a project from the cloud.
 * 
 * @param {string} projectId - ID of the project to delete
 */
async function cloudDeleteProject(projectId) {
    if (!CLOUD_CONFIG.enabled) return;

    try {
        await cloudFetch('/projects/' + projectId, 'DELETE');
    } catch (error) {
        queueSyncOperation({ type: 'delete_project', projectId });
    }
}

// === Photo Cloud Storage ===

/**
 * Upload a photo to Scaleway Object Storage.
 * Returns the cloud URL that replaces the base64 data.
 * 
 * @param {string} base64Data - The photo as base64 data URL
 * @param {string} projectId - Parent project ID
 * @param {string} pointId - Parent point ID
 * @returns {Promise<string>} Cloud URL of the uploaded photo
 */
async function cloudUploadPhoto(base64Data, projectId, pointId) {
    if (!CLOUD_CONFIG.enabled) return base64Data; // Return base64 as-is if no cloud

    try {
        const result = await cloudFetch('/photos', 'POST', {
            data: base64Data,
            projectId,
            pointId,
            timestamp: new Date().toISOString()
        });

        return result.url; // Return cloud URL instead of base64
    } catch (error) {
        console.warn('☁️ Photo upload failed, keeping base64:', error.message);
        return base64Data; // Fallback to base64
    }
}

// === Offline Queue ===

/**
 * Queue a sync operation for when we're back online.
 * Operations are stored in localStorage to survive page reloads.
 * 
 * @param {Object} operation - { type, projectId, data }
 */
function queueSyncOperation(operation) {
    operation.queuedAt = new Date().toISOString();
    pendingSyncQueue.push(operation);
    localStorage.setItem('listk_sync_queue', JSON.stringify(pendingSyncQueue));
}

/**
 * Process all queued sync operations.
 * Called when cloud connection is restored.
 */
async function flushSyncQueue() {
    if (pendingSyncQueue.length === 0) return;

    console.log(`☁️ Flushing ${pendingSyncQueue.length} queued operations`);
    const remaining = [];

    for (const op of pendingSyncQueue) {
        try {
            switch (op.type) {
                case 'push_project':
                    await cloudFetch('/projects/' + op.projectId, 'PUT', op.data);
                    break;
                case 'delete_project':
                    await cloudFetch('/projects/' + op.projectId, 'DELETE');
                    break;
                default:
                    console.warn('Unknown sync operation:', op.type);
            }
        } catch (error) {
            remaining.push(op); // Keep failed ops in queue
        }
    }

    pendingSyncQueue = remaining;
    localStorage.setItem('listk_sync_queue', JSON.stringify(pendingSyncQueue));

    if (remaining.length > 0) {
        console.warn(`☁️ ${remaining.length} operations still pending`);
    }
}

// === UI Status Indicator ===

/**
 * Update the cloud sync status indicator in the UI.
 * 
 * @param {string} status - disconnected | syncing | synced | error
 */
function updateCloudStatusUI(status) {
    cloudSyncStatus = status;
    const indicator = document.getElementById('cloudStatus');
    if (!indicator) return;

    const states = {
        disconnected: { icon: '☁️', text: 'Hors ligne', color: '#6b7280' },
        syncing:      { icon: '🔄', text: 'Sync...', color: '#f59e0b' },
        synced:       { icon: '✅', text: 'Synchronisé', color: '#10b981' },
        error:        { icon: '⚠️', text: 'Erreur sync', color: '#ef4444' }
    };

    const state = states[status] || states.disconnected;
    indicator.innerHTML = `${state.icon} <span style="color:${state.color}">${state.text}</span>`;
}

// === Cloud Settings Modal ===

/**
 * Show the cloud configuration modal.
 * Allows user to enter their Scaleway API URL and key.
 */
function showCloudSettings() {
    document.getElementById('cloudApiUrl').value = CLOUD_CONFIG.apiUrl;
    document.getElementById('cloudApiKey').value = CLOUD_CONFIG.apiKey;
    document.getElementById('cloudEnabled').checked = CLOUD_CONFIG.enabled;
    document.getElementById('cloudSettingsModal').classList.add('active');
}

/**
 * Save cloud settings from the modal form.
 */
async function saveCloudSettings() {
    CLOUD_CONFIG.apiUrl = document.getElementById('cloudApiUrl').value.trim();
    CLOUD_CONFIG.apiKey = document.getElementById('cloudApiKey').value.trim();
    CLOUD_CONFIG.enabled = document.getElementById('cloudEnabled').checked;

    localStorage.setItem('listk_cloud_config', JSON.stringify({
        apiUrl: CLOUD_CONFIG.apiUrl,
        apiKey: CLOUD_CONFIG.apiKey,
        enabled: CLOUD_CONFIG.enabled
    }));

    closeModal('cloudSettingsModal');

    if (CLOUD_CONFIG.enabled) {
        await initCloud();
    } else {
        updateCloudStatusUI('disconnected');
    }
}

/**
 * Force a manual full sync.
 * Pulls from cloud, then pushes all local projects.
 */
async function forceCloudSync() {
    if (!CLOUD_CONFIG.enabled) {
        alert('☁️ Le cloud n\'est pas configuré. Allez dans Paramètres Cloud.');
        return;
    }

    try {
        updateCloudStatusUI('syncing');

        // Pull
        await cloudPullAll();

        // Push all local projects
        for (const project of projects) {
            project.updatedAt = new Date().toISOString();
            await cloudFetch('/projects/' + project.id, 'PUT', project);
        }

        // Flush queue
        await flushSyncQueue();

        updateCloudStatusUI('synced');
        alert('✅ Synchronisation complète réussie !');
    } catch (error) {
        updateCloudStatusUI('error');
        alert('❌ Erreur de synchronisation: ' + error.message);
    }
}
