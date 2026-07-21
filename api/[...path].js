// Vercel serverless entry — runs the existing Express app for every /api/* route.
// The Express routes are already prefixed with /api, and the request path is
// preserved here, so app.get('/api/benchmark') etc. match as-is.
import { createApp } from '../server/app.js';

const app = createApp();

export default app;
