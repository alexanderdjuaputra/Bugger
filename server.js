/* =====================================================================
   server.js — local development server
   ---------------------------------------------------------------------
   Use this to run BugBuster Pro on your own machine before deploying,
   with `npm start` or `npm run dev`. It builds the exact same Express
   app as Vercel does (server-app.js) and just adds app.listen() so it
   behaves like a normal local web server.

   The only test-only branch in this entire project lives here: if
   NODE_ENV=test and TEST_DB=memory are both set, the automated test
   suite swaps in an in-memory Firestore-compatible stand-in instead of
   connecting to real Firebase (see tests/firestoreMemoryShim.js and
   tests/test.js). server-app.js itself never knows or cares which one
   it was given — the business logic is identical either way.
   ===================================================================== */

const { createFirestoreClient } = require('./lib/db');
const createApp = require('./server-app');

let db;
if (process.env.NODE_ENV === 'test' && process.env.TEST_DB === 'memory') {
  const createMemoryFirestore = require('./tests/firestoreMemoryShim');
  db = createMemoryFirestore();
  console.log('[server] TEST MODE: using in-memory Firestore stand-in (no real Firebase contacted).');
} else {
  db = createFirestoreClient();
}

const app = createApp(db);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`BugBuster Pro running locally:`);
  console.log(`  Customer site   -> http://localhost:${PORT}/`);
  console.log(`  Management site -> http://localhost:${PORT}/management/`);
});

module.exports = app;
