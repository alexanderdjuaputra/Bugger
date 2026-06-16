/* BugBuster Pro — Customer app logic */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = n => 'Rp' + Number(n).toLocaleString('id-ID');

let customer = null;        // { customer_id, name, phone, address }
let services = [];

/* ---------- API helper ---------- */
async function api(path, method = 'GET', body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch(path, opt);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ---------- auth tabs ---------- */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  const isLogin = t.dataset.tab === 'login';
  $('#loginForm').classList.toggle('hidden', !isLogin);
  $('#registerForm').classList.toggle('hidden', isLogin);
  $('#authMsg').textContent = '';
}));

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  try {
    customer = await api('/api/customers/login', 'POST',
      { email: f.email.value, password: f.password.value });
    enterApp();
  } catch (err) { setMsg('#authMsg', err.message, true); }
});

$('#registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  try {
    const r = await api('/api/customers/register', 'POST', {
      name: f.name.value, email: f.email.value, phone: f.phone.value,
      address: f.address.value, password: f.password.value
    });
    customer = { customer_id: r.customer_id, name: r.name,
                 phone: f.phone.value, address: f.address.value };
    enterApp();
  } catch (err) { setMsg('#authMsg', err.message, true); }
});

function setMsg(sel, text, isErr) {
  const el = $(sel); el.textContent = text;
  el.className = 'msg ' + (isErr ? 'err' : 'ok');
}

/* ---------- enter app ---------- */
async function enterApp() {
  $('#view-auth').classList.add('hidden');
  $('#view-app').classList.remove('hidden');
  $('#topbarRight').innerHTML =
    `<span class="who">Hi, ${customer.name}</span>
     <button class="linklike" id="logoutBtn">Log out</button>`;
  $('#logoutBtn').addEventListener('click', () => location.reload());

  services = await api('/api/service-types');
  const sel = $('#serviceSelect');
  sel.innerHTML = services.map(s =>
    `<option value="${s.service_type_id}" data-price="${s.price}">${s.name} — ${money(s.price)}</option>`).join('');
  updatePrice();
  // defaults
  $('#bookAddress').value = customer.address || '';
  const today = new Date().toISOString().slice(0, 10);
  $('#bookDate').min = today; $('#bookDate').value = today;
  loadBookings();
}

$('#serviceSelect') && document.addEventListener('change', e => {
  if (e.target.id === 'serviceSelect') updatePrice();
});
function updatePrice() {
  const o = $('#serviceSelect').selectedOptions[0];
  $('#priceTag').textContent = o ? money(o.dataset.price) : '—';
}

/* ---------- panels ---------- */
$$('.navbtn').forEach(b => b.addEventListener('click', () => {
  $$('.navbtn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  const p = b.dataset.panel;
  $('#panel-book').classList.toggle('hidden', p !== 'book');
  $('#panel-bookings').classList.toggle('hidden', p !== 'bookings');
  if (p === 'bookings') loadBookings();
}));

/* ---------- create booking ---------- */
$('#bookForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/bookings', 'POST', {
      customer_id: customer.customer_id,
      service_type_id: f.service_type_id.value,
      booking_date: f.booking_date.value,
      preferred_time: f.preferred_time.value,
      address: f.address.value,
      pest_notes: f.pest_notes.value
    });
    setMsg('#bookMsg', '✓ Booking confirmed. Operations has been notified.', false);
    f.pest_notes.value = '';
    loadBookings();
  } catch (err) { setMsg('#bookMsg', err.message, true); }
});

/* ---------- my bookings ---------- */
const STEPS = ['confirmed', 'in progress', 'completed'];
async function loadBookings() {
  const list = $('#bookingsList');
  const rows = await api(`/api/customers/${customer.customer_id}/bookings`);
  if (!rows.length) { list.innerHTML = `<p class="hint">No bookings yet.</p>`; return; }
  list.innerHTML = rows.map(renderBooking).join('');
  // wire buttons
  $$('[data-pay]').forEach(b => b.onclick = () => payInvoice(b.dataset.pay));
  $$('[data-report]').forEach(b => b.onclick = () => showReport(b.dataset.report));
  $$('[data-review]').forEach(b => b.onclick = () => showReviewForm(b.dataset.review));
}

