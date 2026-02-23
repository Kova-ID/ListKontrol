# 🏗️ ListKontrol (ListK) - Construction Site Tracking

**Professional inspection point management for construction sites.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-Alpha%200.7.0-blue.svg)]()
[![Made with Leaflet](https://img.shields.io/badge/maps-Leaflet.js-green.svg)](https://leafletjs.com)
[![Backend: Scaleway](https://img.shields.io/badge/backend-Scaleway-purple.svg)](https://www.scaleway.com)

ListKontrol (ListK) is an open-source web application for construction site controllers. Place inspection points on interactive maps, track work progress with status updates, attach photos, and generate comprehensive reports.

## ✨ Features

- 📍 **Interactive Map** — Place inspection points on OpenStreetMap or satellite imagery
- 📸 **Multi-Photo Support** — Attach multiple photos per point with compression
- 🔄 **Status Tracking** — Track points as Todo → In Progress → Done with full history
- 📊 **4 Report Formats** — Static HTML, Interactive HTML, CSV/Excel, Plain Text
- 🔁 **Interactive Reports** — Contractors can update statuses and add photos offline
- 📥 **Sync Import** — Import contractor changes back with full traceability
- ☁️ **Cloud Sync** — Scaleway backend (Warsaw, EU) for persistent data storage
- 📦 **Project Archives** — Soft-delete with 90-day recovery
- 📱 **Mobile Responsive** — Works on phone, tablet, and desktop
- 🌐 **Works Offline** — localStorage fallback when no network

## 🔁 Interactive Report Workflow

1. **You** generate an interactive report from ListK
2. **Contractor** opens the HTML file in any browser (no install needed)
3. **Contractor** updates statuses, adds photos, leaves notes → exports a `.json`
4. **You** import the `.json` in ListK → all changes applied with full traceability

## 🛠 Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Maps | [Leaflet.js](https://leafletjs.com) | Interactive map rendering |
| Tiles | OpenStreetMap + Esri Satellite | Street and aerial imagery |
| Capture | leaflet-simple-map-screenshoter + html2canvas | Map screenshots for reports |
| Backend | [Scaleway](https://www.scaleway.com) Serverless (Warsaw) | Database, API, Photo storage |
| Font | JetBrains Mono | Monospace UI elements |
| Frontend | Vanilla HTML/CSS/JS | No framework dependencies |

## 📁 Project Structure

```
listk/
├── index.html              # Main application shell
├── css/main.css            # All styles
├── js/
│   ├── core/
│   │   ├── helpers.js      # Utility functions (timeout, compression)
│   │   └── app.js          # Entry point, global state, init
│   ├── storage/
│   │   ├── storage.js      # localStorage operations
│   │   └── cloud.js        # Scaleway cloud sync
│   ├── map/
│   │   ├── map.js          # Leaflet init, markers, popups
│   │   └── capture.js      # Map screenshot capture
│   ├── ui/
│   │   ├── modals.js       # Modal open/close helpers
│   │   ├── projects.js     # Project CRUD, sidebar
│   │   ├── archives.js     # Archive management
│   │   └── points.js       # Point CRUD, multi-photo, status
│   └── reports/
│       ├── standard.js     # Static HTML report
│       ├── interactive.js  # Interactive HTML report
│       ├── sync.js         # Sync file import
│       ├── csv.js          # CSV/Excel export
│       └── text.js         # Plain text export
├── dist/index.html         # Single-file build (works offline)
├── README.md
├── CREDITS.md
├── LICENSE
└── build.sh
```

## 🚀 Quick Start

### Online (Recommended)
Deploy to GitHub Pages or Cloudflare Pages for HTTPS (required for geolocation).

### Local Development
```bash
git clone https://github.com/Kova-ID/listk.git
cd listk
python -m http.server 8000
# Or: npx serve .
```

### Single-File Version
For offline use, open `dist/index.html` directly in a browser. No server needed.

## ☁️ Cloud Backend (Scaleway)

ListK uses Scaleway Serverless (Warsaw datacenter) for persistent storage:
- **Serverless SQL Database** — Projects, points, status history
- **Object Storage** — Photos (S3-compatible)
- **Serverless Functions** — REST API

Data is stored in the EU (Warsaw, Poland) and is GDPR compliant.
The app works offline with localStorage and syncs when back online.

## 🙏 Support Open Source

ListKontrol is built on the shoulders of open-source projects. Please consider supporting them:

- **Leaflet.js** → [GitHub Sponsors](https://github.com/sponsors/mourner)
- **OpenStreetMap** → [donate.openstreetmap.org](https://donate.openstreetmap.org)
- **html2canvas** → [GitHub Sponsors](https://github.com/sponsors/niklasvh)

See [CREDITS.md](CREDITS.md) for the full list.

## 📝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <strong>ListKontrol</strong> — Professional construction site tracking<br>
  Made with ☕ by <strong>Cédric Kovacevic</strong>
</div>
