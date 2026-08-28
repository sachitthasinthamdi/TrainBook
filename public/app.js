/* =====================================================================
 * app.js — Frontend (เรียก REST API ของ backend แทน localStorage)
 * ข้อมูลจริงทั้งหมดอยู่ในฐานข้อมูล SQLite ฝั่ง server
 * localStorage ใช้เก็บแค่ "token" สำหรับ login เท่านั้น
 * ===================================================================== */

/* ---------------- App state ---------------- */
const state = {
  from: 'กรุงเทพฯ (หัวลำโพง)', to: 'เชียงใหม่', date: '27 พ.ค. 2567', pax: 1,
  trains: [], train: null, coach: 0, seats: [], takenSeats: []
};

const DATES = ['25 พ.ค.', '26 พ.ค.', '27 พ.ค.', '28 พ.ค.', '29 พ.ค.', '30 พ.ค.'];
const TOKEN_KEY = 'tb_token';
let currentUser = null;   // ข้อมูลผู้ใช้ที่ล็อกอินอยู่ (จาก API)

/* ---------------- API helper ---------------- */
function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} }

// เรียก API + แนบ token อัตโนมัติ + โยน error พร้อมข้อความไทยจาก backend
async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || 'เกิดข้อผิดพลาด');
  return data;
}

/* ---------------- Navigation ---------------- */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.p === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'history') renderHistory();
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

function setTripType(type) {
  document.getElementById('tabOneway').classList.toggle('active', type === 'oneway');
  document.getElementById('tabRound').classList.toggle('active', type === 'round');
}
function swapCities() {
  const f = document.getElementById('fromCity'), t = document.getElementById('toCity');
  const tmp = f.value; f.value = t.value; t.value = tmp;
}

/* ---------------- Search / Results ---------------- */
async function doSearch() {
  state.from = document.getElementById('fromCity').value;
  state.to = document.getElementById('toCity').value;
  state.pax = parseInt(document.getElementById('paxCount').value, 10);
  const d = document.getElementById('travelDate').value;
  if (d) {
    const dt = new Date(d + 'T00:00:00');
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    state.date = dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + (dt.getFullYear() + 543);
  }
  document.getElementById('rsFrom').textContent = state.from;
  document.getElementById('rsTo').textContent = state.to;
  document.getElementById('rsDate').textContent = state.date;

  try {
    state.trains = await api('/api/trains');       // โหลดขบวนรถจาก backend
  } catch (e) { toast(e.message); return; }

  renderDateTabs();
  renderTrainList();
  showPage('results');
}

function renderDateTabs() {
  const wrap = document.getElementById('dateTabs');
  wrap.innerHTML = '';
  DATES.forEach((d, i) => {
    const b = document.createElement('button');
    b.className = 'date-tab' + (i === 2 ? ' active' : '');
    b.textContent = d;
    b.onclick = () => { document.querySelectorAll('.date-tab').forEach(x => x.classList.remove('active')); b.classList.add('active'); };
    wrap.appendChild(b);
  });
}

function renderTrainList() {
  const wrap = document.getElementById('trainList');
  wrap.innerHTML = '';
  if (!state.trains.length) {
    wrap.innerHTML = '<div class="empty-note">ยังไม่มีขบวนรถในระบบ</div>';
    return;
  }
  state.trains.forEach(tr => {
    const card = document.createElement('div');
    card.className = 'train-card';
    card.innerHTML = `
      <div class="train-meta">
        <div>
          <span class="train-tag">${tr.tag}</span>
          <div class="train-name" style="margin-top:6px;">ขบวน ${tr.train_number}</div>
          <div style="font-size:12.5px;color:var(--ink-soft);">${state.from} → ${state.to}</div>
        </div>
        <div class="train-time">
          <span>${tr.dep_time}</span>
          <span class="dur"><span class="line"></span>${tr.duration || ''}</span>
          <span>${tr.arr_time}</span>
        </div>
      </div>
      <div class="class-list">
        ${tr.classes.map(c => `
          <div class="class-pill">
            <div class="cn">${c.name}</div>
            <div class="cp">${c.price.toLocaleString()} บาท</div>
            <div class="seats">${c.seats} ที่นั่ง</div>
          </div>`).join('')}
      </div>
      <button class="btn btn-primary" onclick='selectTrain(${tr.id})'>เลือกที่นั่ง</button>
    `;
    wrap.appendChild(card);
  });
}

