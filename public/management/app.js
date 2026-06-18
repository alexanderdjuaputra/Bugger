/* BugBuster Pro — Management console logic */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = n => 'Rp' + Number(n).toLocaleString('id-ID');

let token = null;
let technicians = [];
let lastQueueRows = [];

/* ======================================================================
   i18n
   ====================================================================== */
const DICT = {
  gate_sub: { en: 'Operations &amp; Admin Console', id: 'Konsol Operasional &amp; Admin' },
  label_username: { en: 'Username', id: 'Nama pengguna' },
  label_password: { en: 'Password', id: 'Kata sandi' },
  btn_signin: { en: 'Sign in', id: 'Masuk' },
  gate_hint: { en: 'Restricted area — staff only.', id: 'Area terbatas — khusus staf.' },
  nav_dashboard: { en: 'Dashboard', id: 'Dasbor' },
  nav_bookings: { en: 'Bookings', id: 'Pesanan' },
  btn_signout: { en: 'Sign out', id: 'Keluar' },
  dashboard_title: { en: 'Management dashboard', id: 'Dasbor manajemen' },
  tech_perf_title: { en: 'Technician performance', id: 'Performa teknisi' },
  th_technician: { en: 'Technician', id: 'Teknisi' },
  th_jobs: { en: 'Jobs', id: 'Pekerjaan' },
  th_avg_rating: { en: 'Avg rating', id: 'Rating rata-rata' },
  queue_title: { en: 'Bookings queue', id: 'Antrean pesanan' },
  btn_refresh: { en: '↻ Refresh', id: '↻ Segarkan' },
  kpi_total: { en: 'Total bookings', id: 'Total pesanan' },
  kpi_completed: { en: 'Completed', id: 'Selesai' },
  kpi_inprogress: { en: 'In progress', id: 'Sedang dikerjakan' },
  kpi_rate: { en: 'Completion rate', id: 'Tingkat penyelesaian' },
  kpi_revenue: { en: 'Revenue (paid)', id: 'Pendapatan (dibayar)' },
  kpi_reviews: { en: 'Reviews', id: 'Ulasan' },
  no_bookings: { en: 'No bookings yet.', id: 'Belum ada pesanan.' },
  unassigned: { en: 'unassigned', id: 'belum ditugaskan' },
  customer_label: { en: 'Customer', id: 'Pelanggan' },
  technician_label: { en: 'Technician', id: 'Teknisi' },
  property_label: { en: 'Property', id: 'Properti' },
  phone_label: { en: 'Phone', id: 'Telepon' },
  btn_assign: { en: 'Assign technician', id: 'Tugaskan teknisi' },
  btn_edit_report: { en: 'Edit report', id: 'Edit laporan' },
  btn_submit_report: { en: 'Submit report', id: 'Kirim laporan' },
  btn_approve_report: { en: 'Approve report', id: 'Setujui laporan' },
  btn_view_report_locked: { en: 'View report 🔒', id: 'Lihat laporan 🔒' },
  btn_complete_invoice: { en: 'Mark completed + invoice', id: 'Tandai selesai + invoice' },
  btn_generate_invoice: { en: 'Generate invoice', id: 'Buat invoice' },
  btn_refund: { en: 'Refund', id: 'Refund' },
  btn_view_review: { en: 'View review', id: 'Lihat ulasan' },
  no_actions: { en: 'No actions available', id: 'Tidak ada aksi tersedia' },
  assign_title: { en: 'Assign technician — booking', id: 'Tugaskan teknisi — pesanan' },
  assign_label: { en: 'Technician', id: 'Teknisi' },
  assign_hint: { en: 'Double-booking is blocked automatically if the slot clashes.', id: 'Penjadwalan ganda otomatis diblokir jika waktunya bertabrakan.' },
  btn_assign_confirm: { en: 'Assign', id: 'Tugaskan' },
  report_title: { en: 'Service report — booking', id: 'Laporan layanan — pesanan' },
  label_pest_found: { en: 'Pest found', id: 'Hama ditemukan' },
  label_severity: { en: 'Severity', id: 'Tingkat keparahan' },
  sev_low: { en: 'Low', id: 'Rendah' },
  sev_medium: { en: 'Medium', id: 'Sedang' },
  sev_high: { en: 'High', id: 'Tinggi' },
  label_findings: { en: 'Findings', id: 'Temuan' },
  label_safety: { en: 'Safety notes', id: 'Catatan keamanan' },
  chemicals_used: { en: 'Chemicals used', id: 'Bahan kimia yang digunakan' },
  chem_name_placeholder: { en: 'Chemical name', id: 'Nama bahan kimia' },
  chem_qty_placeholder: { en: 'Qty e.g. 250 ml', id: 'Jumlah misal 250 ml' },
  btn_add_chemical: { en: '+ Add chemical', id: '+ Tambah bahan kimia' },
  btn_save_report: { en: 'Save report', id: 'Simpan laporan' },
  report_locked_title: { en: 'Report', id: 'Laporan' },
  report_locked_suffix: { en: '🔒 (locked)', id: '🔒 (terkunci)' },
  chemicals_heading: { en: 'Chemicals', id: 'Bahan Kimia' },
  confirm_approve: { en: 'Approve and LOCK this report? It cannot be edited afterward.', id: 'Setujui dan KUNCI laporan ini? Tidak dapat diedit setelahnya.' },
  refund_title: { en: 'Issue refund — booking', id: 'Proses refund — pesanan' },
  refund_hint: { en: 'Refunds require the finance security key.', id: 'Refund membutuhkan kunci keamanan finance.' },
  label_security_key: { en: 'Security key', id: 'Kunci keamanan' },
  btn_confirm_refund: { en: 'Confirm refund', id: 'Konfirmasi refund' },
  review_title: { en: 'Customer review — booking', id: 'Ulasan pelanggan — pesanan' },
  review_rating_label: { en: 'Rating', id: 'Penilaian' },
  review_comment_label: { en: 'Comment', id: 'Komentar' },
  review_no_comment: { en: 'No comment left.', id: 'Tidak ada komentar.' },
  // server error codes -> localized messages
  err_INVALID_ADMIN_CREDENTIALS: { en: 'Invalid admin credentials.', id: 'Kredensial admin tidak valid.' },
  err_BOOKING_NOT_FOUND: { en: 'Booking not found.', id: 'Pesanan tidak ditemukan.' },
  err_UNKNOWN_TECHNICIAN: { en: 'Unknown technician.', id: 'Teknisi tidak dikenali.' },
  err_DOUBLE_BOOKED: { en: 'That technician is already booked at this date and time.', id: 'Teknisi itu sudah dijadwalkan pada tanggal dan waktu ini.' },
  err_NO_TECHNICIAN: { en: 'Assign a technician before reporting.', id: 'Tugaskan teknisi sebelum membuat laporan.' },
  err_MISSING_REPORT_FIELDS: { en: 'Pest found, severity and findings are required.', id: 'Hama ditemukan, tingkat keparahan, dan temuan wajib diisi.' },
  err_MISSING_CHEMICALS: { en: 'At least one chemical (name + quantity) is required.', id: 'Minimal satu bahan kimia (nama + jumlah) wajib diisi.' },
  err_REPORT_LOCKED: { en: 'Report is approved and locked; cannot edit.', id: 'Laporan sudah disetujui dan terkunci; tidak dapat diedit.' },
  err_NO_REPORT: { en: 'No report to approve.', id: 'Tidak ada laporan untuk disetujui.' },
  err_NOT_FOUND: { en: 'Booking not found.', id: 'Pesanan tidak ditemukan.' },
  err_BAD_TRANSITION: { en: 'Illegal status change.', id: 'Perubahan status tidak diizinkan.' },
  err_NO_APPROVED_REPORT: { en: 'Cannot complete: an approved service report is required first.', id: 'Tidak dapat menyelesaikan: laporan layanan yang disetujui diperlukan terlebih dahulu.' },
  err_INVALID_REFUND_KEY: { en: 'Invalid finance security key. Refund denied.', id: 'Kunci keamanan finance tidak valid. Refund ditolak.' },
  err_NO_PAYMENT: { en: 'No payment to refund.', id: 'Tidak ada pembayaran untuk direfund.' },
  err_NOT_PAID: { en: 'Only paid invoices can be refunded.', id: 'Hanya invoice yang sudah dibayar yang bisa direfund.' },
};

