import express from 'express';
import { authRouter } from './routes/auth.js';
import { pluginsRouter } from './routes/plugins.js';
import { seed } from './seed.js';

seed();

const app = express();
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', authRouter);
app.use('/api/plugins', pluginsRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'delta.tools' }));

// Serve built web app in production
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = join(__dirname, '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Delta.tools API listening on http://localhost:${PORT}`);
});
