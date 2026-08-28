/* =====================================================================
 * admin.js — หน้าผู้ดูแลระบบ (เรียก /api/admin/*)
 * เข้าได้เฉพาะผู้ที่ล็อกอินด้วยบัญชี role = 'admin'
 * ===================================================================== */
const TOKEN_KEY = 'tb_token';
function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || 'เกิดข้อผิดพลาด');
  return data;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

function logout() { try { localStorage.removeItem(TOKEN_KEY); } catch {} location.href = '/index.html'; }

const STATUS_META = {
  paid:      { cls: 'ok',     text: 'ชำระแล้ว' },
  pending:   { cls: 'wait',   text: 'รอชำระเงิน' },
  cancelled: { cls: 'cancel', text: 'ยกเลิกแล้ว' }
};

/* ---------------- Guard: ต้องเป็น admin ---------------- */
(async function guard() {
  if (!getToken()) { location.href = '/index.html'; return; }
  try {
    const { user } = await api('/api/auth/me');
    if (user.role !== 'admin') { alert('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น'); location.href = '/index.html'; return; }
    document.getElementById('adminName').textContent = '👤 ' + user.name;
    loadAll();
  } catch { location.href = '/index.html'; }
})();

async function loadAll() {
  loadSummary();
  loadTrains();
  loadBookings();
  loadUsers();
}