let lang = localStorage.getItem('bb_lang') || 'id';
function t(key) { return (DICT[key] && DICT[key][lang]) || key; }
function translateApiError(body) {
  if (body && body.code && DICT['err_' + body.code]) return t('err_' + body.code);
  return (body && body.error) || (lang === 'id' ? 'Terjadi kesalahan.' : 'Request failed');
}

function applyStaticTranslations() {
  $$('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  $$('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  document.documentElement.lang = lang;
}
function setLang(l) {
  lang = l;
  localStorage.setItem('bb_lang', l);
  applyStaticTranslations();
  if (token) { loadDashboard(); loadQueue(); }
}
$$('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
applyStaticTranslations();

/* ---------- API (sends admin token) ---------- */
async function api(path, method = 'GET', body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opt.headers['x-admin-token'] = token;
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch(path, opt);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(translateApiError(data));
  return data;
}

/* ---------- login ---------- */
$('#adminLogin').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  try {
    const r = await api('/api/admin/login', 'POST',
      { username: f.username.value, password: f.password.value });
    token = r.token;
    $('#loginGate').classList.add('hidden');
    $('#console').classList.remove('hidden');
    technicians = await api('/api/admin/technicians');
    loadDashboard(); loadQueue();
  } catch (err) { $('#loginMsg').textContent = err.message; }
});
$('#opsLogout').addEventListener('click', () => location.reload());

