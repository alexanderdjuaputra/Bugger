/* =====================================================================
   server-app.js — BugBuster Pro application logic (Firestore-backed)
   ---------------------------------------------------------------------
   This is the ENTIRE backend: every API route, and the four control
   layers labelled inline as [INPUT] [PROCESSING] [ACCESS] [OUTPUT],
   exactly as in the original SQLite version — only the storage engine
   changed (SQLite -> Firestore). The JSON request/response shapes are
   kept IDENTICAL to the original so the existing customer + management
   front-ends work with zero changes.

   This file exports a FACTORY function, createApp(db), rather than a
   ready-made app. That is deliberate: it lets api/index.js (Vercel) and
   server.js (local dev) hand it a REAL Firestore client, while the
   automated test suite hands it a lightweight in-memory stand-in
   (tests/firestoreMemoryShim.js). The route logic below is 100%
   identical either way — nothing here is test-only or fake.
   ===================================================================== */

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { ensureSeeded } = require('./lib/seed');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'test';
const REFUND_KEY = 'refund';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const STATUS_ORDER = ['pending', 'confirmed', 'in progress', 'completed'];

function isValidTransition(from, to) {
  if (to === 'cancelled') return from !== 'completed';
  const i = STATUS_ORDER.indexOf(from);
  const j = STATUS_ORDER.indexOf(to);
  return i !== -1 && j === i + 1;
}

function isValidDateNotPast(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return !isNaN(d) && d >= today;
}

function newToken() { return crypto.randomBytes(20).toString('hex'); }

