/* BugBuster Pro — Management console logic */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = n => 'Rp' + Number(n).toLocaleString('id-ID');

let token = null;
let technicians = [];

/* ---------- API (sends admin token) ---------- */
async function api(path, method = 'GET', body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opt.headers['x-admin-token'] = token;
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch(path, opt);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
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
    ${kpi('Total bookings', d.total_bookings)}
    ${kpi('Completed', d.completed, 'good')}
    ${kpi('In progress', d.in_progress)}
    ${kpi('Completion rate', d.completion_rate + '%', 'accent')}
    ${kpi('Revenue (paid)', money(d.revenue), 'accent')}
    ${kpi('Reviews', d.reviews)}`;
  $('#techTable tbody').innerHTML = d.technician_performance.map(t =>
    `<tr><td>${t.name}</td><td class="mono">${t.jobs || 0}</td>
     <td class="mono">${t.avg_rating != null ? t.avg_rating + ' ★' : '—'}</td></tr>`).join('');
}
const kpi = (label, val, cls = '') =>
  `<div class="kpi ${cls}"><div class="label">${label}</div><div class="val">${val}</div></div>`;

/* ---------- queue ---------- */
async function loadQueue() {
  const rows = await api('/api/admin/bookings');
  const q = $('#queueList');
  if (!rows.length) { q.innerHTML = '<p style="color:var(--muted)">No bookings yet.</p>'; return; }
  q.innerHTML = rows.map(renderQ).join('');
  bindQueue();
}

function renderQ(b) {
  const sc = b.status.replace(/\s+/g, '');
  const techLine = b.technician_name
    ? `<b>${b.technician_name}</b>` : '<span style="color:var(--amber)">unassigned</span>';
  const payPill = b.payment_status
    ? `<span class="pill ${b.payment_status}">${b.payment_status}</span>` : '';

  let acts = '';
  // Assign — only when confirmed & unassigned
  if (b.status === 'confirmed' && !b.technician_id)
    acts += `<button class="btn primary small" data-act="assign" data-id="${b.booking_id}">Assign technician</button>`;
  // Report — when in progress / assigned and not yet approved
  if (b.technician_id && b.report_approved !== 1)
    acts += `<button class="btn ghost small" data-act="report" data-id="${b.booking_id}">${b.report_id ? 'Edit' : 'Submit'} report</button>`;
  // Approve — when report exists but not approved
  if (b.report_id && b.report_approved !== 1)
    acts += `<button class="btn green small" data-act="approve" data-id="${b.booking_id}">Approve report</button>`;
  if (b.report_approved === 1)
    acts += `<button class="btn ghost small" data-act="viewreport" data-id="${b.booking_id}">View report 🔒</button>`;
  // Complete — when in progress + approved report (auto-invoices)
  if (b.status === 'in progress' && b.report_approved === 1)
    acts += `<button class="btn amber small" data-act="complete" data-id="${b.booking_id}">Mark completed + invoice</button>`;
  // Manual invoice
  if (b.status === 'completed' && b.invoice_amount == null)
    acts += `<button class="btn amber small" data-act="invoice" data-id="${b.booking_id}">Generate invoice</button>`;
  // Refund — only on paid
  if (b.payment_status === 'paid')
    acts += `<button class="btn danger small" data-act="refund" data-id="${b.booking_id}">Refund</button>`;

  return `<div class="qcard">
    <div class="qhead">
      <span class="id mono">#${String(b.booking_id).padStart(4,'0')}</span>
      <h3>${b.service_name}</h3>
      <span class="pill ${sc}">${b.status}</span>
      ${payPill}
      <span class="price">${money(b.service_price)}</span>
    </div>
    <div class="qmeta">
      <div>Customer: <b>${b.customer_name}</b> (${b.customer_phone})</div>
      <div>Technician: ${techLine}</div>
      <div>📅 ${b.booking_date} · ${b.preferred_time}</div>
      <div>📍 ${b.address}</div>
      ${b.pest_notes ? `<div style="grid-column:1/-1">📝 ${b.pest_notes}</div>` : ''}
      ${b.feedback_rating ? `<div style="grid-column:1/-1">⭐ ${b.feedback_rating}/5 — ${b.feedback_comment || ''}</div>` : ''}
    </div>
    <div class="qactions">${acts || '<span style="color:var(--muted);font-size:13px">No actions available</span>'}</div>
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
  });
}

/* ---------- assign ---------- */
function assignModal(id) {
  openModal(`<h3>Assign technician — booking #${id}</h3>
    <form id="assignForm" class="form">
      <label>Technician
        <select name="technician_id">
          ${technicians.map(t => `<option value="${t.technician_id}">${t.name} — ${t.skill} (${t.zone})</option>`).join('')}
        </select>
      </label>
      <p class="msg" style="color:var(--muted);font-weight:500">Double-booking is blocked automatically if the slot clashes.</p>
      <button class="btn primary" type="submit">Assign</button>
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
  openModal(`<h3>Service report — booking #${id}</h3>
    <form id="reportForm" class="form">
      <label>Pest found<input name="pest_found" required /></label>
      <label>Severity
        <select name="severity"><option>Low</option><option>Medium</option><option>High</option></select>
      </label>
      <label>Findings<textarea name="findings" rows="3" required></textarea></label>
      <label>Safety notes<textarea name="safety_notes" rows="2"></textarea></label>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">Chemicals used</div>
        <div id="chemList"></div>
        <button type="button" class="btn ghost small" id="addChem">+ Add chemical</button>
      </div>
      <button class="btn primary" type="submit">Save report</button>
      <p class="msg err" id="reportMsg"></p>
    </form>`);
  const chemList = $('#chemList');
  const addChem = () => {
    const row = document.createElement('div');
    row.className = 'chem-row';
    row.innerHTML = `<input placeholder="Chemical name" class="cn" />
                     <input placeholder="Qty e.g. 250 ml" class="cq" />
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
  openModal(`<h3>Report #${id} 🔒 (locked)</h3>
    <div class="report-line"><span>Pest found</span><span>${r.pest_found}</span></div>
    <div class="report-line"><span>Severity</span><span>${r.severity}</span></div>
    <div class="report-line"><span>Findings</span><span>${r.findings}</span></div>
    <div class="report-line"><span>Safety notes</span><span>${r.safety_notes || '—'}</span></div>
    <h4 style="margin:16px 0 4px">Chemicals</h4>${chems}`);
}

async function doApprove(id) {
  if (!confirm('Approve and LOCK this report? It cannot be edited afterward.')) return;
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
  openModal(`<h3>Issue refund — booking #${id}</h3>
    <form id="refundForm" class="form">
      <p style="color:var(--muted);font-size:14px;margin:0">Refunds require the finance security key.</p>
      <label>Security key<input name="security_key" type="password" placeholder="finance key" /></label>
      <button class="btn danger" type="submit">Confirm refund</button>
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

/* ---------- modal helpers ---------- */
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