/* ---------------- Seats ---------------- */
async function selectTrain(id) {
  state.train = state.trains.find(t => t.id === id);
  state.coach = 0;
  state.seats = [];
  document.getElementById('seatTrainTitle').textContent =
    `ขบวน ${state.train.train_number} (${state.train.tag}) · ${state.from} → ${state.to}`;
  document.getElementById('seatTrainTime').textContent =
    `${state.date} | ${state.train.dep_time} - ${state.train.arr_time}`;
  renderCoachSelect();
  await loadTakenSeats();     // โหลดที่นั่งที่ถูกจองแล้วจาก backend
  updateSeatSidebar();
  showPage('seats');
}

function currentClass() { return state.train.classes[state.coach]; }

// โหลดที่นั่งที่ถูกจองแล้ว (ตามขบวน+ชั้น+วันเดินทาง) แล้ววาดผังใหม่
async function loadTakenSeats() {
  const c = currentClass();
  try {
    state.takenSeats = await api(
      `/api/trains/${state.train.id}/classes/${c.id}/taken-seats?date=${encodeURIComponent(state.date)}`
    );
  } catch { state.takenSeats = []; }
  renderSeatMap();
}

function renderCoachSelect() {
  const wrap = document.getElementById('coachSelect');
  wrap.innerHTML = '';
  state.train.classes.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'coach-chip' + (i === state.coach ? ' selected' : '');
    btn.innerHTML = `<div class="cc-name">${c.name}</div><div class="cc-price">${c.price.toLocaleString()} บาท</div>`;
    btn.onclick = async () => { state.coach = i; state.seats = []; renderCoachSelect(); await loadTakenSeats(); updateSeatSidebar(); };
    wrap.appendChild(btn);
  });
}

function renderSeatMap() {
  const wrap = document.getElementById('seatMap');
  wrap.innerHTML = '';
  const cols = ['A', 'C', 'gap', 'D', 'F'];
  for (let row = 1; row <= 8; row++) {
    cols.forEach(col => {
      if (col === 'gap') {
        const g = document.createElement('div'); g.className = 'seat gap'; wrap.appendChild(g); return;
      }
      const code = row + col;
      const seat = document.createElement('div');
      const isTaken = state.takenSeats.includes(code);
      seat.className = 'seat' + (isTaken ? ' taken' : '') + (state.seats.includes(code) ? ' selected' : '');
      seat.textContent = code;
      if (!isTaken) seat.onclick = () => toggleSeat(code);
      wrap.appendChild(seat);
    });
  }
}

function toggleSeat(code) {
  const i = state.seats.indexOf(code);
  if (i > -1) { state.seats.splice(i, 1); }
  else {
    if (state.seats.length >= state.pax) { toast(`เลือกได้สูงสุด ${state.pax} ที่นั่งตามจำนวนผู้โดยสาร`); return; }
    state.seats.push(code);
  }
  renderSeatMap();
  updateSeatSidebar();
}

function updateSeatSidebar() {
  const c = currentClass();
  const box = document.getElementById('chosenSeats');
  box.innerHTML = state.seats.length
    ? state.seats.map(s => `<span class="seat-chip-selected">${c.name.split(' ')[0]} · ${s}</span>`).join('')
    : 'ยังไม่ได้เลือกที่นั่ง';
  document.getElementById('seatTotal').textContent = (state.seats.length * c.price).toLocaleString() + ' บาท';
}

function goPassengerPage() {
  if (state.seats.length === 0) { toast('กรุณาเลือกที่นั่งอย่างน้อย 1 ที่นั่ง'); return; }
  if (state.seats.length < state.pax) { toast(`กรุณาเลือกที่นั่งให้ครบ ${state.pax} ที่นั่ง`); return; }
  renderPassengerForms();
  showPage('passenger');
}

/* ---------------- Passenger ---------------- */
function renderPassengerForms() {
  const wrap = document.getElementById('passengerForms');
  wrap.innerHTML = '';
  for (let i = 0; i < state.pax; i++) {
    const block = document.createElement('div');
    block.className = 'passenger-block';
    block.innerHTML = `
      <h4>ผู้โดยสารคนที่ ${i + 1} ${state.seats[i] ? '· ที่นั่ง ' + state.seats[i] : ''}</h4>
      <div class="form-grid g3" style="margin-bottom:14px;">
        <div class="form-field"><label>คำนำหน้า</label>
          <select><option>นาย</option><option>นาง</option><option>นางสาว</option></select>
        </div>
        <div class="form-field"><label>ชื่อ</label><input placeholder="ชื่อจริง"></div>
        <div class="form-field"><label>นามสกุล</label><input placeholder="นามสกุล"></div>
      </div>
      <div class="form-grid">
        <div class="form-field"><label>เลขบัตรประชาชน</label><input placeholder="1-2345-67890-12-3"></div>
        <div class="form-field"><label>เบอร์โทรศัพท์</label><input placeholder="081-234-5678"></div>
      </div>
      <div class="form-field" style="margin-top:14px;"><label>อีเมล</label><input type="email" placeholder="somchai@example.com"></div>
    `;
    wrap.appendChild(block);
  }
  const c = currentClass();
  document.getElementById('passengerTripInfo').innerHTML = `
    <b>ขบวน ${state.train.train_number}</b> (${state.train.tag}) &nbsp;|&nbsp; ${state.date} | ${state.train.dep_time} - ${state.train.arr_time}<br>
    ${state.from} → ${state.to} &nbsp;|&nbsp; ตู้โดยสาร · ${c.name} · ที่นั่ง ${state.seats.join(', ')}
  `;
}

