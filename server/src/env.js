import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*("?)(.*?)\2\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[3];
  }
}

// server/.env (user config) then the root .env.local (Vercel CLI writes the
// Blob token there). Vercel itself injects these via the project env vars.
loadEnvFile(join(__dirname, '..', '.env'));
loadEnvFile(join(__dirname, '..', '..', '.env.local'));

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