/* ---------- view switch ---------- */
$$('.opsbtn').forEach(b => b.addEventListener('click', () => {
  $$('.opsbtn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  const v = b.dataset.view;
  $('#ops-dash').classList.toggle('hidden', v !== 'dash');
  $('#ops-queue').classList.toggle('hidden', v !== 'queue');
  if (v === 'dash') loadDashboard();
  if (v === 'queue') loadQueue();
}));
$('#refreshBtn').addEventListener('click', loadQueue);

/* ---------- dashboard ---------- */
async function loadDashboard() {
  const d = await api('/api/admin/dashboard');
  $('#kpis').innerHTML = `
    ${kpi(t('kpi_total'), d.total_bookings)}
    ${kpi(t('kpi_completed'), d.completed, 'good')}
    ${kpi(t('kpi_inprogress'), d.in_progress)}
    ${kpi(t('kpi_rate'), d.completion_rate + '%', 'accent')}
    ${kpi(t('kpi_revenue'), money(d.revenue), 'accent')}
    ${kpi(t('kpi_reviews'), d.reviews)}`;
  $('#techTable tbody').innerHTML = d.technician_performance.map(tp =>
    `<tr><td>${tp.name}</td><td class="mono">${tp.jobs || 0}</td>
     <td class="mono">${tp.avg_rating != null ? tp.avg_rating + ' ★' : '—'}</td></tr>`).join('');
}
const kpi = (label, val, cls = '') =>
  `<div class="kpi ${cls}"><div class="label">${label}</div><div class="val">${val}</div></div>`;

/* ---------- queue ---------- */
async function loadQueue() {
  const rows = await api('/api/admin/bookings');
  lastQueueRows = rows;
  const q = $('#queueList');
  if (!rows.length) { q.innerHTML = `<p style="color:var(--muted)">${t('no_bookings')}</p>`; return; }
  q.innerHTML = rows.map(renderQ).join('');
  bindQueue();
}

function serviceLabel(b) {
  return lang === 'id' ? (b.service_name_id || b.service_name) : b.service_name;
}
function propertyLabel(p) {
  if (!p) return '—';
  const map = { house: { en: 'House', id: 'Rumah' }, apartment: { en: 'Apartment', id: 'Apartemen' } };
  return (map[p] && map[p][lang]) || p;
}
function statusLabel(s) {
  const map = {
    pending:        { en: 'pending', id: 'menunggu' },
    confirmed:      { en: 'confirmed', id: 'terkonfirmasi' },
    'in progress':  { en: 'in progress', id: 'sedang dikerjakan' },
    completed:      { en: 'completed', id: 'selesai' },
    cancelled:      { en: 'cancelled', id: 'dibatalkan' },
  };
  return (map[s] && map[s][lang]) || s;
}
function payStatusLabel(s) {
  const map = { unpaid: { en: 'unpaid', id: 'belum dibayar' }, paid: { en: 'paid', id: 'dibayar' }, refunded: { en: 'refunded', id: 'direfund' } };
  return (map[s] && map[s][lang]) || s;
}

function renderQ(b) {
  const sc = b.status.replace(/\s+/g, '');
  const techLine = b.technician_name
    ? `<b>${b.technician_name}</b>` : `<span style="color:var(--amber)">${t('unassigned')}</span>`;
  const payPill = b.payment_status
    ? `<span class="pill ${b.payment_status}">${payStatusLabel(b.payment_status)}</span>` : '';

  let acts = '';
  if (b.status === 'confirmed' && !b.technician_id)
    acts += `<button class="btn primary small" data-act="assign" data-id="${b.booking_id}">${t('btn_assign')}</button>`;
  if (b.technician_id && b.report_approved !== 1)
    acts += `<button class="btn ghost small" data-act="report" data-id="${b.booking_id}">${b.report_id ? t('btn_edit_report') : t('btn_submit_report')}</button>`;
  if (b.report_id && b.report_approved !== 1)
    acts += `<button class="btn green small" data-act="approve" data-id="${b.booking_id}">${t('btn_approve_report')}</button>`;
  if (b.report_approved === 1)
    acts += `<button class="btn ghost small" data-act="viewreport" data-id="${b.booking_id}">${t('btn_view_report_locked')}</button>`;
  if (b.status === 'in progress' && b.report_approved === 1)
    acts += `<button class="btn amber small" data-act="complete" data-id="${b.booking_id}">${t('btn_complete_invoice')}</button>`;
  if (b.status === 'completed' && b.invoice_amount == null)
    acts += `<button class="btn amber small" data-act="invoice" data-id="${b.booking_id}">${t('btn_generate_invoice')}</button>`;
  if (b.payment_status === 'paid')
    acts += `<button class="btn danger small" data-act="refund" data-id="${b.booking_id}">${t('btn_refund')}</button>`;
  // Review is now clickable/openable instead of just inline text.
  if (b.feedback_rating)
    acts += `<button class="btn ghost small" data-act="viewreview" data-id="${b.booking_id}">⭐ ${b.feedback_rating}/5 — ${t('btn_view_review')}</button>`;

  return `<div class="qcard">
    <div class="qhead">
      <span class="id mono">#${String(b.booking_id).padStart(4,'0')}</span>
      <h3>${serviceLabel(b)}</h3>
      <span class="pill ${sc}">${statusLabel(b.status)}</span>
      ${payPill}
      <span class="price">${money(b.service_price)}</span>
    </div>
    <div class="qmeta">
      <div>${t('customer_label')}: <b>${b.customer_name}</b> (${b.customer_phone})</div>
      <div>${t('technician_label')}: ${techLine}</div>
      <div>📅 ${b.booking_date} · ${b.preferred_time}</div>
      <div>📍 ${b.address}</div>
      <div>${t('property_label')}: ${propertyLabel(b.property_type)}</div>
      <div>${t('phone_label')}: ${b.phone || '—'}</div>
      ${b.pest_notes ? `<div style="grid-column:1/-1">📝 ${b.pest_notes}</div>` : ''}
    </div>
    <div class="qactions">${acts || `<span style="color:var(--muted);font-size:13px">${t('no_actions')}</span>`}</div>
  </div>`;
}

function bindQueue() {
  $$('[data-act]').forEach(btn => btn.onclick = () => {
    const id = btn.dataset.id, act = btn.dataset.act;
    if (act === 'assign')      assignModal(id);
    if (act === 'report')      reportModal(id);
    if (act === 'viewreport')  viewReport(id);
    if (act === 'approve')     doApprove(id);
    if (act === 'complete')    doComplete(id);
    if (act === 'invoice')     doInvoice(id);
    if (act === 'refund')      refundModal(id);
    if (act === 'viewreview')  viewReview(id);
  });
}

/* ---------- assign ---------- */
function assignModal(id) {
  openModal(`<h3>${t('assign_title')} #${id}</h3>
    <form id="assignForm" class="form">
      <label>${t('assign_label')}
        <select name="technician_id">
          ${technicians.map(tc => `<option value="${tc.technician_id}">${tc.name} — ${tc.skill} (${tc.zone})</option>`).join('')}
        </select>
      </label>
      <p class="msg" style="color:var(--muted);font-weight:500">${t('assign_hint')}</p>
      <button class="btn primary" type="submit">${t('btn_assign_confirm')}</button>
      <p class="msg err" id="assignMsg"></p>
    </form>`);
  $('#assignForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api(`/api/admin/bookings/${id}/assign`, 'POST',
        { technician_id: e.target.technician_id.value });
      closeModal(); loadQueue();
    } catch (err) { $('#assignMsg').textContent = err.message; }
  });
}

