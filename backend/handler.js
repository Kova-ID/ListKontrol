/**
 * ListKontrol - Scaleway Serverless Function (API Backend)
 * ==========================================================
 * 
 * This function runs on Scaleway Serverless Functions (Warsaw region).
 * It provides a REST API for the ListK frontend to:
 * - Store/retrieve projects in Serverless SQL Database (PostgreSQL)
 * - Upload/download photos to Object Storage (S3-compatible)
 * 
 * Endpoints:
 *   GET    /ping                - Health check
 *   GET    /projects            - List all projects
 *   GET    /projects/:id        - Get a single project
 *   PUT    /projects/:id        - Create or update a project
 *   DELETE /projects/:id        - Delete a project
 *   POST   /photos              - Upload a photo (returns URL)
 *   DELETE /photos/:key         - Delete a photo
 * 
 * Authentication: Bearer token in Authorization header
 * 
 * Environment variables (set in Scaleway console):
 *   API_KEY           - Secret key for authentication
 *   DATABASE_URL      - PostgreSQL connection string
 *   S3_ENDPOINT       - Object Storage endpoint (e.g., s3.pl-waw.scw.cloud)
 *   S3_BUCKET         - Bucket name (e.g., listk-photos)
 *   S3_ACCESS_KEY     - Scaleway API access key
 *   S3_SECRET_KEY     - Scaleway API secret key
 *   S3_REGION         - Region (e.g., pl-waw)
 */

const { Client } = require("pg");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");

// === Database Setup ===

function getDbClient() {
    return new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
}

// === S3 Setup (for photos) ===

function getS3Client() {
    return new S3Client({
        endpoint: `https://${process.env.S3_ENDPOINT}`,
        region: process.env.S3_REGION || "pl-waw",
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
        },
        forcePathStyle: true, // Required for Scaleway S3
    });
}

// === Authentication ===

function authenticate(event) {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
    const token = authHeader.replace("Bearer ", "");
    return token === process.env.API_KEY;
}

// === Route Parsing ===

function parseRoute(event) {
    const path = event.path || "/";
    const method = event.httpMethod || "GET";

    // /ping
    if (path === "/ping") return { handler: "ping" };

    // /projects or /projects/:id
    const projectMatch = path.match(/^\/projects(?:\/([a-zA-Z0-9_-]+))?$/);
    if (projectMatch) {
        return {
            handler: "projects",
            id: projectMatch[1] || null,
            method
        };
    }

    // /photos or /photos/:key
    const photoMatch = path.match(/^\/photos(?:\/(.+))?$/);
    if (photoMatch) {
        return {
            handler: "photos",
            key: photoMatch[1] || null,
            method
        };
    }

    return { handler: "notfound" };
}

// === CORS Headers ===

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
};

function respond(statusCode, body) {
    return {
        statusCode,
        headers: CORS_HEADERS,
        body: JSON.stringify(body)
    };
}

// === Main Handler ===

module.exports.handle = async function (event, context) {
    // Handle CORS preflight
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    }

    const route = parseRoute(event);

    // Ping doesn't require auth
    if (route.handler === "ping") {
        return respond(200, { status: "ok", version: "0.7.0", region: "pl-waw" });
    }

    // All other routes require auth
    if (!authenticate(event)) {
        return respond(401, { error: "Unauthorized" });
    }

    try {
        switch (route.handler) {
            case "projects":
                return await handleProjects(route, event);
            case "photos":
                return await handlePhotos(route, event);
            default:
                return respond(404, { error: "Not found" });
        }
    } catch (error) {
        console.error("Handler error:", error);
        return respond(500, { error: error.message });
    }
};

// === Project Handlers ===

async function handleProjects(route, event) {
    const db = getDbClient();
    await db.connect();

    try {
        // GET /projects — list all
        if (route.method === "GET" && !route.id) {
            const result = await db.query(
                "SELECT id, data FROM projects ORDER BY updated_at DESC"
            );
            const projects = result.rows.map(row => JSON.parse(row.data));
            return respond(200, projects);
        }

        // GET /projects/:id — get one
        if (route.method === "GET" && route.id) {
            const result = await db.query(
                "SELECT data FROM projects WHERE id = $1",
                [route.id]
            );
            if (result.rows.length === 0) {
                return respond(404, { error: "Project not found" });
            }
            return respond(200, JSON.parse(result.rows[0].data));
        }

        // PUT /projects/:id — create or update
        if (route.method === "PUT" && route.id) {
            const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
            const now = new Date().toISOString();
            body.updatedAt = now;

            // Separate photos from project data to keep DB light
            // Photos are stored as URLs pointing to Object Storage
            const dataJson = JSON.stringify(body);

            await db.query(
                `INSERT INTO projects (id, data, updated_at)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO UPDATE
                 SET data = $2, updated_at = $3`,
                [route.id, dataJson, now]
            );

            return respond(200, { status: "saved", id: route.id, updatedAt: now });
        }

        // DELETE /projects/:id
        if (route.method === "DELETE" && route.id) {
            await db.query("DELETE FROM projects WHERE id = $1", [route.id]);
            return respond(200, { status: "deleted", id: route.id });
        }

        return respond(405, { error: "Method not allowed" });

    } finally {
        await db.end();
    }
}

// === Photo Handlers ===

async function handlePhotos(route, event) {
    const s3 = getS3Client();
    const bucket = process.env.S3_BUCKET;

    // POST /photos — upload a photo
    if (route.method === "POST") {
        const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;

        // body.data is a base64 data URL like "data:image/jpeg;base64,/9j/4..."
        const matches = body.data.match(/^data:(.+);base64,(.+)$/);
        if (!matches) {
            return respond(400, { error: "Invalid base64 data URL" });
        }

        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        // Generate unique key: projectId/pointId/timestamp.jpg
        const ext = mimeType.includes("png") ? "png" : "jpg";
        const key = `${body.projectId}/${body.pointId}/${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;

        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
            ACL: "public-read" // Photos are accessible via URL
        }));

        const url = `https://${bucket}.s3.${process.env.S3_REGION}.scw.cloud/${key}`;

        return respond(200, { status: "uploaded", key, url });
    }

    // DELETE /photos/:key — delete a photo
    if (route.method === "DELETE" && route.key) {
        await s3.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: decodeURIComponent(route.key)
        }));

        return respond(200, { status: "deleted", key: route.key });
    }

    return respond(405, { error: "Method not allowed" });
}
