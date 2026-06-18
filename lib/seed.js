/* =====================================================================
   lib/seed.js — idempotent reference-data seeding
   ---------------------------------------------------------------------
   Seeds the 3 required service types + demo technicians + a demo
   customer using FIXED, deterministic document IDs. Because the IDs are
   fixed, calling this many times is always safe (it just overwrites the
   same values) — this lets server-app.js call it lazily on cold start
   without ever creating duplicates, and also lets you run
   `npm run seed` manually any time.
   ===================================================================== */

const SERVICE_TYPES = [
  { id: '1', name: 'Termites',  nameId: 'Rayap',  price: 500000, description: 'Termite treatment and colony elimination', descriptionId: 'Pengobatan rayap dan pemberantasan koloni' },
  { id: '2', name: 'Cockroach', nameId: 'Kecoa',  price: 200000, description: 'Cockroach control and prevention', descriptionId: 'Pengendalian dan pencegahan kecoa' },
  { id: '3', name: 'Rats',      nameId: 'Tikus',  price: 400000, description: 'Rodent / rat control and exclusion', descriptionId: 'Pengendalian dan pencegahan tikus' },
];

const TECHNICIANS = [
  { id: '1', name: 'Andi Saputra',  skill: 'Termites,Rats',      zone: 'North', phone: '081200000001', status: 'active' },
  { id: '2', name: 'Budi Pratama',  skill: 'Cockroach,Rats',     zone: 'South', phone: '081200000002', status: 'active' },
  { id: '3', name: 'Citra Lestari', skill: 'Termites,Cockroach', zone: 'East',  phone: '081200000003', status: 'active' },
];

const DEMO_CUSTOMER = {
  id: 'demo-customer',
  name: 'Demo Customer',
  email: 'demo@bugbuster.test',
  phone: '081299990000',
  address: 'Jl. Mawar No. 1, Jakarta',
  password: 'demo123', // prototype only — see README security note
};

async function ensureSeeded(db) {
  const batch = db.batch();

  for (const s of SERVICE_TYPES) {
    const { id, ...data } = s;
    batch.set(db.collection('serviceTypes').doc(id), data);
  }
  for (const t of TECHNICIANS) {
    const { id, ...data } = t;
    batch.set(db.collection('technicians').doc(id), data);
  }
  const { id, ...customerData } = DEMO_CUSTOMER;
  batch.set(db.collection('customers').doc(id), customerData, { merge: true });
  // Initialize the booking ID counter only if it doesn't already exist,
  // so we never reset a real counter back to 0 on a later cold start.
  const counterRef = db.collection('meta').doc('counters');
  const counterSnap = await counterRef.get();
  if (!counterSnap.exists) {
    batch.set(counterRef, { bookings: 0 });
  }

  await batch.commit();
  return { serviceTypes: SERVICE_TYPES.length, technicians: TECHNICIANS.length };
}

module.exports = { ensureSeeded, SERVICE_TYPES, TECHNICIANS, DEMO_CUSTOMER };