/* ---------- report ---------- */
function reportModal(id) {
  openModal(`<h3>${t('report_title')} #${id}</h3>
    <form id="reportForm" class="form">
      <label>${t('label_pest_found')}<input name="pest_found" required /></label>
      <label>${t('label_severity')}
        <select name="severity"><option value="Low">${t('sev_low')}</option><option value="Medium">${t('sev_medium')}</option><option value="High">${t('sev_high')}</option></select>
      </label>
      <label>${t('label_findings')}<textarea name="findings" rows="3" required></textarea></label>
      <label>${t('label_safety')}<textarea name="safety_notes" rows="2"></textarea></label>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">${t('chemicals_used')}</div>
        <div id="chemList"></div>
        <button type="button" class="btn ghost small" id="addChem">${t('btn_add_chemical')}</button>
      </div>
      <button class="btn primary" type="submit">${t('btn_save_report')}</button>
      <p class="msg err" id="reportMsg"></p>
    </form>`);
  const chemList = $('#chemList');
  const addChem = () => {
    const row = document.createElement('div');
    row.className = 'chem-row';
    row.innerHTML = `<input placeholder="${t('chem_name_placeholder')}" class="cn" />
                     <input placeholder="${t('chem_qty_placeholder')}" class="cq" />
                     <button type="button" class="btn ghost small rm">×</button>`;
    row.querySelector('.rm').onclick = () => row.remove();
    chemList.appendChild(row);
  };
  addChem();
  $('#addChem').onclick = addChem;
  $('#reportForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const chemicals = $$('.chem-row', chemList).map(r => ({
      chemical_name: r.querySelector('.cn').value.trim(),
      quantity: r.querySelector('.cq').value.trim()
    })).filter(c => c.chemical_name && c.quantity);
    try {
      await api(`/api/admin/bookings/${id}/report`, 'POST', {
        pest_found: f.pest_found.value, severity: f.severity.value,
        findings: f.findings.value, safety_notes: f.safety_notes.value, chemicals
      });
      closeModal(); loadQueue();
    } catch (err) { $('#reportMsg').textContent = err.message; }
  });
}