function sortByIdDesc(docs) {
  return docs.slice().sort((a, b) => Number(b.id) - Number(a.id));
}

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static files are served FIRST, unconditionally, before anything that
  // touches the database. This is what guarantees the customer site and
  // management site both load even if Firebase isn't connected yet — a
  // request for "/" or "/styles.css" is fully handled right here and
  // never reaches the database-dependent logic below.
  app.use('/management', express.static(path.join(__dirname, 'public', 'management')));
  app.use('/', express.static(path.join(__dirname, 'public')));

  // Everything past this point is for /api/* only. If the database isn't
  // connected (db is null — e.g. Firebase env vars not set yet on
  // Vercel), every /api/* call returns one clear, readable error instead
  // of the whole function crashing.
  let seeded = false;
  app.use(async (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    if (!db) {
      return res.status(503).json({
        error: 'Database not configured yet. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, ' +
               'and FIREBASE_PRIVATE_KEY in your Vercel project\'s Environment Variables, then redeploy.',
      });
    }
    if (!seeded) {
      try { await ensureSeeded(db); seeded = true; }
      catch (e) { return res.status(500).json({ error: 'Database not reachable: ' + e.message }); }
    }
    next();
  });

  /* ----------------------------- helpers ----------------------------- */

  async function getBookingView(bookingId) {
    const bSnap = await db.collection('bookings').doc(bookingId).get();
    if (!bSnap.exists) return null;
    const b = bSnap.data();
    const [custSnap, svcSnap, techSnap] = await Promise.all([
      db.collection('customers').doc(b.customerId).get(),
      db.collection('serviceTypes').doc(b.serviceTypeId).get(),
      b.technicianId ? db.collection('technicians').doc(b.technicianId).get() : Promise.resolve(null),
    ]);
    const customer = custSnap.exists ? custSnap.data() : {};
    const service = svcSnap.exists ? svcSnap.data() : {};
    const technician = techSnap && techSnap.exists ? techSnap.data() : null;
    return {
      booking_id: bSnap.id,
      customer_id: b.customerId,
      service_type_id: b.serviceTypeId,
      technician_id: b.technicianId || null,
      booking_date: b.bookingDate,
      preferred_time: b.preferredTime,
      address: b.address,
      pest_notes: b.pestNotes || '',
      status: b.status,
      created_at: b.createdAt,
      customer_name: customer.name,
      customer_phone: customer.phone,
      service_name: service.name,
      service_price: service.price,
      technician_name: technician ? technician.name : null,
    };
  }

  // [ACCESS] middleware — management endpoints require a valid, unexpired
  // admin session token. The token is looked up in Firestore (not local
  // memory), so it is correctly validated even if a later request lands
  // on a different serverless instance than the one that issued it.
  async function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
    const snap = await db.collection('sessions').doc(token).get();
    if (!snap.exists || snap.data().expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
    }
    next();
  }

  /* ===================== shared / public endpoints ===================== */

  app.get('/api/service-types', async (req, res) => {
    const snap = await db.collection('serviceTypes').get();
    const rows = snap.docs
      .map(d => ({ service_type_id: d.id, ...d.data() }))
      .sort((a, b) => Number(a.service_type_id) - Number(b.service_type_id));
    res.json(rows);
  });

  /* =========================== customer side =========================== */

  app.post('/api/customers/register', async (req, res) => {
    const { name, email, phone, address, password } = req.body;
    if (!name || !email || !phone || !address || !password)
      return res.status(400).json({ error: 'All fields are required.' });
    if (!/^\d{6,15}$/.test(phone))
      return res.status(400).json({ error: 'Phone must be 6–15 digits, numbers only.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return res.status(400).json({ error: 'Invalid email format.' });

    const existing = await db.collection('customers').where('email', '==', email).get();
    if (!existing.empty) return res.status(409).json({ error: 'Email already registered.' });

    const ref = db.collection('customers').doc();
    await ref.set({ name, email, phone, address, password, createdAt: Date.now() });
    res.json({ customer_id: ref.id, name });
  });

  app.post('/api/customers/login', async (req, res) => {
    const { email, password } = req.body;
    const snap = await db.collection('customers').where('email', '==', email).get();
    const match = snap.docs.find(d => d.data().password === password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });
    const c = match.data();
    res.json({ customer_id: match.id, name: c.name, phone: c.phone, address: c.address });
  });

  app.post('/api/bookings', async (req, res) => {
    const { customer_id, service_type_id, booking_date, preferred_time, address, pest_notes } = req.body;

    if (!customer_id || !service_type_id || !booking_date || !preferred_time || !address)
      return res.status(400).json({ error: 'Service, date, time and address are required.' });
    if (!isValidDateNotPast(booking_date))
      return res.status(400).json({ error: 'Booking date must be today or in the future (YYYY-MM-DD).' });

    const [custSnap, svcSnap] = await Promise.all([
      db.collection('customers').doc(String(customer_id)).get(),
      db.collection('serviceTypes').doc(String(service_type_id)).get(),
    ]);
    if (!custSnap.exists) return res.status(400).json({ error: 'Unknown customer.' });
    if (!svcSnap.exists) return res.status(400).json({ error: 'Unknown service type.' });

    // Atomic sequential ID so booking numbers stay short and ordered,
    // mirroring the original SQLite AUTOINCREMENT behaviour.
    const counterRef = db.collection('meta').doc('counters');
    const newId = await db.runTransaction(async tx => {
      const snap = await tx.get(counterRef);
      const current = snap.exists ? (snap.data().bookings || 0) : 0;
      const next = current + 1;
      tx.set(counterRef, { bookings: next }, { merge: true });
      return String(next);
    });

    await db.collection('bookings').doc(newId).set({
      customerId: String(customer_id),
      serviceTypeId: String(service_type_id),
      technicianId: null,
      bookingDate: booking_date,
      preferredTime: preferred_time,
      address,
      pestNotes: pest_notes || '',
      status: 'confirmed',
      createdAt: Date.now(),
    });

    res.json(await getBookingView(newId));
  });

  app.get('/api/customers/:id/bookings', async (req, res) => {
    const snap = await db.collection('bookings').where('customerId', '==', req.params.id).get();
    const docs = sortByIdDesc(snap.docs);
    const out = [];
    for (const d of docs) {
      const view = await getBookingView(d.id);
      const [paySnap, reportSnap, fbSnap] = await Promise.all([
        db.collection('payments').doc(d.id).get(),
        db.collection('serviceReports').doc(d.id).get(),
        db.collection('feedback').doc(d.id).get(),
      ]);
      out.push({
        ...view,
        payment_status: paySnap.exists ? paySnap.data().status : null,
        invoice_amount: paySnap.exists ? paySnap.data().amount : null,
        report_id: reportSnap.exists ? d.id : null,
        report_approved: reportSnap.exists ? (reportSnap.data().approved ? 1 : 0) : null,
        feedback_id: fbSnap.exists ? d.id : null,
      });
    }
    res.json(out);
  });

  app.get('/api/bookings/:id/report', async (req, res) => {
    const snap = await db.collection('serviceReports').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'No report yet.' });
    const chemSnap = await db.collection('serviceReports').doc(req.params.id).collection('chemicals').get();
    const chemicals = chemSnap.docs.map(c => ({ chemical_name: c.data().chemicalName, quantity: c.data().quantity }));
    const r = snap.data();
    res.json({
      report_id: req.params.id,
      booking_id: req.params.id,
      pest_found: r.pestFound,
      severity: r.severity,
      findings: r.findings,
      safety_notes: r.safetyNotes || '',
      approved: r.approved ? 1 : 0,
      chemicals,
    });
  });

  app.post('/api/bookings/:id/pay', async (req, res) => {
    const { method } = req.body;
    const ref = db.collection('payments').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'No invoice generated yet.' });
    const pay = snap.data();
    if (pay.status === 'paid') return res.status(409).json({ error: 'Already paid.' });
    if (pay.status === 'refunded') return res.status(409).json({ error: 'Payment was refunded.' });
    await ref.update({ status: 'paid', method: method || 'app' });
    res.json({ ok: true, status: 'paid' });
  });

  app.post('/api/bookings/:id/feedback', async (req, res) => {
    const { customer_id, rating, comment } = req.body;
    const bView = await getBookingView(req.params.id);
    if (!bView) return res.status(404).json({ error: 'Booking not found.' });
    if (String(bView.customer_id) !== String(customer_id))
      return res.status(403).json({ error: 'You can only review your own booking.' });
    if (bView.status !== 'completed')
      return res.status(409).json({ error: 'You can only review a completed service.' });
    const r = Number(rating);
    if (!(r >= 1 && r <= 5)) return res.status(400).json({ error: 'Rating must be between 1 and 5.' });

    try {
      // booking_id is used as the document ID -> a second attempt to
      // create feedback for the same booking fails atomically, exactly
      // like the original UNIQUE(booking_id) constraint.
      await db.collection('feedback').doc(req.params.id).create({
        customerId: String(customer_id), rating: r, comment: comment || '', createdAt: Date.now(),
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(409).json({ error: 'Feedback already submitted for this booking.' });
    }
  });

  /* ====================== management / admin endpoints ====================== */

  app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    if (username !== ADMIN_USER || password !== ADMIN_PASS)
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    const token = newToken();
    await db.collection('sessions').doc(token).set({ createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
    res.json({ token });
  });

  app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
    const snap = await db.collection('bookings').get();
    const docs = sortByIdDesc(snap.docs);
    const out = [];
    for (const d of docs) {
      const view = await getBookingView(d.id);
      const [paySnap, reportSnap, fbSnap] = await Promise.all([
        db.collection('payments').doc(d.id).get(),
        db.collection('serviceReports').doc(d.id).get(),
        db.collection('feedback').doc(d.id).get(),
      ]);
      out.push({
        ...view,
        payment_status: paySnap.exists ? paySnap.data().status : null,
        invoice_amount: paySnap.exists ? paySnap.data().amount : null,
        report_id: reportSnap.exists ? d.id : null,
        report_approved: reportSnap.exists ? (reportSnap.data().approved ? 1 : 0) : null,
        feedback_rating: fbSnap.exists ? fbSnap.data().rating : null,
        feedback_comment: fbSnap.exists ? fbSnap.data().comment : null,
      });
    }
    res.json(out);
  });

  app.get('/api/admin/technicians', requireAdmin, async (req, res) => {
    const snap = await db.collection('technicians').get();
    const rows = snap.docs
      .map(d => ({ technician_id: d.id, ...d.data() }))
      .sort((a, b) => Number(a.technician_id) - Number(b.technician_id));
    res.json(rows);
  });

  // [PROCESSING] + [INPUT] double-booking prevention, done atomically via
  // a Firestore transaction: the (technician, date, slot) tuple becomes a
  // deterministic Schedule document ID, and the transaction aborts if that
  // document already exists — equivalent to the original SQL
  // UNIQUE(technician_id, date, time_slot) constraint, but race-safe.
  app.post('/api/admin/bookings/:id/assign', requireAdmin, async (req, res) => {
    const { technician_id } = req.body;
    const bookingRef = db.collection('bookings').doc(req.params.id);
    const bSnap = await bookingRef.get();
    if (!bSnap.exists) return res.status(404).json({ error: 'Booking not found.' });
    const techSnap = await db.collection('technicians').doc(String(technician_id)).get();
    if (!techSnap.exists) return res.status(400).json({ error: 'Unknown technician.' });

    const b = bSnap.data();
    const scheduleId = `${technician_id}_${b.bookingDate}_${b.preferredTime}`;
    const scheduleRef = db.collection('schedules').doc(scheduleId);

    try {
      await db.runTransaction(async tx => {
        const schedSnap = await tx.get(scheduleRef);
        if (schedSnap.exists) {
          const err = new Error(`Technician already booked at ${b.bookingDate} ${b.preferredTime}.`);
          err.code = 'DOUBLE_BOOKED';
          throw err;
        }
        tx.set(scheduleRef, { technicianId: String(technician_id), date: b.bookingDate, timeSlot: b.preferredTime, bookingId: req.params.id });
        tx.update(bookingRef, { technicianId: String(technician_id), status: 'in progress' });
      });
    } catch (e) {
      if (e.code === 'DOUBLE_BOOKED') return res.status(409).json({ error: e.message });
      throw e;
    }

    res.json(await getBookingView(req.params.id));
  });

  app.post('/api/admin/bookings/:id/report', requireAdmin, async (req, res) => {
    const { pest_found, severity, findings, safety_notes, chemicals } = req.body;
    const bView = await getBookingView(req.params.id);
    if (!bView) return res.status(404).json({ error: 'Booking not found.' });
    if (!bView.technician_id) return res.status(409).json({ error: 'Assign a technician before reporting.' });
    if (!pest_found || !severity || !findings)
      return res.status(400).json({ error: 'Pest found, severity and findings are required.' });
    if (!Array.isArray(chemicals) || chemicals.length === 0 || !chemicals.every(c => c.chemical_name && c.quantity))
      return res.status(400).json({ error: 'At least one chemical (name + quantity) is required.' });

    const reportRef = db.collection('serviceReports').doc(req.params.id);
    const existing = await reportRef.get();
    if (existing.exists && existing.data().approved) {
      return res.status(409).json({ error: 'Report is approved and locked; cannot edit.' });
    }

    const batch = db.batch();
    batch.set(reportRef, {
      pestFound: pest_found, severity, findings, safetyNotes: safety_notes || '',
      approved: existing.exists ? existing.data().approved : false,
      createdAt: existing.exists ? existing.data().createdAt : Date.now(),
    });
    const chemCol = reportRef.collection('chemicals');
    const oldChems = await chemCol.get();
    oldChems.docs.forEach(d => batch.delete(d.ref));
    chemicals.forEach(c => batch.set(chemCol.doc(), { chemicalName: c.chemical_name, quantity: c.quantity }));
    await batch.commit();

    res.json({ ok: true, report_id: req.params.id });
  });

  app.post('/api/admin/bookings/:id/report/approve', requireAdmin, async (req, res) => {
    const ref = db.collection('serviceReports').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'No report to approve.' });
    await ref.update({ approved: true });
    res.json({ ok: true });
  });

  // [PROCESSING] forward-only status machine + auto-invoice on completion,
  // both validated and written inside a single transaction so the booking
  // can never end up "completed" without a payment record, or vice versa.
  app.post('/api/admin/bookings/:id/status', requireAdmin, async (req, res) => {
    const { status } = req.body;
    const bookingRef = db.collection('bookings').doc(req.params.id);

    try {
      await db.runTransaction(async tx => {
        const bSnap = await tx.get(bookingRef);
        if (!bSnap.exists) { const e = new Error('Booking not found.'); e.code = 'NOT_FOUND'; throw e; }
        const b = bSnap.data();
        if (!isValidTransition(b.status, status)) {
          const e = new Error(`Illegal status change ${b.status} -> ${status}. Must follow pending → confirmed → in progress → completed.`);
          e.code = 'BAD_TRANSITION'; throw e;
        }
        if (status === 'completed') {
          const reportSnap = await tx.get(db.collection('serviceReports').doc(req.params.id));
          if (!reportSnap.exists || !reportSnap.data().approved) {
            const e = new Error('Cannot complete: an approved service report is required first.');
            e.code = 'NO_APPROVED_REPORT'; throw e;
          }
          const svcSnap = await tx.get(db.collection('serviceTypes').doc(b.serviceTypeId));
          const payRef = db.collection('payments').doc(req.params.id);
          const paySnap = await tx.get(payRef);
          if (!paySnap.exists) {
            tx.set(payRef, { amount: svcSnap.data().price, status: 'unpaid', method: null, createdAt: Date.now() });
          }
        }
        tx.update(bookingRef, { status });
      });
    } catch (e) {
      if (e.code === 'NOT_FOUND') return res.status(404).json({ error: e.message });
      if (e.code === 'BAD_TRANSITION' || e.code === 'NO_APPROVED_REPORT') return res.status(409).json({ error: e.message });
      throw e;
    }

    res.json(await getBookingView(req.params.id));
  });

  // [OUTPUT] invoice amount is always read from ServiceType, never
  // user-supplied, so it can never drift from the booked service price.
  app.post('/api/admin/bookings/:id/invoice', requireAdmin, async (req, res) => {
    const bView = await getBookingView(req.params.id);
    if (!bView) return res.status(404).json({ error: 'Booking not found.' });
    const ref = db.collection('payments').doc(req.params.id);
    const snap = await ref.get();
    if (snap.exists) return res.json({ payment_id: req.params.id, booking_id: req.params.id, ...snap.data() });
    const data = { amount: bView.service_price, status: 'unpaid', method: null, createdAt: Date.now() };
    await ref.set(data);
    res.json({ payment_id: req.params.id, booking_id: req.params.id, ...data });
  });

  // [ACCESS] refund requires the finance security key, independent of
  // the admin session token already required by requireAdmin above.
  app.post('/api/admin/bookings/:id/refund', requireAdmin, async (req, res) => {
    const { security_key } = req.body;
    if (security_key !== REFUND_KEY)
      return res.status(403).json({ error: 'Invalid finance security key. Refund denied.' });
    const ref = db.collection('payments').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'No payment to refund.' });
    if (snap.data().status !== 'paid') return res.status(409).json({ error: 'Only paid invoices can be refunded.' });
    await ref.update({ status: 'refunded' });
    res.json({ ok: true, status: 'refunded' });
  });

  app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
    const [bookingsSnap, paymentsSnap, feedbackSnap, techniciansSnap] = await Promise.all([
      db.collection('bookings').get(),
      db.collection('payments').get(),
      db.collection('feedback').get(),
      db.collection('technicians').get(),
    ]);
    const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const payments = paymentsSnap.docs.map(d => d.data());
    const feedback = feedbackSnap.docs.map(d => ({ bookingId: d.id, ...d.data() }));

    const total = bookings.length;
    const completed = bookings.filter(b => b.status === 'completed').length;
    const inProgress = bookings.filter(b => b.status === 'in progress').length;
    const confirmed = bookings.filter(b => b.status === 'confirmed').length;
    const revenue = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

    const techPerf = techniciansSnap.docs.map(t => {
      const myBookings = bookings.filter(b => b.technicianId === t.id);
      const myFeedback = feedback.filter(f => myBookings.some(b => b.id === f.bookingId));
      const avg = myFeedback.length ? myFeedback.reduce((s, f) => s + f.rating, 0) / myFeedback.length : null;
      return { name: t.data().name, jobs: myBookings.length, avg_rating: avg !== null ? Math.round(avg * 100) / 100 : null };
    }).sort((a, b) => b.jobs - a.jobs);

    res.json({
      total_bookings: total, completed, in_progress: inProgress, confirmed,
      revenue, reviews: feedback.length,
      completion_rate: total ? Math.round((completed / total) * 100) : 0,
      technician_performance: techPerf,
    });
  });

  /* ----------------------------- static sites ----------------------------- */
  // (moved to the top of this function — see the comment there for why)

  return app;
}

module.exports = createApp;