function renderBooking(b) {
  const statusClass = b.status.replace(/\s+/g, '');
  const stepIdx = STEPS.indexOf(b.status);
  const track = STEPS.map((_, i) =>
    `<div class="step ${i <= stepIdx && b.status !== 'pending' ? 'on' : ''}"></div>`).join('');
  const tech = b.technician_name ? `Technician: <strong>${b.technician_name}</strong>` : 'Awaiting technician assignment';

  let actions = '';
  if (b.report_id) actions += `<button class="btn ghost small" data-report="${b.booking_id}">View report</button>`;
  if (b.invoice_amount != null && b.payment_status === 'unpaid')
    actions += `<button class="btn lime small" data-pay="${b.booking_id}">Pay ${money(b.invoice_amount)}</button>`;
  if (b.payment_status === 'paid') actions += `<span class="pill completed">Paid</span>`;
  if (b.payment_status === 'refunded') actions += `<span class="pill cancelled">Refunded</span>`;
  if (b.status === 'completed' && !b.feedback_id)
    actions += `<button class="btn primary small" data-review="${b.booking_id}">Leave review</button>`;
  if (b.feedback_id) actions += `<span class="pill confirmed">Reviewed ✓</span>`;

  return `<div class="bcard">
    <h3>${b.service_name}</h3>
    <span class="pill ${statusClass}">${b.status}</span>
    <div class="meta">📅 ${b.booking_date} · ${b.preferred_time} &nbsp;·&nbsp; 📍 ${b.address}</div>
    <div class="meta">${tech} · ${money(b.service_price)}</div>
    <div class="tracker">${track}</div>
    <div class="tracker-labels"><span>Confirmed</span><span>In progress</span><span>Completed</span></div>
    <div class="actions">${actions || '<span class="hint">Nothing to do yet — sit tight.</span>'}</div>
  </div>`;
}

/* ---------- pay ---------- */
async function payInvoice(id) {
  try { await api(`/api/bookings/${id}/pay`, 'POST', { method: 'app' }); loadBookings(); }
  catch (err) { alert(err.message); }
}

/* ---------- report modal ---------- */
async function showReport(id) {
  try {
    const r = await api(`/api/bookings/${id}/report`);
    const chems = r.chemicals.map(c => `<div class="chem">• ${c.chemical_name} — ${c.quantity}</div>`).join('');
    openModal(`<h3>Service report #${id}</h3>
      <div class="report-line"><span>Pest found</span><span>${r.pest_found}</span></div>
      <div class="report-line"><span>Severity</span><span>${r.severity}</span></div>
      <div class="report-line"><span>Findings</span><span>${r.findings}</span></div>
      <div class="report-line"><span>Safety notes</span><span>${r.safety_notes || '—'}</span></div>
      <h4 style="margin:16px 0 6px">Chemicals used</h4>${chems || '<p class="hint">None recorded</p>'}
      ${r.approved ? '<p class="pill completed" style="margin-top:14px">Approved & locked</p>' : ''}`);
  } catch (err) { alert(err.message); }
}

/* ---------- review modal ---------- */
function showReviewForm(id) {
  openModal(`<h3>Rate your service</h3>
    <form id="reviewForm" class="form" style="padding:0">
      <div class="stars">
        ${[5,4,3,2,1].map(n => `<input type="radio" name="rating" id="st${n}" value="${n}"><label for="st${n}">★</label>`).join('')}
      </div>
      <label>Comment<textarea name="comment" rows="3" placeholder="How did it go?"></textarea></label>
      <button class="btn primary" type="submit">Submit review</button>
      <p class="msg" id="reviewMsg"></p>
    </form>`);
  $('#reviewForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const rating = f.rating.value;
    if (!rating) { setMsg('#reviewMsg', 'Please pick a star rating.', true); return; }
    try {
      await api(`/api/bookings/${id}/feedback`, 'POST',
        { customer_id: customer.customer_id, rating, comment: f.comment.value });
      closeModal(); loadBookings();
    } catch (err) { setMsg('#reviewMsg', err.message, true); }
  });
}

/* ---------- modal helpers ---------- */
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
