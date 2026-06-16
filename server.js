/* =====================================================================
   server.js — universal entrypoint (local dev AND Vercel)
   ---------------------------------------------------------------------
   IMPORTANT — this file turned out to be more than "just for local dev".
   Because package.json has "main": "server.js", Vercel's Node Application
   Preset auto-detected THIS file as the deployed serverless function,
   not api/index.js as originally designed (confirmed directly from a
   real Vercel build log: "Using server.js as the root entrypoint"). So
   this file must behave correctly in BOTH environments:
     - Locally (`npm start`): calls app.listen() to act like a normal server.
     - On Vercel: must NOT call app.listen() (Vercel's runtime invokes the
       exported app directly), and must NOT crash at module load if
       Firebase credentials aren't set yet — the same failure mode that
       was originally (and wrongly) fixed only in api/index.js.

   The only test-only branch in this entire project lives here: if
   NODE_ENV=test and TEST_DB=memory are both set, the automated test
   suite swaps in an in-memory Firestore-compatible stand-in instead of
   connecting to real Firebase (see tests/firestoreMemoryShim.js and
   tests/test.js). server-app.js itself never knows or cares which one
   it was given — the business logic is identical either way.
   ===================================================================== */

const { createFirestoreClient } = require('./lib/db');
const createApp = require('./server-app');

let db = null;
if (process.env.NODE_ENV === 'test' && process.env.TEST_DB === 'memory') {
  const createMemoryFirestore = require('./tests/firestoreMemoryShim');
  db = createMemoryFirestore();
  console.log('[server] TEST MODE: using in-memory Firestore stand-in (no real Firebase contacted).');
} else {
  // CRITICAL: must never throw here. If Firebase credentials are missing
  // (e.g. not yet added to Vercel's Environment Variables), this would
  // otherwise crash the entire function on every single request,
  // including the static homepage. See server-app.js for how db = null
  // is handled gracefully from this point on.
  try {
    db = createFirestoreClient();
  } catch (e) {
    console.error('[server.js] Firestore not connected:', e.message);
  }
}

const app = createApp(db);

// Only bind a port when actually running as a local long-lived process.
// Vercel sets the VERCEL env var automatically; when present, Vercel's
// own runtime invokes the exported app directly and app.listen() should
// not run.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`BugBuster Pro running locally:`);
    console.log(`  Customer site   -> http://localhost:${PORT}/`);
    console.log(`  Management site -> http://localhost:${PORT}/management/`);
  });
}

module.exports = app;
