/* scripts/seed.js — run with `npm run seed`
   Connects to whichever Firestore your environment is configured for
   (emulator / real project via env vars / local serviceAccountKey.json)
   and seeds the reference data. Useful as a first connectivity check
   right after you set up Firebase, before you ever open a browser. */

const { createFirestoreClient } = require('../lib/db');
const { ensureSeeded } = require('../lib/seed');

(async () => {
  console.log('Connecting to Firestore...');
  const db = createFirestoreClient();
  const result = await ensureSeeded(db);
  console.log('Seeded successfully:', result);
  console.log('Service types, technicians, demo customer, and the booking counter are ready.');
  process.exit(0);
})().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
