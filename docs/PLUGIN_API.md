# Delta.tools Plugin API

Community plugins convert files right inside the browser. They run in a
sandboxed iframe: **no network access, no cookies, no access to the parent
page**. The only thing a plugin can do is receive a file and return a
converted file.

## Plugin manifest

Every plugin declares a manifest. On the server (when publishing to the
marketplace) it looks like:

```json
{
  "id": "com.example.png-to-jpeg",
  "name": "PNG to JPEG",
  "version": "1.0.0",
  "description": "Converts PNG images to JPEG",
  "author": "author_username",
  "icon": "🖼️",
  "inputs": ["png"],
  "outputs": ["jpeg"],
  "entry": "return { convert: async (input) => { ... } }"
}
```

- `id` — unique reverse-domain identifier
- `inputs` / `outputs` — file extensions (without the dot)
- `entry` — the plugin source code (see below)

## Authoring a converter

The `entry` is JavaScript evaluated inside the sandbox. It can be either an
expression that evaluates to an object, or a `return` statement. The object
must expose a `convert` function:

```js
return {
  convert: async (input) => {
    // input  -> { name, type, ext, data: ArrayBuffer }
    // output -> ArrayBuffer (the converted file bytes)
    return new ArrayBuffer(0);
  }
};
```

### Built-in helpers inside the sandbox

Plugins can rely on standard Web APIs that exist in a browser iframe:
`Uint8Array`, `DataView`, `TextDecoder`/`TextEncoder`, `URL`, `Blob`,
`crypto.subtle`, `OfflineAudioContext`, `document.createElement('canvas')`,
etc.

Example — a real image converter:

```js
return {
  convert: async (input) => {
    const bitmap = await createImageBitmap(new Blob([input.data]));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    return await blob.arrayBuffer();
  }
};
```

## Local installation (dev)

When running the site locally you can install a plugin directly from its
manifest by pasting it in the Marketplace → "Install from JSON" box. Installed
plugins are stored in IndexedDB and appear under **Your tools**.

## Marketplace publishing

Sign in and use the "Publish plugin" form in the Marketplace. The server
stores the manifest and source; anyone can then install your plugin.

## Security model

- Plugins execute inside an `iframe` with `sandbox="allow-scripts"` only —
  opaque origin, no cookies, no localStorage, no network.
- Communication with the app happens exclusively through `postMessage`
  with structured-clone-safe payloads (files travel as `ArrayBuffer`s).
- The main app never imports or evaluates plugin code in its own context.
