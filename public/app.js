/* BugBuster Pro — Customer app logic */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = n => 'Rp' + Number(n).toLocaleString('id-ID');
const TIME_SLOTS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

let customer = null;        // { customer_id, name, phone, address }
let services = [];
let lastBookingRows = [];   // cache for modal lookups without re-embedding text in HTML attrs

/* ======================================================================
   i18n — every visible string lives here, in English and Indonesian.
   ====================================================================== */
const DICT = {
  eyebrow: { en: 'Pest control, handled', id: 'Pengendalian hama, beres' },
  hero_h1: { en: 'Book a technician.<br/>Track them to your door.', id: 'Pesan teknisi.<br/>Pantau sampai ke depan pintu.' },
  hero_lead: { en: 'Termites, cockroaches, rats — pick a date, we dispatch the right specialist, and you watch the job from request to report.', id: 'Rayap, kecoa, tikus — pilih tanggal, kami kirim spesialis yang tepat, dan kamu bisa pantau dari pemesanan sampai laporan selesai.' },
  tab_login: { en: 'Log in', id: 'Masuk' },
  tab_register: { en: 'Create account', id: 'Buat akun' },
  label_email: { en: 'Email', id: 'Email' },
  label_password: { en: 'Password', id: 'Kata sandi' },
  btn_login: { en: 'Log in', id: 'Masuk' },
  hint_demo: { en: 'Demo account is pre-filled. Or create your own.', id: 'Akun demo sudah terisi. Atau buat akun sendiri.' },
  label_fullname: { en: 'Full name', id: 'Nama lengkap' },
  label_phone_numeric: { en: 'Phone (numbers only)', id: 'Nomor telepon (angka saja)' },
  label_address: { en: 'Address', id: 'Alamat' },
  btn_register: { en: 'Create account', id: 'Buat akun' },
  nav_book: { en: 'Book service', id: 'Pesan layanan' },
  nav_bookings: { en: 'My bookings', id: 'Pesanan saya' },
  book_title: { en: 'Book a service', id: 'Pesan layanan' },
  label_service_type: { en: 'Service type', id: 'Jenis layanan' },
  label_property_type: { en: 'Property type', id: 'Jenis properti' },
  property_house: { en: 'House', id: 'Rumah' },
  property_apartment: { en: 'Apartment', id: 'Apartemen' },
  label_preferred_time: { en: 'Preferred time (09:00–18:00)', id: 'Waktu yang diinginkan (09:00–18:00)' },
  label_pest_details: { en: 'Pest details (what are you seeing?)', id: 'Detail hama (apa yang kamu lihat?)' },
  placeholder_pest_notes: { en: 'e.g. droppings in the kitchen, scratching in the ceiling at night', id: 'misal: kotoran di dapur, suara di langit-langit malam hari' },
  price_label: { en: 'Price', id: 'Harga' },
  btn_confirm_booking: { en: 'Confirm booking', id: 'Konfirmasi pesanan' },
  bookings_title: { en: 'My bookings', id: 'Pesanan saya' },
  no_bookings: { en: 'No bookings yet.', id: 'Belum ada pesanan.' },
  awaiting_tech: { en: 'Awaiting technician assignment', id: 'Menunggu penugasan teknisi' },
  technician_label: { en: 'Technician', id: 'Teknisi' },
  property_label: { en: 'Property', id: 'Properti' },
  phone_label: { en: 'Phone', id: 'Telepon' },
  step_confirmed: { en: 'Confirmed', id: 'Terkonfirmasi' },
  step_inprogress: { en: 'In progress', id: 'Sedang dikerjakan' },
  step_completed: { en: 'Completed', id: 'Selesai' },
  btn_view_report: { en: 'View report', id: 'Lihat laporan' },
  btn_pay: { en: 'Pay', id: 'Bayar' },
  pill_paid: { en: 'Paid', id: 'Sudah dibayar' },
  pill_refunded: { en: 'Refunded', id: 'Direfund' },
  btn_leave_review: { en: 'Leave review', id: 'Beri ulasan' },
  reviewed_tag: { en: 'Reviewed ✓', id: 'Sudah diulas ✓' },
  nothing_to_do: { en: 'Nothing to do yet — sit tight.', id: 'Belum ada yang perlu dilakukan — tunggu sebentar.' },
  report_title: { en: 'Service report', id: 'Laporan layanan' },
  report_pest_found: { en: 'Pest found', id: 'Hama ditemukan' },
  report_severity: { en: 'Severity', id: 'Tingkat keparahan' },
  report_findings: { en: 'Findings', id: 'Temuan' },
  report_safety: { en: 'Safety notes', id: 'Catatan keamanan' },
  report_chemicals: { en: 'Chemicals used', id: 'Bahan kimia yang digunakan' },
  report_none: { en: 'None recorded', id: 'Tidak ada yang tercatat' },
  report_locked: { en: 'Approved & locked', id: 'Disetujui & terkunci' },
  review_title: { en: 'Rate your service', id: 'Beri nilai layanan' },
  review_comment_label: { en: 'Comment', id: 'Komentar' },
  review_comment_placeholder: { en: 'How did it go?', id: 'Bagaimana pengalamannya?' },
  btn_submit_review: { en: 'Submit review', id: 'Kirim ulasan' },
  err_pick_rating: { en: 'Please pick a star rating.', id: 'Silakan pilih jumlah bintang.' },
  pay_title: { en: 'Choose payment method', id: 'Pilih metode pembayaran' },
  pay_card: { en: 'Card', id: 'Kartu' },
  pay_qris: { en: 'QRIS', id: 'QRIS' },
  pay_card_number: { en: 'Card Number', id: 'Nomor Kartu' },
  pay_expiry: { en: 'Expiry Date', id: 'Tanggal Kedaluwarsa' },
  pay_cvv: { en: 'CVV', id: 'CVV' },
  pay_qris_caption: { en: 'Scan with any QRIS-supported e-wallet app.', id: 'Pindai dengan aplikasi e-wallet pendukung QRIS.' },
  pay_demo_tag: { en: 'DEMO — no real payment is processed', id: 'DEMO — tidak ada pembayaran nyata yang diproses' },
  btn_submit_payment: { en: 'Submit Payment', id: 'Kirim Pembayaran' },
  err_fill_card: { en: 'Please fill in all card fields.', id: 'Mohon isi semua kolom kartu.' },
  msg_booking_confirmed: { en: '✓ Booking confirmed. Operations has been notified.', id: '✓ Pesanan terkonfirmasi. Tim operasional sudah diberi tahu.' },
  checking_availability: { en: 'Checking availability…', id: 'Memeriksa ketersediaan…' },
  slot_full_notice: { en: 'No technician available at this time — please pick another slot.', id: 'Tidak ada teknisi tersedia pada waktu ini — silakan pilih waktu lain.' },
  all_slots_full: { en: 'All slots are full on this date. Please choose a different date.', id: 'Semua jam penuh pada tanggal ini. Silakan pilih tanggal lain.' },
  full_suffix: { en: ' (full)', id: ' (penuh)' },
  logout: { en: 'Log out', id: 'Keluar' },
  greeting: { en: 'Hi, ', id: 'Hai, ' },
  // server error codes -> localized messages
  err_MISSING_FIELDS: { en: 'Please fill in all required fields.', id: 'Mohon isi semua kolom yang wajib diisi.' },
  err_INVALID_PHONE: { en: 'Phone must be 6–15 digits, numbers only.', id: 'Nomor telepon harus 6–15 digit, angka saja.' },
  err_INVALID_EMAIL: { en: 'Invalid email format.', id: 'Format email tidak valid.' },
  err_EMAIL_TAKEN: { en: 'Email already registered.', id: 'Email sudah terdaftar.' },
  err_INVALID_CREDENTIALS: { en: 'Invalid email or password.', id: 'Email atau kata sandi salah.' },
  err_PAST_DATE: { en: 'Booking date must be today or in the future.', id: 'Tanggal pesanan harus hari ini atau setelahnya.' },
  err_INVALID_TIME_SLOT: { en: 'Please choose a valid time between 09:00 and 18:00.', id: 'Silakan pilih waktu yang valid antara 09:00 dan 18:00.' },
  err_INVALID_PROPERTY_TYPE: { en: 'Please choose a property type.', id: 'Silakan pilih jenis properti.' },
  err_UNKNOWN_CUSTOMER: { en: 'Unknown customer.', id: 'Pelanggan tidak dikenali.' },
  err_UNKNOWN_SERVICE: { en: 'Unknown service type.', id: 'Jenis layanan tidak dikenali.' },
  err_SLOT_FULL: { en: 'No technician is available at that date and time. Please choose a different slot.', id: 'Tidak ada teknisi tersedia di tanggal dan waktu itu. Silakan pilih waktu lain.' },
  err_NO_INVOICE: { en: 'No invoice generated yet.', id: 'Belum ada invoice yang dibuat.' },
  err_ALREADY_PAID: { en: 'Already paid.', id: 'Sudah dibayar.' },
  err_REFUNDED: { en: 'Payment was refunded.', id: 'Pembayaran sudah direfund.' },
  err_BOOKING_NOT_FOUND: { en: 'Booking not found.', id: 'Pesanan tidak ditemukan.' },
  err_NOT_YOUR_BOOKING: { en: 'You can only review your own booking.', id: 'Kamu hanya bisa mengulas pesananmu sendiri.' },
  err_NOT_COMPLETED: { en: 'You can only review a completed service.', id: 'Kamu hanya bisa mengulas layanan yang sudah selesai.' },
  err_INVALID_RATING: { en: 'Rating must be between 1 and 5.', id: 'Penilaian harus antara 1 dan 5.' },
  err_FEEDBACK_EXISTS: { en: 'Feedback already submitted for this booking.', id: 'Ulasan untuk pesanan ini sudah pernah dikirim.' },
};