/* ---------------- Payment ---------------- */
function goPaymentPage() {
  if (!currentUser) { toast('กรุณาเข้าสู่ระบบก่อนชำระเงิน'); showPage('login'); return; }
  const c = currentClass();
  document.getElementById('paySummary').innerHTML = `
    <div class="sum-row"><span>ขบวน</span><b>${state.train.train_number} (${state.train.tag})</b></div>
    <div class="sum-row"><span>เส้นทาง</span><b>${state.from} → ${state.to}</b></div>
    <div class="sum-row"><span>วันที่ / เวลา</span><b>${state.date} | ${state.train.dep_time} - ${state.train.arr_time}</b></div>
    <div class="sum-row"><span>ผู้โดยสาร</span><b>${state.pax} คน</b></div>
    <div class="sum-row"><span>ที่นั่ง (${c.name})</span><b>${state.seats.join(', ')}</b></div>
  `;
  document.getElementById('payTotal').textContent = (state.seats.length * c.price).toLocaleString() + ' บาท';
  showPage('payment');
}

document.getElementById('payMethods').addEventListener('click', e => {
  const opt = e.target.closest('.pay-option');
  if (!opt) return;
  document.querySelectorAll('.pay-option').forEach(o => { o.classList.remove('selected'); o.querySelector('input').checked = false; });
  opt.classList.add('selected');
  opt.querySelector('input').checked = true;
});

function buildQR() {
  const box = document.getElementById('qrBox');
  box.innerHTML = '';
  for (let i = 0; i < 49; i++) {
    const cell = document.createElement('i');
    if (Math.random() < 0.42) cell.classList.add('off');
    box.appendChild(cell);
  }
}

async function doPayment() {
  if (!currentUser) { toast('กรุณาเข้าสู่ระบบก่อน'); showPage('login'); return; }
  const c = currentClass();
  const method = document.querySelector('.pay-option.selected .pt-name')?.textContent || 'บัตรเครดิต';
  let booking;
  try {
    booking = await api('/api/bookings', {
      method: 'POST',
      body: { trainId: state.train.id, classId: c.id, travelDate: state.date, seats: state.seats, paymentMethod: method }
    });
  } catch (e) { toast(e.message); return; }   // เช่น ที่นั่งถูกจองไปแล้ว

  renderTicket(booking);
  showPage('eticket');
  toast('ชำระเงินสำเร็จ! บันทึกการจองแล้ว');
}

// แสดง E-Ticket จากข้อมูลการจองหนึ่งรายการ (รูปแบบข้อมูลจาก backend)
function renderTicket(b) {
  document.getElementById('tkBookingId').textContent = b.booking_code;
  document.getElementById('tkFrom').textContent = b.from_city;
  document.getElementById('tkTo').textContent = b.to_city;
  document.getElementById('tkDateTime').textContent = `${b.travel_date} | ${b.dep_time} → ${b.arr_time}`;
  document.getElementById('tkPax').textContent = b.pax + ' คน';
  document.getElementById('tkSeat').textContent = `${b.class_name} · ${b.seats.join(', ')}`;
  document.getElementById('tkPrice').textContent = b.total_price.toLocaleString() + ' บาท';
  buildQR();
}

/* ---------------- History ---------------- */
let historyFilter = 'all';   // all | pending | paid | cancelled

const STATUS_META = {
  paid:      { cls: 'ok',     text: 'ชำระแล้ว' },
  pending:   { cls: 'wait',   text: 'รอชำระเงิน' },
  cancelled: { cls: 'cancel', text: 'ยกเลิกแล้ว' }
};

