import type { PluginManifest, ConvertResult, ConvertInput } from '../types';

interface SandboxMessage {
  kind: string;
  reqId?: number;
  payload?: unknown;
}

const SANDBOX_HTML = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-eval' 'unsafe-inline'; img-src 'none'; media-src 'none'; connect-src 'none'; style-src 'unsafe-inline'">
</head>
<body>
<script>
  let converter = null;
  const originalEval = eval;

  self.addEventListener('message', async (event) => {
    const msg = event.data;
    if (msg.kind === 'load') {
      try {
        // Run plugin code inside a function scope so 'return' works like module code
        const factory = originalEval('(function(){ ' + msg.payload.code + ' })');
        const mod = factory();
        if (!mod || typeof mod.convert !== 'function') {
          throw new Error('Plugin must export a convert(input) function');
        }
        converter = mod.convert;
        parent.postMessage({ kind: 'ready' }, '*');
      } catch (err) {
        parent.postMessage({ kind: 'error', payload: String(err && err.message || err) }, '*');
      }
    } else if (msg.kind === 'convert' && converter) {
      try {
        const input = msg.payload.input;
        const result = await converter(input);
        parent.postMessage({ kind: 'result', reqId: msg.reqId, payload: result }, '*');
      } catch (err) {
        parent.postMessage({ kind: 'error', reqId: msg.reqId, payload: String(err && err.message || err) }, '*');
      }
    }
  });
</script>
</body>
</html>
`;

export class Sandbox {
  private iframe: HTMLIFrameElement;
  private ready: Promise<void>;
  private pending = new Map<number, { resolve: (v: ConvertResult) => void; reject: (e: Error) => void }>();
  private nextId = 1;

  constructor(manifest: PluginManifest) {
    this.iframe = document.createElement('iframe');
    this.iframe.style.display = 'none';
    this.iframe.setAttribute('sandbox', 'allow-scripts');
    this.iframe.srcdoc = SANDBOX_HTML;
    document.body.appendChild(this.iframe);
    const contentWindow = this.iframe.contentWindow!;

    // Sandboxed (opaque origin) frames are cross-origin: listen on the parent
    // window and filter messages by event.source instead.
    const onMessage = (event: MessageEvent<SandboxMessage>): void => {
      if (event.source !== contentWindow) return;
      const msg = event.data;
      const reqId = msg.reqId;
      if (msg.kind === 'result' && reqId != null) {
        const p = this.pending.get(reqId);
        if (p) {
          this.pending.delete(reqId);
          p.resolve(msg.payload as ConvertResult);
        }
      } else if (msg.kind === 'error') {
        if (reqId != null) {
          const p = this.pending.get(reqId);
          if (p) {
            this.pending.delete(reqId);
            p.reject(new Error(String(msg.payload)));
          }
        }
      }
    };
    window.addEventListener('message', onMessage);

    this.ready = new Promise((resolve, reject) => {
      const onReady = (event: MessageEvent<SandboxMessage>): void => {
        if (event.source !== contentWindow) return;
        if (event.data?.kind === 'ready') {
          window.removeEventListener('message', onReady);
          resolve();
        } else if (event.data?.kind === 'error') {
          window.removeEventListener('message', onReady);
          reject(new Error(String(event.data.payload)));
        }
      };
      window.addEventListener('message', onReady);
      this.iframe.addEventListener('load', () => {
        contentWindow.postMessage({ kind: 'load', payload: { code: manifest.entry } }, '*');
      });
    });
  }

  async init(): Promise<void> {
    await this.ready;
  }

  async convert(input: ConvertInput): Promise<ConvertResult> {
    await this.ready;
    return new Promise((resolve, reject) => {
      const reqId = this.nextId++;
      this.pending.set(reqId, { resolve, reject });
      // Strip function-ish payloads; send plain data (structured clone safe)
      this.iframe.contentWindow!.postMessage(
        {
          kind: 'convert',
          reqId,
          payload: {
            input: {
              name: input.name,
              type: input.type,
              ext: input.ext,
              data: input.data,
            },
          },
        },
        '*',
      );
    });
  }

  destroy(): void {
    this.iframe.remove();
  }
}