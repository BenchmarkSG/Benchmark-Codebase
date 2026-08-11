// Vercel serverless entry — runs the existing Express app for every /api/* route.
// vercel.json rewrites `/api/(.*)` here, so nested paths (e.g. /api/checkout/session)
// reach this single function. The original request URL is preserved, so the
// Express routes (already prefixed with /api) match as-is.
import { createApp } from '../server/app.js';

const app = createApp();

export default app;