let lang = localStorage.getItem('bb_lang') || 'id';
function t(key) { return (DICT[key] && DICT[key][lang]) || key; }
function translateApiError(body) {
  if (body && body.code && DICT['err_' + body.code]) return t('err_' + body.code);
  return (body && body.error) || (lang === 'id' ? 'Terjadi kesalahan.' : 'Something went wrong.');
}

function applyStaticTranslations() {
  $$('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  $$('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  document.documentElement.lang = lang;
}
function setLang(l) {
  lang = l;
  localStorage.setItem('bb_lang', l);
  applyStaticTranslations();
  if (customer) {
    updatePrice();
    loadBookings();
  }
}
$$('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
applyStaticTranslations();

/* ---------- API helper ---------- */
async function api(path, method = 'GET', body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch(path, opt);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(translateApiError(data));
  return data;
}

/* ---------- auth tabs ---------- */
$$('.tab').forEach(tb => tb.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  tb.classList.add('active');
  const isLogin = tb.dataset.tab === 'login';
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
  $('#topbarUser').innerHTML =
    `<span class="who">${t('greeting')}${customer.name}</span> &nbsp;
     <button class="linklike" id="logoutBtn">${t('logout')}</button>`;
  $('#logoutBtn').addEventListener('click', () => location.reload());

  services = await api('/api/service-types');
  const sel = $('#serviceSelect');
  sel.innerHTML = services.map(s => {
    const name = lang === 'id' ? (s.nameId || s.name) : s.name;
    return `<option value="${s.service_type_id}" data-price="${s.price}">${name} — ${money(s.price)}</option>`;
  }).join('');
  updatePrice();

  // time slot dropdown
  const timeSel = $('#bookTime');
  timeSel.innerHTML = TIME_SLOTS.map(s => `<option value="${s}">${s}</option>`).join('');

  $('#bookAddress').value = customer.address || '';
  $('#bookPhone').value = customer.phone || '';
  const today = new Date().toISOString().slice(0, 10);
  $('#bookDate').min = today; $('#bookDate').value = today;
  await refreshAvailability();
  loadBookings();
}

document.addEventListener('change', e => {
  if (e.target.id === 'serviceSelect') updatePrice();
  if (e.target.id === 'bookDate') refreshAvailability();
});
function updatePrice() {
  const o = $('#serviceSelect').selectedOptions[0];
  $('#priceTag').textContent = o ? money(o.dataset.price) : '—';
}

/* ---------- availability checking ---------- */
async function refreshAvailability() {
  const date = $('#bookDate').value;
  const msgEl = $('#availabilityMsg');
  const timeSel = $('#bookTime');
  if (!date) return;
  msgEl.className = 'msg full'; msgEl.textContent = t('checking_availability');
  try {
    const r = await api(`/api/availability?date=${date}`);
    let anyOpen = false;
    [...timeSel.options].forEach(opt => {
      const open = r.slots[opt.value] !== false;
      opt.disabled = !open;
      opt.textContent = open ? opt.value : opt.value + t('full_suffix');
      if (open) anyOpen = true;
    });
    if (!anyOpen) {
      msgEl.className = 'msg full err'; msgEl.textContent = t('all_slots_full');
    } else {
      // if the currently selected slot just became full, jump to the first open one
      if (timeSel.selectedOptions[0] && timeSel.selectedOptions[0].disabled) {
        const firstOpen = [...timeSel.options].find(o => !o.disabled);
        if (firstOpen) timeSel.value = firstOpen.value;
        msgEl.className = 'msg full err'; msgEl.textContent = t('slot_full_notice');
      } else {
        msgEl.textContent = '';
      }
    }
  } catch (err) {
    msgEl.textContent = '';
  }
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
  const propertyType = f.property_type.value;
  try {
    // one last availability check right before submitting (defense in
    // depth alongside the server-side check)
    const avail = await api(`/api/availability?date=${f.booking_date.value}`);
    if (avail.slots[f.preferred_time.value] === false) {
      setMsg('#bookMsg', t('slot_full_notice'), true);
      await refreshAvailability();
      return;
    }
    await api('/api/bookings', 'POST', {
      customer_id: customer.customer_id,
      service_type_id: f.service_type_id.value,
      booking_date: f.booking_date.value,
      preferred_time: f.preferred_time.value,
      address: f.address.value,
      pest_notes: f.pest_notes.value,
      property_type: propertyType,
      phone: f.phone.value,
    });
    setMsg('#bookMsg', t('msg_booking_confirmed'), false);
    f.pest_notes.value = '';
    loadBookings();
  } catch (err) { setMsg('#bookMsg', err.message, true); }
});

/* ---------- my bookings ---------- */
const STEPS = ['confirmed', 'in progress', 'completed'];
async function loadBookings() {
  const list = $('#bookingsList');
  const rows = await api(`/api/customers/${customer.customer_id}/bookings`);
  lastBookingRows = rows;
  if (!rows.length) { list.innerHTML = `<p class="hint">${t('no_bookings')}</p>`; return; }
  list.innerHTML = rows.map(renderBooking).join('');
  $$('[data-pay]').forEach(b => b.onclick = () => openPaymentModal(b.dataset.pay));
  $$('[data-report]').forEach(b => b.onclick = () => showReport(b.dataset.report));
  $$('[data-review]').forEach(b => b.onclick = () => showReviewForm(b.dataset.review));
}

function propertyLabel(p) {
  if (!p) return '—';
  return p === 'apartment' ? t('property_apartment') : t('property_house');
}
function serviceLabel(b) {
  return lang === 'id' ? (b.service_name_id || b.service_name) : b.service_name;
}

function renderBooking(b) {
  const statusClass = b.status.replace(/\s+/g, '');
  const stepIdx = STEPS.indexOf(b.status);
  const track = STEPS.map((_, i) =>
    `<div class="step ${i <= stepIdx && b.status !== 'pending' ? 'on' : ''}"></div>`).join('');
  const tech = b.technician_name ? `${t('technician_label')}: <strong>${b.technician_name}</strong>` : t('awaiting_tech');

  let actions = '';
  if (b.report_id) actions += `<button class="btn ghost small" data-report="${b.booking_id}">${t('btn_view_report')}</button>`;
  if (b.invoice_amount != null && b.payment_status === 'unpaid')
    actions += `<button class="btn lime small" data-pay="${b.booking_id}">${t('btn_pay')} ${money(b.invoice_amount)}</button>`;
  if (b.payment_status === 'paid') actions += `<span class="pill completed">${t('pill_paid')}</span>`;
  if (b.payment_status === 'refunded') actions += `<span class="pill cancelled">${t('pill_refunded')}</span>`;
  if (b.status === 'completed' && !b.feedback_id)
    actions += `<button class="btn primary small" data-review="${b.booking_id}">${t('btn_leave_review')}</button>`;
  if (b.feedback_id) actions += `<span class="pill confirmed">${t('reviewed_tag')}</span>`;

  return `<div class="bcard">
    <h3>${serviceLabel(b)}</h3>
    <span class="pill ${statusClass}">${translateStatus(b.status)}</span>
    <div class="meta">📅 ${b.booking_date} · ${b.preferred_time} &nbsp;·&nbsp; 📍 ${b.address}</div>
    <div class="meta">${tech} · ${money(b.service_price)}</div>
    <div class="meta">${t('property_label')}: ${propertyLabel(b.property_type)} &nbsp;·&nbsp; ${t('phone_label')}: ${b.phone || '—'}</div>
    <div class="tracker">${track}</div>
    <div class="tracker-labels"><span>${t('step_confirmed')}</span><span>${t('step_inprogress')}</span><span>${t('step_completed')}</span></div>
    <div class="actions">${actions || `<span class="hint">${t('nothing_to_do')}</span>`}</div>
  </div>`;
}

function translateStatus(s) {
  const map = {
    pending:        { en: 'pending', id: 'menunggu' },
    confirmed:      { en: 'confirmed', id: 'terkonfirmasi' },
    'in progress':  { en: 'in progress', id: 'sedang dikerjakan' },
    completed:      { en: 'completed', id: 'selesai' },
    cancelled:      { en: 'cancelled', id: 'dibatalkan' },
  };
  return (map[s] && map[s][lang]) || s;
}

/* ---------- payment modal (Card / QRIS) ---------- */
function openPaymentModal(id) {
  openModal(`
    <h3>${t('pay_title')}</h3>
    <span class="demo-tag">${t('pay_demo_tag')}</span>
    <div class="pay-tabs">
      <button type="button" class="pay-tab active" data-method="card">${t('pay_card')}</button>
      <button type="button" class="pay-tab" data-method="qris">${t('pay_qris')}</button>
    </div>
    <form id="payForm" class="form" style="padding:0">
      <div id="payCardPanel" class="card-grid">
        <label class="full">${t('pay_card_number')}<input id="ccNumber" placeholder="4111 1111 1111 1111" /></label>
        <label>${t('pay_expiry')}<input id="ccExpiry" placeholder="MM/YY" /></label>
        <label>${t('pay_cvv')}<input id="ccCvv" placeholder="123" maxlength="4" /></label>
      </div>
      <div id="payQrisPanel" class="qris-box hidden">
        ${qrCodeSvg()}
        <p class="qris-caption">${t('pay_qris_caption')}</p>
      </div>
      <button class="btn primary full" type="submit">${t('btn_submit_payment')}</button>
      <p class="msg err" id="payMsg"></p>
    </form>`);

  let method = 'card';
  $$('.pay-tab').forEach(tab => tab.onclick = () => {
    method = tab.dataset.method;
    $$('.pay-tab').forEach(x => x.classList.remove('active'));
    tab.classList.add('active');
    $('#payCardPanel').classList.toggle('hidden', method !== 'card');
    $('#payQrisPanel').classList.toggle('hidden', method !== 'qris');
  });

  $('#payForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (method === 'card') {
      if (!$('#ccNumber').value.trim() || !$('#ccExpiry').value.trim() || !$('#ccCvv').value.trim()) {
        setMsg('#payMsg', t('err_fill_card'), true);
        return;
      }
    }
    try {
      await api(`/api/bookings/${id}/pay`, 'POST', { method });
      closeModal(); loadBookings();
    } catch (err) { setMsg('#payMsg', err.message, true); }
  });
}

