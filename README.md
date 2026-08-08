# Delta.tools

Private, trustable, and completely **client-side** file conversion.

No ads. No spyware. No tracking. Every conversion runs in your browser —
your files never leave your machine. Plus a community marketplace of
user-made conversion plugins, installed straight into your workspace.

Built from the [Delta.tools Figma design](https://www.figma.com/design/wzbNFIIgIMMtI93K3yMHZU/Delta.tools).

## Features

- **100% in-browser conversions** — nothing is uploaded to a server
- **Images** — PNG, JPG, WEBP, BMP, ICO, AVIF, GIF conversions via Canvas
- **Audio** — MP3, WAV, OGG, FLAC, AAC, M4A, OPUS via ffmpeg.wasm
- **Video** — MP4, WebM, MOV, MKV, AVI + GIF export + audio extraction
- **Documents** — PDF → images, images → PDF, PDF merge, PDF compress
- **Archives** — ZIP, TAR, GZ conversions
- **Text** — JSON pretty, CSV ⇄ JSON, base64 decode
- **Sandboxed plugin marketplace** — install community converters in one click
- **Accounts** — register, sign in, publish your own plugins
- **Dark, minimal UI** from your Figma design — no clutter, no banners

## Project structure

```
delta.tools/
├── web/       # Browser app (Vite + TypeScript)
│   └── src/
│       ├── converters/  # image, media (ffmpeg.wasm), pdf, archive, text
│       ├── plugins/     # sandboxed plugin runtime + IndexedDB store
│       └── views/       # dashboard, tool, marketplace, tools, auth, settings
├── server/    # Account + marketplace API (Express + node:sqlite)
├── tests/     # Playwright end-to-end smoke tests
└── docs/      # Plugin authoring guide
```

## Getting started

```bash
npm install
npm run dev
```

- Web app: http://localhost:5173
- API server: http://localhost:3001

### Production

```bash
npm run build
npm start          # serves the built web app + API on :3001
```

## Tech notes

- **ffmpeg.wasm** powers audio/video conversion and requires
  cross-origin isolation (`COOP: same-origin`, `COEP: require-corp`) for
  SharedArrayBuffer — both the dev server and production server send these
  headers.
- **Plugins run in a sandboxed iframe** (`sandbox="allow-scripts"` only):
  opaque origin, no network, no cookies, no access to the parent page.
  Files move through `postMessage` as ArrayBuffers.
- **Installed plugins** live in IndexedDB on your device; accounts are only
  used for the marketplace.

## Plugin development

See [docs/PLUGIN_API.md](docs/PLUGIN_API.md) for the full authoring guide,
plus example plugins seeded into the marketplace (`server/src/seed.js`).

## Testing

```bash
npm run dev -w server & npm run dev -w web &
npx playwright install chromium
node tests/e2e-smoke.cjs
```

See [tests/README.md](tests/README.md).
