/* =====================================================================
   api/index.js — Vercel serverless entry point
   ---------------------------------------------------------------------
   Vercel treats every file under /api as its own serverless function.
   This one file handles ALL /api/* routes (see vercel.json's rewrite),
   because it simply hands off to the full Express app defined in
   server-app.js. There is no app.listen() here — Vercel's runtime
   manages the HTTP server itself and just invokes this exported handler.
   ===================================================================== */

const { createFirestoreClient } = require('../lib/db');
const createApp = require('../server-app');

// CRITICAL: this must never throw at module load time. If Firebase
// credentials are missing or wrong, the whole serverless function would
// otherwise fail to initialize, which crashes EVERY path on the site
// (including the static homepage), not just /api/* calls. Instead, we
// catch the failure here and pass db = null down to server-app.js, which
// is responsible for: (1) still serving static files normally, and
// (2) returning a clean, readable error only for the specific /api/*
// calls that actually need the database.
let db = null;
try {
  db = createFirestoreClient();
} catch (e) {
  console.error('[api/index.js] Firestore not connected:', e.message);
}

const app = createApp(db);

module.exports = app;