/* ---------------- Tabs ---------------- */
function switchTab(tab, btn) {
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['trains', 'bookings', 'users'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
}

/* ---------------- Summary ---------------- */
async function loadSummary() {
  try {
    const s = await api('/api/admin/summary');
    document.getElementById('stUsers').textContent = s.users;
    document.getElementById('stTrains').textContent = s.trains;
    document.getElementById('stBookings').textContent = s.bookings;
    document.getElementById('stRevenue').textContent = s.revenue.toLocaleString() + ' ฿';
  } catch (e) { toast(e.message); }
}

/* ---------------- Trains ---------------- */
async function loadTrains() {
  const tbody = document.getElementById('trainRows');
  let trains;
  try { trains = await api('/api/admin/trains'); } catch (e) { toast(e.message); return; }
  tbody.innerHTML = '';
  trains.forEach(t => {
    const classes = t.classes.map(c => `${c.name} (${c.price.toLocaleString()}฿)`).join('<br>');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${t.train_number}</b></td>
      <td>${t.tag}</td>
      <td>${t.from_city} → ${t.to_city}</td>
      <td>${t.dep_time} - ${t.arr_time}</td>
      <td style="font-size:12.5px;">${classes || '-'}</td>
      <td>${t.active ? '<span class="badge ok">เปิดขาย</span>' : '<span class="badge cancel">ปิด</span>'}</td>
      <td><div class="row-actions">
        <button class="btn btn-ghost mini" onclick='editTrain(${JSON.stringify(t)})'>แก้ไข</button>
        <button class="btn btn-ghost mini" style="color:var(--danger);border-color:#f3d0d0;" onclick="deleteTrain(${t.id})">ลบ</button>
      </div></td>`;
    tbody.appendChild(tr);
  });
}

function addClassRow(name = '', price = '', seats = 40) {
  const wrap = document.getElementById('classRows');
  const row = document.createElement('div');
  row.className = 'class-row';
  row.innerHTML = `
    <input class="c-name" placeholder="ชั้น 2 (นั่งนอน)" value="${name}">
    <input class="c-price" type="number" placeholder="850" value="${price}">
    <input class="c-seats" type="number" placeholder="40" value="${seats}">
    <button class="del-x" onclick="this.parentElement.remove()">×</button>`;
  wrap.appendChild(row);
}

function openTrainForm() {
  document.getElementById('formTitle').textContent = 'เพิ่มขบวนรถ';
  document.getElementById('fTrainId').value = '';
  ['fNumber', 'fTag', 'fFrom', 'fTo', 'fDep', 'fArr', 'fDur'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fFrom').value = 'กรุงเทพฯ (หัวลำโพง)';
  document.getElementById('fTo').value = 'เชียงใหม่';
  document.getElementById('classRows').innerHTML = '';
  addClassRow();
  document.getElementById('overlay').classList.add('show');
}

function editTrain(t) {
  document.getElementById('formTitle').textContent = 'แก้ไขขบวนรถ ' + t.train_number;
  document.getElementById('fTrainId').value = t.id;
  document.getElementById('fNumber').value = t.train_number;
  document.getElementById('fTag').value = t.tag;
  document.getElementById('fFrom').value = t.from_city;
  document.getElementById('fTo').value = t.to_city;
  document.getElementById('fDep').value = t.dep_time;
  document.getElementById('fArr').value = t.arr_time;
  document.getElementById('fDur').value = t.duration || '';
  document.getElementById('classRows').innerHTML = '';
  (t.classes || []).forEach(c => addClassRow(c.name, c.price, c.seats));
  if (!t.classes || !t.classes.length) addClassRow();
  document.getElementById('overlay').classList.add('show');
}

function closeTrainForm() { document.getElementById('overlay').classList.remove('show'); }

function collectClasses() {
  const rows = document.querySelectorAll('#classRows .class-row');
  const classes = [];
  rows.forEach(r => {
    const name = r.querySelector('.c-name').value.trim();
    const price = parseInt(r.querySelector('.c-price').value, 10);
    const seats = parseInt(r.querySelector('.c-seats').value, 10) || 40;
    if (name && price) classes.push({ name, price, seats });
  });
  return classes;
}

async function saveTrain() {
  const id = document.getElementById('fTrainId').value;
  const payload = {
    train_number: parseInt(document.getElementById('fNumber').value, 10),
    tag: document.getElementById('fTag').value.trim(),
    from_city: document.getElementById('fFrom').value.trim(),
    to_city: document.getElementById('fTo').value.trim(),
    dep_time: document.getElementById('fDep').value.trim(),
    arr_time: document.getElementById('fArr').value.trim(),
    duration: document.getElementById('fDur').value.trim(),
    classes: collectClasses()
  };
  if (!payload.train_number || !payload.tag || !payload.dep_time || !payload.arr_time) {
    toast('กรอกข้อมูลขบวนรถให้ครบ'); return;
  }
  if (!payload.classes.length) { toast('เพิ่มชั้นโดยสารอย่างน้อย 1 ชั้น'); return; }

  try {
    if (id) await api('/api/admin/trains/' + id, { method: 'PUT', body: payload });
    else await api('/api/admin/trains', { method: 'POST', body: payload });
  } catch (e) { toast(e.message); return; }

  toast('บันทึกขบวนรถแล้ว');
  closeTrainForm();
  loadTrains(); loadSummary();
}

async function deleteTrain(id) {
  if (!confirm('ลบขบวนรถนี้? การจองที่เกี่ยวข้องจะถูกลบด้วย')) return;
  try { await api('/api/admin/trains/' + id, { method: 'DELETE' }); }
  catch (e) { toast(e.message); return; }
  toast('ลบขบวนรถแล้ว');
  loadTrains(); loadBookings(); loadSummary();
}

/* ---------------- Bookings ---------------- */
async function loadBookings() {
  const tbody = document.getElementById('bookingRows');
  let list;
  try { list = await api('/api/admin/bookings'); } catch (e) { toast(e.message); return; }
  tbody.innerHTML = '';
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--ink-soft);">ยังไม่มีการจอง</td></tr>'; return; }
  list.forEach(b => {
    const meta = STATUS_META[b.status] || STATUS_META.paid;
    const action = b.status === 'cancelled'
      ? `<button class="btn btn-ghost mini" onclick="setBookingStatus(${b.id},'paid')">คืนสถานะ</button>`
      : `<button class="btn btn-ghost mini" style="color:var(--danger);border-color:#f3d0d0;" onclick="setBookingStatus(${b.id},'cancelled')">ยกเลิก</button>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:12px;">${b.booking_code}</td>
      <td>${b.user_name}<br><span style="font-size:11.5px;color:var(--ink-soft);">${b.user_email}</span></td>
      <td>${b.from_city} → ${b.to_city}<br><span style="font-size:11.5px;color:var(--ink-soft);">ขบวน ${b.train_number}</span></td>
      <td>${b.travel_date}</td>
      <td>${b.class_name}<br><span style="font-size:11.5px;color:var(--ink-soft);">${b.seats.join(', ')}</span></td>
      <td><b>${b.total_price.toLocaleString()}</b></td>
      <td><span class="badge ${meta.cls}">${meta.text}</span></td>
      <td>${action}</td>`;
    tbody.appendChild(tr);
  });
}

async function setBookingStatus(id, status) {
  try { await api('/api/admin/bookings/' + id + '/status', { method: 'PATCH', body: { status } }); }
  catch (e) { toast(e.message); return; }
  toast('อัปเดตสถานะแล้ว');
  loadBookings(); loadSummary();
}

/* ---------------- Users ---------------- */
async function loadUsers() {
  const tbody = document.getElementById('userRows');
  let users;
  try { users = await api('/api/admin/users'); } catch (e) { toast(e.message); return; }
  tbody.innerHTML = '';
  users.forEach(u => {
    const roleBadge = u.role === 'admin'
      ? '<span class="badge" style="background:#FFF4E0;color:#B9740A;">แอดมิน</span>'
      : '<span class="badge ok">สมาชิก</span>';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td><td>${u.name}</td><td>${u.email}</td>
      <td>${u.phone || '-'}</td><td>${roleBadge}</td><td style="font-size:12.5px;">${u.created_at}</td>`;
    tbody.appendChild(tr);
  });
}
