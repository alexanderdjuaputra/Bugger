/* =====================================================================
   lib/db.js — Firestore connection layer
   ---------------------------------------------------------------------
   This is the ONLY file that knows how to talk to Firebase. Everything
   else in the app (server-app.js) just receives a `db` object and calls
   standard Firestore methods on it (collection/doc/get/set/...). That
   `db` is produced by createFirestoreClient() below.

   IMPORTANT — firebase-admin v14 uses a MODULAR API (no `admin.firestore()`
   namespace, no `admin.credential.cert()`). The correct imports are:
     const { initializeApp, cert, getApps } = require('firebase-admin/app');
     const { getFirestore } = require('firebase-admin/firestore');
   This was verified directly against the installed package rather than
   assumed from memory — an earlier draft used the older, now-incorrect
   namespaced shape and was caught by testing before being shipped.

   Credential resolution order (first one found wins):
     1. Explicit Firestore Emulator — if FIRESTORE_EMULATOR_HOST is set,
        the Admin SDK auto-connects to a local emulator. No real
        credentials needed. Used for fully offline local testing.
     2. Vercel / production env vars — FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY. This is how the
        deployed app on Vercel authenticates (see PANDUAN_DEPLOY.md).
     3. A local serviceAccountKey.json file — convenient for local
        development if you downloaded the key file directly. This file
        is gitignored and must NEVER be committed or deployed.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function createFirestoreClient() {
  // Avoid re-initializing if this module is required multiple times
  // (common in serverless environments where the module may be reused
  // across warm invocations).
  if (getApps().length > 0) {
    return getFirestore();
  }

  // --- 1. Firestore Emulator (fully local, no real credentials) ---
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'demo-bugbuster' });
    console.log('[db] Using Firestore EMULATOR at', process.env.FIRESTORE_EMULATOR_HOST);
    return getFirestore();
  }

  // --- 2. Explicit env vars (this is what Vercel uses in production) ---
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel env vars store newlines as literal "\n" — convert back.
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    console.log('[db] Using Firebase credentials from environment variables.');
    return getFirestore();
  }

  // --- 3. Local serviceAccountKey.json fallback (local dev convenience) ---
  const localKeyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  if (fs.existsSync(localKeyPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
    initializeApp({ credential: cert(serviceAccount) });
    console.log('[db] Using local serviceAccountKey.json (development only).');
    return getFirestore();
  }

  throw new Error(
    'No Firebase credentials found. Set FIRESTORE_EMULATOR_HOST for local emulator testing, ' +
    'or FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars for ' +
    'production, or place a serviceAccountKey.json file in the project root for local dev. ' +
    'See PANDUAN_DEPLOY.md.'
  );
}

module.exports = { createFirestoreClient };
