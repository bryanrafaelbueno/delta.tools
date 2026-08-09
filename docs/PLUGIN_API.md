# Delta.tools Plugin API

Community plugins convert files **entirely inside the visitor's browser**. A
plugin is a small JavaScript module that receives a file and returns a
converted file. Plugins run in a hardened sandboxed iframe — they never touch
the parent page, your cookies or your localStorage — and the app never
evaluates plugin code in its own context.

---

## How it all works

1. You install a plugin from the marketplace (or locally from JSON).
2. The plugin's `entry` source is evaluated inside a sandboxed iframe.
3. When the user converts a file, the app calls the plugin's `convert()`
   with the input file bytes.
4. The plugin returns the converted bytes; the app offers them as a download.
5. The plugin may also fetch remote content through the site's proxy — see
   [Fetching remote content](#fetching-remote-content-proxy).

---

## Plugin manifest

Every plugin declares a JSON manifest. It is validated on install and on the
server when publishing to the marketplace:

```json
{
  "id": "com.example.png-to-jpeg",
  "name": "PNG to JPEG",
  "version": "1.0.0",
  "description": "Converts PNG images to JPEG",
  "author": "author_username",
  "icon": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzM4YmRmOCI+PHBhdGggZD0iTTguNSAxMy41bDIuNSAzIDMuNS00LjUgNC41IDZINW0xOC04VjVhMiAyIDAgMCAwLTItMkg1YTIgMiAwIDAgMC0yIDJ2MTRhMiAyIDAgMCAwIDIgMmgxNGEyIDIgMCAwIDAgMi0yeiIvPjwvc3ZnPg==",
  "iconColor": "#38bdf8",
  "inputs": ["png"],
  "outputs": ["jpeg"],
  "entry": "return { convert: async (input) => { ... } }"
}
```

### Field reference

| Field         | Type      | Required | Rules                                                                          |
| ------------- | --------- | -------- | ------------------------------------------------------------------------------ |
| `id`          | `string`  | yes      | Lowercase reverse-domain, `3–64` chars: `^[a-z0-9][a-z0-9.-]{2,63}$`           |
| `name`        | `string`  | yes      | Display name                                                                   |
| `version`     | `string`  | yes      | Any string, e.g. `"1.0.0"`                                                     |
| `description` | `string`  | yes      | Shown in the marketplace                                                       |
| `author`      | `string`  | yes      | Your username (the server overrides this on publish)                           |
| `icon`        | `string`  | no       | An SVG as a `data:image/svg+xml;base64,…` URI. Omit to use the default puzzle  |
| `iconColor`   | `string`  | no       | A hex color; when set, the icon is re-tinted to that color (monochrome)        |
| `inputs`      | `string[]`| yes      | Input file extensions, 1–8 lowercase alphanumeric chars each, non-empty        |
| `outputs`     | `string[]`| yes      | Output file extensions, same rules, non-empty                                  |
| `entry`       | `string`  | yes      | The plugin source code (see [Authoring](#authoring-a-converter))               |

Every `inputs × outputs` combination becomes a separate converter tool. A
plugin with `inputs: ["png","jpg"]` and `outputs: ["webp"]` yields two tools:
`PNG to WEBP` and `JPG to WEBP`.

### Icons

Icons are **self-contained SVG data URIs** — no external icon service is
needed. To generate one from a local SVG file:

```sh
node -e "console.log('data:image/svg+xml;base64,' + Buffer.from(require('fs').readFileSync('icon.svg')).toString('base64'))"
```

`iconColor` is applied by rewriting the SVG itself (every `fill`/`stroke`
becomes that color), so any icon can be shown solid black, white, green, etc.
When omitted, the icon keeps its original colors.

---

## Authoring a converter

The `entry` is JavaScript evaluated inside the sandbox. It can be either an
expression that evaluates to an object, or a `return` statement. The object
must expose a single `convert` function:

```js
return {
  convert: async (input) => {
    // input  -> ConvertInput
    // output -> ConvertResult (see below)
    return { name: 'out.jpeg', type: 'image/jpeg', data: new ArrayBuffer(0) };
  }
};
```

### ConvertInput

```ts
{
  name: string;      // original file name, e.g. "photo.png"
  ext: string;       // extension without dot, e.g. "png"
  type: string;      // MIME type, e.g. "image/png"
  data: ArrayBuffer; // the file bytes
}
```

### ConvertResult — important

`convert` must return an **object**, not a raw `ArrayBuffer`:

```ts
{
  name: string;      // output file name, e.g. "photo.jpeg"
  type: string;      // MIME type, e.g. "image/jpeg"
  data: ArrayBuffer; // the converted bytes
}
```

The file name you return is what the user downloads. Choose the extension to
match the target format (the app uses it to show previews).

### Minimal working examples

**Text → text** (e.g. uppercase):

```js
return {
  convert: async (input) => {
    const text = new TextDecoder().decode(input.data);
    const out = text.toUpperCase();
    return {
      name: input.name.replace(/\.[^.]+$/, '') + '.txt',
      type: 'text/plain; charset=utf-8',
      data: new TextEncoder().encode(out).buffer,
    };
  }
};
```

**Image → image** (using a canvas):

```js
return {
  convert: async (input) => {
    const bitmap = await createImageBitmap(new Blob([input.data], { type: input.type }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    return {
      name: input.name.replace(/\.[^.]+$/, '') + '.jpg',
      type: 'image/jpeg',
      data: await blob.arrayBuffer(),
    };
  }
};
```

**Fetch a remote file** (see proxy section below):

```js
return {
  convert: async (input) => {
    const res = await fetch('/api/proxy?url=' + encodeURIComponent('https://example.com/file.bin'));
    if (!res.ok) throw new Error('download failed: HTTP ' + res.status);
    return {
      name: 'file.bin',
      type: res.headers.get('content-type') || 'application/octet-stream',
      data: await res.arrayBuffer(),
    };
  }
};
```

### Built-in APIs

Because plugins run in a real browser iframe, all standard Web APIs are
available: `Uint8Array`, `DataView`, `TextDecoder`/`TextEncoder`, `URL`,
`Blob`, `atob`/`btoa`, `crypto.subtle`, `createImageBitmap`,
`OfflineAudioContext`, `document.createElement('canvas')`, `fetch`, etc.

Throwing inside `convert` aborts the job — the app shows the error message to
the user, so use descriptive errors:

```js
throw new Error('The file is too small');
```

---

## Fetching remote content (proxy)

Direct cross-origin `fetch` from the sandbox is blocked by CORS, so all
network access goes through the site's own proxy: `/api/proxy`.

### GET

```js
const res = await fetch(`/api/proxy?url=${encodeURIComponent('https://example.com/page')}`);
const html = await res.text();   // or: const bytes = await res.arrayBuffer();
```

### POST (with custom headers / body)

```js
const res = await fetch('/api/proxy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com/api',
    headers: { 'X-Custom': 'value' },   // forwarded to the upstream
    // method: 'POST',                  // defaults to GET
    // data: 'raw body string',         // sent as the request body
  }),
});
```

### Proxy guarantees

| Behavior            | Value                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| Response size cap   | **256 MB** — larger responses are aborted (HTTP 413)                     |
| Timeout             | 60 s                                                                     |
| Redirects           | Up to 6 followed automatically                                           |
| Private/loopback    | **Blocked** (SSRF protection): localhost, 10.x, 127.x, 169.254.x, etc.   |
| Cookies             | **Stripped** — your session cookies never leave the browser              |
| `Content-Type`      | Passed through from the upstream as-is                                   |
| Status code         | The upstream status is relayed (`200`, `404`, `502`, …)                  |
| HTTP/1.1            | The proxy speaks HTTP/1.1 (curl, or a node fallback), not HTTP/2         |

If the upstream fails, the proxy responds with a JSON error body and a
`5xx` status — check `res.ok` and read `await res.text()` for details.

---

## Local installation (dev)

1. Open the **Marketplace** → **Install from JSON**.
2. Paste a full manifest (with the `entry` code) and click **Install**.

Installed plugins are stored in IndexedDB and appear under **Your tools** →
**Manage plugins**. You can also uninstall them from there.

The publish form also accepts a manifest `.json` file via **Import JSON**,
which pre-fills every field.

## Marketplace publishing

1. Sign in.
2. In the **Marketplace**, click **Publish a plugin**.
3. Fill the form (or import a JSON manifest) and submit.

The server stores the manifest and source as **pending**; an admin must
**approve** it before it appears publicly. Anyone can then install it.
Updating an existing plugin also sends it back to moderation.

---

## Security model

Plugins run inside an `iframe` with `sandbox="allow-scripts"` only:

- **Opaque origin** — no `allow-same-origin`, so the plugin can never reach
  the parent page, its cookies, `localStorage` or the DOM of the app.
- **CSP locked down** — `default-src 'none'`, only `script-src 'unsafe-eval'`
  (needed to evaluate the plugin) and `connect-src *` (network through the
  proxy). No images, media or frames can be loaded.
- **Communication via `postMessage`** — files travel as `ArrayBuffer`s
  (structured-clone-safe); the parent listens only to messages whose
  `event.source` is the plugin's own iframe.
- **The main app never imports or evaluates plugin code in its own context.**
- **Network is proxied** — private/loopback hosts are rejected and cookies
  are stripped server-side, so a plugin cannot probe your local network or
  impersonate your session.
- Malicious plugins are limited to: converting your file and fetching public
  URLs — which is exactly what the marketplace is for.
