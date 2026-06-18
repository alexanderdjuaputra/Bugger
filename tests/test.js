/* =====================================================================
   tests/test.js
   ---------------------------------------------------------------------
   Runs the full customer -> ops -> admin flow through the real HTTP API,
   against an in-memory Firestore-compatible stand-in (see
   firestoreMemoryShim.js). This verifies server-app.js's business logic
   and every control is correct. It does NOT verify your real Firebase
   project's network reachability, billing status, or security rules —
   those depend on your own account and can only be confirmed by you
   running `npm run seed` then clicking through the app once after you
   deploy (see PANDUAN_DEPLOY.md, "Uji coba sebelum go-live").
   ===================================================================== */

const http = require('http');
const createApp = require('../server-app');
const createMemoryFirestore = require('./firestoreMemoryShim');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓', label); }
  else { fail++; console.log('  ✗ FAIL:', label); }
}

function req(server, method, p, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: server.address().port, path: p, method,
      headers: { 'Content-Type': 'application/json',
                 ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers },
    };
    const r = http.request(opts, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => { let j = {}; try { j = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, body: j }); });
    });
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  // A single shared in-memory store, used by TWO separate Express app
  // instances below — this simulates two different Vercel serverless
  // cold starts both talking to the same real Firestore project.
  const sharedStore = createMemoryFirestore();

  const appInstanceA = createApp(sharedStore); // "cold start #1" — handles login
  const serverA = appInstanceA.listen(0);
  await new Promise(r => serverA.once('listening', r));

  try {
    console.log('\n— Customer flow —');
    let r = await req(serverA, 'POST', '/api/customers/register',
      { name: 'Test User', email: 't@t.com', phone: '0812345678', address: 'Jl Test 1', password: 'pw' });
    ok(r.status === 200 && r.body.customer_id, 'register customer');
    const cid = r.body.customer_id;

    r = await req(serverA, 'POST', '/api/customers/register',
      { name: 'Bad', email: 'b@b.com', phone: '12ab', address: 'x', password: 'pw' });
    ok(r.status === 400, '[INPUT] rejects non-numeric phone');

    r = await req(serverA, 'POST', '/api/bookings',
      { customer_id: cid, service_type_id: 1, booking_date: '2000-01-01', preferred_time: '09:00', address: 'A' });
    ok(r.status === 400, '[INPUT] rejects past booking date');

    r = await req(serverA, 'POST', '/api/bookings', { customer_id: cid, service_type_id: 1 });
    ok(r.status === 400, '[INPUT] rejects booking with missing fields');

    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    r = await req(serverA, 'POST', '/api/bookings',
      { customer_id: cid, service_type_id: 1, booking_date: future, preferred_time: '08:30', address: 'A', property_type: 'house', phone: '081234567890' });
    ok(r.status === 400 && r.body.code === 'INVALID_TIME_SLOT', '[INPUT] rejects a time outside the 09:00-18:00 slot list');

    r = await req(serverA, 'POST', '/api/bookings',
      { customer_id: cid, service_type_id: 1, booking_date: future, preferred_time: '09:00', address: 'A', property_type: 'castle', phone: '081234567890' });
    ok(r.status === 400 && r.body.code === 'INVALID_PROPERTY_TYPE', '[INPUT] rejects an invalid property type');

    r = await req(serverA, 'GET', `/api/availability?date=${future}`);
    ok(r.status === 200 && r.body.slots['09:00'] === true, 'availability endpoint returns open slots for a fresh date');

    r = await req(serverA, 'POST', '/api/bookings',
      { customer_id: cid, service_type_id: 1, booking_date: future, preferred_time: '10:00', address: 'Jl Test 1', pest_notes: 'termites in frame', property_type: 'house', phone: '081234567890' });
    ok(r.status === 200 && r.body.status === 'confirmed', 'create booking (Termites)');
    const bid = r.body.booking_id;

    console.log('\n— Access control —');
    r = await req(serverA, 'GET', '/api/admin/bookings');
    ok(r.status === 401, '[ACCESS] management API blocked without login');

    r = await req(serverA, 'POST', '/api/admin/login', { username: 'admin', password: 'wrong' });
    ok(r.status === 401, '[ACCESS] wrong admin password rejected');

    r = await req(serverA, 'POST', '/api/admin/login', { username: 'admin', password: 'test' });
    ok(r.status === 200 && r.body.token, '[ACCESS] admin/test login works');
    const token = r.body.token;
    const H = { 'x-admin-token': token };

    console.log('\n— Integration: booking visible to ops —');
    r = await req(serverA, 'GET', '/api/admin/bookings', null, H);
    ok(r.status === 200 && r.body.some(b => b.booking_id === bid), 'customer booking appears in management queue');

    console.log('\n— Simulated Vercel cold start: a brand-new app instance, same Firestore —');
    const appInstanceB = createApp(sharedStore); // "cold start #2" — different process, same data
    const serverB = appInstanceB.listen(0);
    await new Promise(res => serverB.once('listening', res));
    r = await req(serverB, 'GET', '/api/admin/bookings', null, H);
    ok(r.status === 200 && r.body.length > 0,
       '[ACCESS] admin token from instance A is still valid on instance B (session stored in Firestore, not local memory — this is the fix for the Vercel multi-instance bug)');

    console.log('\n— Assign + double-booking (continuing on instance B) —');
    r = await req(serverB, 'POST', `/api/admin/bookings/${bid}/assign`, { technician_id: 1 }, H);
    ok(r.status === 200 && r.body.status === 'in progress', 'assign technician moves to in progress');

    let r2 = await req(serverB, 'POST', '/api/bookings',
      { customer_id: cid, service_type_id: 2, booking_date: future, preferred_time: '10:00', address: 'Jl Test 1', property_type: 'apartment', phone: '081234567890' });
    const bid2 = r2.body.booking_id;
    r = await req(serverB, 'POST', `/api/admin/bookings/${bid2}/assign`, { technician_id: 1 }, H);
    ok(r.status === 409, '[INPUT] double-booking prevented (same tech/date/slot)');

    console.log('\n— All technicians booked -> slot should become unavailable —');
    const slotDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10); // a fresh date, untouched so far
    const slotTime = '15:00';
    const bidsForSlot = [];
    for (let i = 0; i < 3; i++) {
      const rb = await req(serverB, 'POST', '/api/bookings',
        { customer_id: cid, service_type_id: 1, booking_date: slotDate, preferred_time: slotTime,
          address: 'Jl Penuh', property_type: 'house', phone: '081234567890' });
      bidsForSlot.push(rb.body.booking_id);
    }
    // assign all 3 technicians (1, 2, 3) to that same date+slot across the 3 bookings
    for (let i = 0; i < 3; i++) {
      const ra = await req(serverB, 'POST', `/api/admin/bookings/${bidsForSlot[i]}/assign`, { technician_id: i + 1 }, H);
      ok(ra.status === 200, `assign technician ${i + 1} to fill the shared slot`);
    }
    r = await req(serverB, 'GET', `/api/availability?date=${slotDate}`);
    ok(r.status === 200 && r.body.slots[slotTime] === false,
       '[OUTPUT] availability endpoint reports the now-full slot as unavailable');

    r = await req(serverB, 'POST', '/api/bookings',
      { customer_id: cid, service_type_id: 1, booking_date: slotDate, preferred_time: slotTime,
        address: 'Jl Penuh', property_type: 'house', phone: '081234567890' });
    ok(r.status === 409 && r.body.code === 'SLOT_FULL',
       '[INPUT] a 4th booking on the same fully-booked slot is rejected server-side');

    console.log('\n— Processing controls —');
    r = await req(serverB, 'POST', `/api/admin/bookings/${bid}/status`, { status: 'completed' }, H);
    ok(r.status === 409, '[PROCESSING] cannot complete without approved report');

    r = await req(serverB, 'POST', `/api/admin/bookings/${bid}/report`,
      { pest_found: 'Termites', severity: 'High', findings: 'colony', chemicals: [] }, H);
    ok(r.status === 400, '[PROCESSING] report rejected without chemicals');

    r = await req(serverB, 'POST', `/api/admin/bookings/${bid}/report`,
      { pest_found: 'Termites', severity: 'High', findings: 'active colony in frame',
        safety_notes: 'ventilate 2h', chemicals: [{ chemical_name: 'Fipronil', quantity: '250 ml' }] }, H);
    ok(r.status === 200, 'submit valid service report');

    r = await req(serverB, 'POST', `/api/admin/bookings/${bid}/report/approve`, {}, H);
    ok(r.status === 200, 'approve report');

    r = await req(serverB, 'POST', `/api/admin/bookings/${bid}/report`,
      { pest_found: 'X', severity: 'Low', findings: 'changed', chemicals: [{ chemical_name: 'a', quantity: '1' }] }, H);
    ok(r.status === 409, '[OUTPUT] approved report is locked from edits');

    r = await req(serverB, 'POST', `/api/admin/bookings/${bid}/status`, { status: 'pending' }, H);
    ok(r.status === 409, '[PROCESSING] illegal backward status change blocked');

    r = await req(serverB, 'POST', `/api/admin/bookings/${bid}/status`, { status: 'completed' }, H);
    ok(r.status === 200 && r.body.status === 'completed', 'mark completed');

    r = await req(serverB, 'GET', `/api/customers/${cid}/bookings`);
    const done = r.body.find(b => b.booking_id === bid);
    ok(done.invoice_amount === 500000, '[OUTPUT] auto-invoice amount matches service price (Rp500.000)');

    console.log('\n— Payment, feedback, refund —');
    r = await req(serverB, 'POST', `/api/bookings/${bid}/pay`, { method: 'app' });
    ok(r.status === 200, 'customer pays invoice');

    r = await req(serverB, 'POST', `/api/bookings/${bid}/feedback`, { customer_id: cid, rating: 9, comment: 'x' });
    ok(r.status === 400, '[INPUT] rating outside 1–5 rejected');

    r = await req(serverB, 'POST', `/api/bookings/${bid}/feedback`, { customer_id: cid, rating: 5, comment: 'great' });
    ok(r.status === 200, 'valid 5-star feedback accepted');

    r = await req(serverB, 'POST', `/api/bookings/${bid}/feedback`, { customer_id: cid, rating: 4, comment: 'again' });
    ok(r.status === 409, '[PROCESSING] duplicate feedback for same booking rejected');

    r = await req(serverB, 'POST', `/api/admin/bookings/${bid}/refund`, { security_key: 'nope' }, H);
    ok(r.status === 403, '[ACCESS] refund blocked without finance key');

    r = await req(serverB, 'POST', `/api/admin/bookings/${bid}/refund`, { security_key: 'refund' }, H);
    ok(r.status === 200 && r.body.status === 'refunded', '[ACCESS] refund works with finance key "refund"');

    console.log('\n— Dashboard —');
    r = await req(serverB, 'GET', '/api/admin/dashboard', null, H);
    ok(r.status === 200 && r.body.completion_rate >= 0, 'dashboard aggregates load');
    ok(r.body.technician_performance.some(t => t.jobs > 0), 'technician performance reflects assigned jobs');

    serverA.close(); serverB.close();
  } catch (e) {
    console.error('Test crashed:', e); fail++;
  } finally {
    console.log(`\n==== ${pass} passed, ${fail} failed ====`);
    process.exit(fail ? 1 : 0);
  }
})();
