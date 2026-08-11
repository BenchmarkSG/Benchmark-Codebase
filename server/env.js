// Load environment for the server from the repo-root .env (the single source
// shared with the data scripts), plus an optional server/.env for local
// overrides. Robust to the cwd the server is launched from (root or server/).
// In production (Vercel etc.) there's no .env file — platform env vars are used
// as-is (dotenv never overrides already-set vars).
//
// Imported FIRST in index.js so process.env is populated before app.js / its
// modules (payments.js, supabase.js) read it at load time.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, '.env'), quiet: true });        // server/.env — local overrides (optional)
config({ path: join(here, '..', '.env'), quiet: true });  // repo-root .env — canonical
