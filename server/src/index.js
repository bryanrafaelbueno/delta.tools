import express from 'express';
import { authRouter } from './routes/auth.js';
import { pluginsRouter } from './routes/plugins.js';
import { favoritesRouter } from './routes/favorites.js';
import { adminRouter } from './routes/admin.js';
import { iconsRouter } from './routes/icons.js';
import { proxyRouter } from './routes/proxy.js';
import { dbReady } from './db.js';

// On Vercel the DB is pulled from Blob at boot — wait for it so requests
// never race a half-loaded database.
await dbReady;

const app = express();
app.use(express.json({ limit: '5mb' }));

// Cross-origin isolation: required by ffmpeg.wasm (SharedArrayBuffer)
app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/plugins', pluginsRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/icons', iconsRouter);
app.use('/api/proxy', proxyRouter);

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, service: 'delta.tools' }),
);

// Serve built web app (local self-hosted AND the Vercel function): the Express
// middleware above sets COOP/COEP, which ffmpeg.wasm requires — serving the
// HTML through the function guarantees the headers are present.
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = join(__dirname, '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
}

export default app;

if (!process.env.VERCEL && !process.env.NO_LISTEN) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Delta.tools API listening on http://localhost:${PORT}`);
  });
}