function qrCodeSvg() {
  // A static, recognizable QR-code-style pattern for this demo. It is NOT
  // a real scannable code — there is no real QRIS payment processor wired
  // up here, consistent with this being a demo/prototype feature.
  let cells = '';
  const grid = 11;
  const cell = 160 / grid;
  // deterministic pseudo-random pattern, fixed per app load (no real data encoded)
  let seed = 42;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const isCorner = (x < 3 && y < 3) || (x > grid - 4 && y < 3) || (x < 3 && y > grid - 4);
      const on = isCorner ? (x === 0 || x === 2 || y === 0 || y === 2 || (x > grid - 4 && (x === grid-1 || x === grid -3))) : rand() > 0.55;
      if (on) cells += `<rect x="${10 + x * cell}" y="${10 + y * cell}" width="${cell}" height="${cell}" fill="#14241d"/>`;
    }
  }
  return `<svg viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg"><rect width="180" height="180" fill="#fff"/>${cells}</svg>`;
}

/* ---------- report modal ---------- */
async function showReport(id) {
  try {
    const r = await api(`/api/bookings/${id}/report`);
    const chems = r.chemicals.map(c => `<div class="chem">• ${c.chemical_name} — ${c.quantity}</div>`).join('');
    openModal(`<h3>${t('report_title')} #${id}</h3>
      <div class="report-line"><span>${t('report_pest_found')}</span><span>${r.pest_found}</span></div>
      <div class="report-line"><span>${t('report_severity')}</span><span>${r.severity}</span></div>
      <div class="report-line"><span>${t('report_findings')}</span><span>${r.findings}</span></div>
      <div class="report-line"><span>${t('report_safety')}</span><span>${r.safety_notes || '—'}</span></div>
      <h4 style="margin:16px 0 6px">${t('report_chemicals')}</h4>${chems || `<p class="hint">${t('report_none')}</p>`}
      ${r.approved ? `<p class="pill completed" style="margin-top:14px">${t('report_locked')}</p>` : ''}`);
  } catch (err) { alert(err.message); }
}

/* ---------- review modal ---------- */
function showReviewForm(id) {
  openModal(`<h3>${t('review_title')}</h3>
    <form id="reviewForm" class="form" style="padding:0">
      <div class="stars">
        ${[5,4,3,2,1].map(n => `<input type="radio" name="rating" id="st${n}" value="${n}"><label for="st${n}">★</label>`).join('')}
      </div>
      <label>${t('review_comment_label')}<textarea name="comment" rows="3" placeholder="${t('review_comment_placeholder')}"></textarea></label>
      <button class="btn primary" type="submit">${t('btn_submit_review')}</button>
      <p class="msg" id="reviewMsg"></p>
    </form>`);
  $('#reviewForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const rating = f.rating.value;
    if (!rating) { setMsg('#reviewMsg', t('err_pick_rating'), true); return; }
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
