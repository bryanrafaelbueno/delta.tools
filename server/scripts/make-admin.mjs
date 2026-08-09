// Promotes a user to Developer (admin) role.
//
//   node scripts/make-admin.mjs <username>
//
// Works both locally and against the Vercel deployment: when run with the
// BLOB_READ_WRITE_TOKEN env var it pulls the DB from Vercel Blob, updates it
// and pushes it back. Get the token with:  npx vercel env pull

import { db, dbReady, persistNow } from '../src/db.js';

const username = process.argv[2];
if (!username) {
  console.error('Usage: node scripts/make-admin.mjs <username>');
  process.exit(1);
}

await dbReady;

const user = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get(username);
if (!user) {
  console.error(`User "${username}" not found.`);
  process.exit(1);
}

db.prepare('UPDATE users SET role = ? WHERE id = ?').run('Developer', user.id);
await persistNow();

console.log(`Promoted "${user.username}" (id ${user.id}) to Developer.`);
process.exit(0);