async function viewReport(id) {
  const r = await api(`/api/bookings/${id}/report`);
  const chems = r.chemicals.map(c => `<div class="report-line"><span>${c.chemical_name}</span><span>${c.quantity}</span></div>`).join('');
  openModal(`<h3>${t('report_locked_title')} #${id} ${t('report_locked_suffix')}</h3>
    <div class="report-line"><span>${t('label_pest_found')}</span><span>${r.pest_found}</span></div>
    <div class="report-line"><span>${t('label_severity')}</span><span>${r.severity}</span></div>
    <div class="report-line"><span>${t('label_findings')}</span><span>${r.findings}</span></div>
    <div class="report-line"><span>${t('label_safety')}</span><span>${r.safety_notes || '—'}</span></div>
    <h4 style="margin:16px 0 4px">${t('chemicals_heading')}</h4>${chems}`);
}

async function doApprove(id) {
  if (!confirm(t('confirm_approve'))) return;
  try { await api(`/api/admin/bookings/${id}/report/approve`, 'POST', {}); loadQueue(); }
  catch (err) { alert(err.message); }
}
async function doComplete(id) {
  try { await api(`/api/admin/bookings/${id}/status`, 'POST', { status: 'completed' }); loadQueue(); loadDashboard(); }
  catch (err) { alert(err.message); }
}
async function doInvoice(id) {
  try { await api(`/api/admin/bookings/${id}/invoice`, 'POST', {}); loadQueue(); }
  catch (err) { alert(err.message); }
}

/* ---------- refund (needs finance key) ---------- */
function refundModal(id) {
  openModal(`<h3>${t('refund_title')} #${id}</h3>
    <form id="refundForm" class="form">
      <p style="color:var(--muted);font-size:14px;margin:0">${t('refund_hint')}</p>
      <label>${t('label_security_key')}<input name="security_key" type="password" placeholder="finance key" /></label>
      <button class="btn danger" type="submit">${t('btn_confirm_refund')}</button>
      <p class="msg err" id="refundMsg"></p>
    </form>`);
  $('#refundForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api(`/api/admin/bookings/${id}/refund`, 'POST',
        { security_key: e.target.security_key.value });
      closeModal(); loadQueue(); loadDashboard();
    } catch (err) { $('#refundMsg').textContent = err.message; }
  });
}

/* ---------- review (clickable, opens full message) ---------- */
function viewReview(id) {
  // Looked up from the already-fetched queue data rather than embedded in
  // an HTML attribute, so a comment containing quotes/HTML can never break
  // the markup.
  const b = lastQueueRows.find(r => String(r.booking_id) === String(id));
  if (!b) return;
  const stars = '★'.repeat(b.feedback_rating) + '☆'.repeat(5 - b.feedback_rating);
  openModal(`<h3>${t('review_title')} #${id}</h3>
    <div class="report-line"><span>${t('review_rating_label')}</span><span>${stars} (${b.feedback_rating}/5)</span></div>
    <h4 style="margin:16px 0 6px">${t('review_comment_label')}</h4>
    <p style="line-height:1.5">${b.feedback_comment ? escapeHtml(b.feedback_comment) : `<span class="hint">${t('review_no_comment')}</span>`}</p>`);
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/* ---------- modal helpers ---------- */
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