async function renderHistory() {
  const wrap = document.getElementById('historyList');
  if (!currentUser) {
    wrap.innerHTML = `<div class="empty-note">กรุณาเข้าสู่ระบบเพื่อดูประวัติการจอง<br><br>
      <button class="btn btn-primary" onclick="showPage('login')">เข้าสู่ระบบ</button></div>`;
    return;
  }
  wrap.innerHTML = '<div class="empty-note">กำลังโหลด…</div>';

  let list;
  try { list = await api('/api/bookings'); } catch (e) { wrap.innerHTML = `<div class="empty-note">${e.message}</div>`; return; }
  if (historyFilter !== 'all') list = list.filter(b => b.status === historyFilter);

  if (!list.length) {
    wrap.innerHTML = `<div class="empty-note">ยังไม่มีรายการจองในหมวดนี้<br><br>
      <button class="btn btn-primary" onclick="showPage('home')">🔍 ค้นหาและจองตั๋ว</button></div>`;
    return;
  }

  wrap.innerHTML = '';
  list.forEach(h => {
    const meta = STATUS_META[h.status] || STATUS_META.paid;
    const route = `${h.from_city} → ${h.to_city}`;
    const card = document.createElement('div');
    card.className = 'hist-card';
    card.innerHTML = `
      <div>
        <div class="hist-id">${h.booking_code}</div>
        <div style="font-weight:600;font-size:15px;margin:2px 0;">${route}</div>
        <div style="font-size:12.5px;color:var(--ink-soft);">${h.travel_date} | ${h.dep_time} - ${h.arr_time} · ${h.class_name} · ที่นั่ง ${h.seats.join(', ')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="font-weight:700;color:var(--primary);">${h.total_price.toLocaleString()} บาท</div>
        <span class="badge ${meta.cls}">${meta.text}</span>
        <button class="btn btn-ghost" onclick="viewTicket(${h.id})">ดูรายละเอียด</button>
      </div>
    `;
    wrap.appendChild(card);
  });
}

function setHistoryFilter(filter, btn) {
  historyFilter = filter;
  document.querySelectorAll('.hist-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderHistory();
}

async function viewTicket(id) {
  let b;
  try { b = await api('/api/bookings/' + id); } catch (e) { toast(e.message); return; }
  renderTicket(b);
  showPage('eticket');
}

/* ---------------- Auth ---------------- */
async function doRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const phone = document.getElementById('regPhone').value.trim();
  const pass = document.getElementById('regPassword').value;
  const pass2 = document.getElementById('regPasswordConfirm').value;
  const agree = document.getElementById('agreeTerms').checked;

  if (!name || !email || !pass) { toast('กรุณากรอกชื่อ อีเมล และรหัสผ่านให้ครบ'); return; }
  if (pass.length < 6) { toast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
  if (pass !== pass2) { toast('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
  if (!agree) { toast('กรุณายอมรับข้อกำหนดและเงื่อนไข'); return; }

  try { await api('/api/auth/register', { method: 'POST', body: { name, email, phone, password: pass } }); }
  catch (e) { toast(e.message); return; }

  toast('สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ');
  document.getElementById('loginEmail').value = email;
  showPage('login');
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass = document.getElementById('loginPassword').value;
  if (!email || !pass) { toast('กรุณากรอกอีเมลและรหัสผ่าน'); return; }

  let data;
  try { data = await api('/api/auth/login', { method: 'POST', body: { email, password: pass } }); }
  catch (e) { toast(e.message); return; }

  setToken(data.token);
  currentUser = data.user;
  applySession();
  toast('เข้าสู่ระบบสำเร็จ · ยินดีต้อนรับ ' + currentUser.name);
  showPage('home');
}

function doLogout() {
  setToken(null);
  currentUser = null;
  applySession();
  toast('ออกจากระบบแล้ว');
  showPage('home');
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (!parts[0]) return 'ผู้';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

// อัปเดต header ตามสถานะการเข้าสู่ระบบ
function applySession() {
  const guest = document.getElementById('guestActions');
  const chip = document.getElementById('userChip');
  const adminLink = document.getElementById('adminLink');
  if (currentUser) {
    guest.style.display = 'none';
    chip.style.display = 'flex';
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = initials(currentUser.name);
    if (adminLink) adminLink.style.display = currentUser.role === 'admin' ? 'block' : 'none';
  } else {
    guest.style.display = 'flex';
    chip.style.display = 'none';
    if (adminLink) adminLink.style.display = 'none';
  }
}

/* ---------------- Init ---------------- */
// ถ้ามี token อยู่แล้ว → ดึงข้อมูลผู้ใช้กลับมา (คง session ไว้แม้รีเฟรช)
(async function init() {
  const token = getToken();
  if (token) {
    try { const { user } = await api('/api/auth/me'); currentUser = user; }
    catch { setToken(null); }   // token หมดอายุ/ไม่ถูกต้อง
  }
  applySession();
})();
