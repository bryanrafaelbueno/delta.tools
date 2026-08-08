# Delta.tools

Private, trustable, and completely **client-side** file conversion.

No ads. No spyware. No tracking. Every conversion runs in your browser —
your files never leave your machine. Plus a community marketplace of
user-made conversion plugins, installed straight into your workspace.

## Features

- **80+ built-in conversions** — images, audio, video, PDF, archives
- **100% in-browser** — nothing is uploaded to a server
- **Plugin marketplace** — install community-made converters
- **Accounts** — keep your plugin collection synced
- **Dark, minimal UI** — no clutter, no banners

## Project structure

```
delta.tools/
├── web/       # Browser app (Vite + TypeScript)
├── server/    # Account + marketplace API (Express + SQLite)
└── docs/      # Plugin authoring guide
```

## Getting started

```bash
npm install
npm run dev
```

- Web app: http://localhost:5173
- API server: http://localhost:3001

## Plugin development

Community plugins run sandboxed inside the browser (no network, no cookies,
no access to the parent page). See [docs/PLUGIN_API.md](docs/PLUGIN_API.md)
for the full authoring guide.
