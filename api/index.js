// Vercel serverless entry: exports the Express app as the /api function.
// The web front-end is served as static files by Vercel.
import app from '../server/src/index.js';

export default app;
