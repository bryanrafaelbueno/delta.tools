<div align="center">

# ⬢ Delta.tools

**Private, trustable, and completely client-side file conversion.**

No ads. No spyware. No tracking. Every conversion runs in your browser —
your files never leave your machine.

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![ffmpeg.wasm](https://img.shields.io/badge/ffmpeg.wasm-007ACC?style=for-the-badge&logo=ffmpeg&logoColor=white)](https://ffmpegwasm.netlify.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

Built from the [Delta.tools Figma design](https://www.figma.com/design/wzbNFIIgIMMtI93K3yMHZU/Delta.tools).

</div>

---

## ✨ Features

| Category | Formats | Engine |
| --- | --- | --- |
| 🖼️ **Images** | PNG · JPG · WEBP · BMP · ICO · AVIF · GIF | Canvas |
| 🎵 **Audio** | MP3 · WAV · OGG · FLAC · AAC · M4A · OPUS | ffmpeg.wasm |
| 🎬 **Video** | MP4 · WebM · MOV · MKV · AVI · GIF export · audio extraction | ffmpeg.wasm |
| 📄 **Documents** | PDF → images · images → PDF · merge · compress | pdf-lib / pdfjs |
| 🗜️ **Archives** | ZIP ⇄ TAR ⇄ GZ | fflate |
| 📝 **Text** | JSON pretty · CSV ⇄ JSON · base64 decode | — |

- **🔒 100% in-browser conversions** — nothing is uploaded to a server
- **🧩 Sandboxed plugin marketplace** — install community converters in one click
- **⭐ Account favorites** — star your tools and keep them synced across devices (JWT auth, persisted in `localStorage`)
- **👤 Accounts** — register, sign in, publish your own plugins
- **🌙 Dark, minimal UI** — straight from your Figma design, no clutter

## 🏗️ Project structure

```
delta.tools/
├── web/                 # Browser app (Vite + TypeScript)
│   └── src/
│       ├── converters/  # image · media (ffmpeg.wasm) · pdf · archive · text
│       ├── plugins/     # sandboxed plugin runtime + IndexedDB store
│       ├── ui/          # icons, toast, sidebar shell
│       └── views/       # dashboard · tool · marketplace · tools · auth · settings
├── server/              # Account + marketplace API (Express + node:sqlite)
│   ├── src/routes/      # auth · plugins · favorites
│   └── .env.example     # JWT secret template
├── tests/               # Playwright end-to-end smoke tests
└── docs/                # Plugin authoring guide
```

## 🚀 Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) **20+** (for `node:sqlite`)
- npm (ships with Node)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the server environment

```bash
cp server/.env.example server/.env
```

Open `server/.env` and set a strong `JWT_SECRET` — this key signs the
login tokens, so keep it private:

```env
JWT_SECRET=change-me-to-a-long-random-string
```

### 3. Run the dev servers

```bash
npm run dev
```

| Service | URL |
| --- | --- |
| 🌐 Web app | http://localhost:5173 |
| ⚙️ API server | http://localhost:3001 |

### Production

```bash
npm run build
npm start        # serves the built web app + API on :3001
```

## 🔐 Authentication

Delta.tools uses **JWT (HS256)** for authentication:

- On login/register the server returns a signed JWT (`30-day` expiry) with the
  user id embedded in the payload.
- The client stores the token in `localStorage` (`delta_token`), so you stay
  signed in across page reloads and browser restarts.
- Every authenticated request sends it via the `Authorization: Bearer <token>`
  header; the server verifies the signature with the `JWT_SECRET` from
  `server/.env`.
- The session is **stateless** — no session table, no server-side logout state.

## 📚 Tech notes

- **ffmpeg.wasm** powers audio/video conversion and requires cross-origin
  isolation (`COOP: same-origin`, `COEP: require-corp`) for `SharedArrayBuffer` —
  both the dev and production servers send these headers.
- **Plugins run in a sandboxed iframe** (`sandbox="allow-scripts"` only):
  opaque origin, no network, no cookies, no access to the parent page. Files
  move through `postMessage` as `ArrayBuffer`s.
- **Installed plugins** live in IndexedDB on your device; accounts are only
  used for the marketplace and favorites.
- **Storage:** SQLite (via built-in `node:sqlite`) — no external database.

## 🧩 Plugin development

See [docs/PLUGIN_API.md](docs/PLUGIN_API.md) for the full authoring guide,
plus example plugins seeded into the marketplace (`server/src/seed.js`).

## 🧪 Testing

```bash
npm run dev -w server & npm run dev -w web &
npx playwright install chromium
node tests/e2e-smoke.cjs
```

See [tests/README.md](tests/README.md).

## 📄 License

[MIT](LICENSE) © 2026 [Bryan Rafael](https://github.com/bryanrafaelbueno)
