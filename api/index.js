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

const db = createFirestoreClient();
const app = createApp(db);

module.exports = app;
