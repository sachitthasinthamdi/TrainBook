/* ---------------- App state ---------------- */
const state = {
  from:'กรุงเทพฯ (หัวลำโพง)', to:'เชียงใหม่', date:'27 พ.ค. 2567', pax:1,
  train:null, coach:null, seats:[], passengers:[]
};

const TRAINS = [
  {id:9,  tag:'ด่วนพิเศษ', dep:'18:10', arr:'07:15', dur:'13 ชม. 05 นาที', classes:[{name:'ชั้น 1',price:1250,seats:16},{name:'ชั้น 2 (นั่งนอน)',price:850,seats:42},{name:'ชั้น 2',price:250,seats:60}]},
  {id:13, tag:'ด่วน', dep:'20:05', arr:'08:40', dur:'12 ชม. 35 นาที', classes:[{name:'ชั้น 1',price:1150,seats:10},{name:'ชั้น 2 (นั่งนอน)',price:750,seats:38},{name:'ชั้น 2',price:750,seats:55}]},
  {id:51, tag:'ธรรมดา', dep:'07:30', arr:'19:40', dur:'12 ชม. 10 นาที', classes:[{name:'ชั้น 3',price:600,seats:80}]},
  {id:67, tag:'ธรรมดา', dep:'15:40', arr:'03:50', dur:'12 ชม. 10 นาที', classes:[{name:'ชั้น 3',price:600,seats:80}]},
];

const DATES = ['25 พ.ค.','26 พ.ค.','27 พ.ค.','28 พ.ค.','29 พ.ค.','30 พ.ค.'];

/* ---------------- Persistent storage (localStorage) ---------------- */
const DB = {
  read(key, fallback){
    try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch(e){ return fallback; }
  },
  write(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch(e){ toast('บันทึกข้อมูลไม่สำเร็จ (เบราว์เซอร์ปิด storage)'); return false; }
  }
};
const K_USERS='tb_users', K_SESSION='tb_session', K_BOOKINGS='tb_bookings';

function getUsers(){ return DB.read(K_USERS, []); }
function saveUsers(u){ DB.write(K_USERS, u); }
function currentUser(){ return DB.read(K_SESSION, null); }
function setSession(u){ if(u) DB.write(K_SESSION, u); else localStorage.removeItem(K_SESSION); }

function getBookings(){ return DB.read(K_BOOKINGS, []); }
function saveBookings(b){ DB.write(K_BOOKINGS, b); }

function initials(name){
  const parts = (name||'').trim().split(/\s+/);
  if(!parts[0]) return 'ผู้';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

/* ---------------- Navigation ---------------- */
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(a=>a.classList.toggle('active', a.dataset.p===name));
  window.scrollTo({top:0, behavior:'smooth'});
  if(name==='history') renderHistory();
}

function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2400);
}

function setTripType(type){
  document.getElementById('tabOneway').classList.toggle('active', type==='oneway');
  document.getElementById('tabRound').classList.toggle('active', type==='round');
}
function swapCities(){
  const f=document.getElementById('fromCity'), t=document.getElementById('toCity');
  const tmp=f.value; f.value=t.value; t.value=tmp;
}

/* ---------------- Search / Results ---------------- */
function doSearch(){
  state.from = document.getElementById('fromCity').value;
  state.to = document.getElementById('toCity').value;
  state.pax = parseInt(document.getElementById('paxCount').value,10);
  const d = document.getElementById('travelDate').value;
  if(d){
    const dt=new Date(d+'T00:00:00');
    const months=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    state.date = dt.getDate()+' '+months[dt.getMonth()]+' '+(dt.getFullYear()+543);
  }
  document.getElementById('rsFrom').textContent = state.from;
  document.getElementById('rsTo').textContent = state.to;
  document.getElementById('rsDate').textContent = state.date;
  renderDateTabs();
  renderTrainList();
  showPage('results');
}

function renderDateTabs(){
  const wrap = document.getElementById('dateTabs');
  wrap.innerHTML='';
  DATES.forEach((d,i)=>{
    const b=document.createElement('button');
    b.className='date-tab'+(i===2?' active':'');
    b.textContent=d;
    b.onclick=()=>{document.querySelectorAll('.date-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');};
    wrap.appendChild(b);
  });
}

function renderTrainList(){
  const wrap=document.getElementById('trainList');
  wrap.innerHTML='';
  TRAINS.forEach(tr=>{
    const card=document.createElement('div');
    card.className='train-card';
    card.innerHTML=`
      <div class="train-meta">
        <div>
          <span class="train-tag">${tr.tag}</span>
          <div class="train-name" style="margin-top:6px;">ขบวน ${tr.id}</div>
          <div style="font-size:12.5px;color:var(--ink-soft);">${state.from} → ${state.to}</div>
        </div>
        <div class="train-time">
          <span>${tr.dep}</span>
          <span class="dur"><span class="line"></span>${tr.dur}</span>
          <span>${tr.arr}</span>
        </div>
      </div>
      <div class="class-list">
        ${tr.classes.map(c=>`
          <div class="class-pill">
            <div class="cn">${c.name}</div>
            <div class="cp">${c.price.toLocaleString()} บาท</div>
            <div class="seats">เหลือ ${c.seats}</div>
          </div>`).join('')}
      </div>
      <button class="btn btn-primary" onclick='selectTrain(${tr.id})'>เลือกที่นั่ง</button>
    `;
    wrap.appendChild(card);
  });
}

/* ---------------- Seats ---------------- */
function selectTrain(id){
  state.train = TRAINS.find(t=>t.id===id);
  state.coach = 0;
  state.seats = [];
  document.getElementById('seatTrainTitle').textContent = `ขบวน ${state.train.id} (${state.train.tag}) · ${state.from} → ${state.to}`;
  document.getElementById('seatTrainTime').textContent = `${state.date} | ${state.train.dep} - ${state.train.arr}`;
  renderCoachSelect();
  renderSeatMap();
  updateSeatSidebar();
  showPage('seats');
}

function renderCoachSelect(){
  const wrap=document.getElementById('coachSelect');
  wrap.innerHTML='';
  state.train.classes.forEach((c,i)=>{
    const btn=document.createElement('button');
    btn.className='coach-chip'+(i===state.coach?' selected':'');
    btn.innerHTML=`<div class="cc-name">${c.name}</div><div class="cc-price">${c.price.toLocaleString()} บาท</div>`;
    btn.onclick=()=>{ state.coach=i; state.seats=[]; renderCoachSelect(); renderSeatMap(); updateSeatSidebar(); };
    wrap.appendChild(btn);
  });
}

function renderSeatMap(){
  const wrap=document.getElementById('seatMap');
  wrap.innerHTML='';
  const cols=['A','C','gap','D','F'];
  const takenSeed = [ '2A','3D','4C','6F','1F' ];
  for(let row=1; row<=8; row++){
    cols.forEach(col=>{
      if(col==='gap'){
        const g=document.createElement('div'); g.className='seat gap'; wrap.appendChild(g); return;
      }
      const code = row+col;
      const seat=document.createElement('div');
      const isTaken = takenSeed.includes(code);
      seat.className='seat'+(isTaken?' taken':'')+(state.seats.includes(code)?' selected':'');
      seat.textContent=code;
      if(!isTaken){
        seat.onclick=()=>toggleSeat(code);
      }
      wrap.appendChild(seat);
    });
  }
}

function toggleSeat(code){
  const i=state.seats.indexOf(code);
  if(i>-1){ state.seats.splice(i,1); }
  else{
    if(state.seats.length>=state.pax){ toast(`เลือกได้สูงสุด ${state.pax} ที่นั่งตามจำนวนผู้โดยสาร`); return; }
    state.seats.push(code);
  }
  renderSeatMap();
  updateSeatSidebar();
}

function updateSeatSidebar(){
  const c = state.train.classes[state.coach];
  const box=document.getElementById('chosenSeats');
  box.innerHTML = state.seats.length
    ? state.seats.map(s=>`<span class="seat-chip-selected">${c.name.split(' ')[0]} · ${s}</span>`).join('')
    : 'ยังไม่ได้เลือกที่นั่ง';
  document.getElementById('seatTotal').textContent = (state.seats.length*c.price).toLocaleString()+' บาท';
}

function goPassengerPage(){
  if(state.seats.length===0){ toast('กรุณาเลือกที่นั่งอย่างน้อย 1 ที่นั่ง'); return; }
  if(state.seats.length < state.pax){ toast(`กรุณาเลือกที่นั่งให้ครบ ${state.pax} ที่นั่ง`); return; }
  renderPassengerForms();
  showPage('passenger');
}

/* ---------------- Passenger ---------------- */
function renderPassengerForms(){
  const wrap=document.getElementById('passengerForms');
  wrap.innerHTML='';
  for(let i=0;i<state.pax;i++){
    const block=document.createElement('div');
    block.className='passenger-block';
    block.innerHTML=`
      <h4>ผู้โดยสารคนที่ ${i+1} ${state.seats[i]?'· ที่นั่ง '+state.seats[i]:''}</h4>
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
  const c = state.train.classes[state.coach];
  document.getElementById('passengerTripInfo').innerHTML = `
    <b>ขบวน ${state.train.id}</b> (${state.train.tag}) &nbsp;|&nbsp; ${state.date} | ${state.train.dep} - ${state.train.arr}<br>
    ${state.from} → ${state.to} &nbsp;|&nbsp; ตู้โดยสาร · ${c.name} · ที่นั่ง ${state.seats.join(', ')}
  `;
}

/* ---------------- Payment ---------------- */
function goPaymentPage(){
  const c = state.train.classes[state.coach];
  document.getElementById('paySummary').innerHTML=`
    <div class="sum-row"><span>ขบวน</span><b>${state.train.id} (${state.train.tag})</b></div>
    <div class="sum-row"><span>เส้นทาง</span><b>${state.from} → ${state.to}</b></div>
    <div class="sum-row"><span>วันที่ / เวลา</span><b>${state.date} | ${state.train.dep} - ${state.train.arr}</b></div>
    <div class="sum-row"><span>ผู้โดยสาร</span><b>${state.pax} คน</b></div>
    <div class="sum-row"><span>ที่นั่ง (${c.name})</span><b>${state.seats.join(', ')}</b></div>
  `;
  document.getElementById('payTotal').textContent = (state.seats.length*c.price).toLocaleString()+' บาท';
  showPage('payment');
}

document.getElementById('payMethods').addEventListener('click', e=>{
  const opt = e.target.closest('.pay-option');
  if(!opt) return;
  document.querySelectorAll('.pay-option').forEach(o=>{o.classList.remove('selected'); o.querySelector('input').checked=false;});
  opt.classList.add('selected');
  opt.querySelector('input').checked=true;
});

function randomBookingId(){
  return 'TRN'+Math.floor(600000+Math.random()*90000)+'S'+Math.floor(10000+Math.random()*89999);
}

function buildQR(){
  const box=document.getElementById('qrBox');
  box.innerHTML='';
  for(let i=0;i<49;i++){
    const cell=document.createElement('i');
    const isCorner = (i<3||i%7<1)&&false;
    if(Math.random()<0.42) cell.classList.add('off');
    box.appendChild(cell);
  }
}

function doPayment(){
  const c = state.train.classes[state.coach];
  const total = state.seats.length*c.price;
  const u = currentUser();

  // สร้างรายการจอง แล้วบันทึกลง localStorage (สถานะ: ชำระแล้ว)
  const booking = {
    id: randomBookingId(),
    owner: u ? u.email : 'guest',
    from: state.from,
    to: state.to,
    route: `${state.from} → ${state.to}`,
    date: state.date,
    trainId: state.train.id,
    trainTag: state.train.tag,
    dep: state.train.dep,
    arr: state.train.arr,
    time: `${state.train.dep} - ${state.train.arr}`,
    className: c.name,
    seats: state.seats.slice(),
    pax: state.pax,
    price: total,
    status: 'ok',
    createdAt: Date.now()
  };
  const all = getBookings();
  all.unshift(booking);
  saveBookings(all);

  renderTicket(booking);
  showPage('eticket');
  toast('ชำระเงินสำเร็จ! บันทึกการจองแล้ว');
}

// แสดง E-Ticket จากข้อมูลการจองหนึ่งรายการ
function renderTicket(b){
  document.getElementById('tkBookingId').textContent = b.id;
  document.getElementById('tkFrom').textContent = b.from;
  document.getElementById('tkTo').textContent = b.to;
  document.getElementById('tkDateTime').textContent = `${b.date} | ${b.dep} → ${b.arr}`;
  document.getElementById('tkPax').textContent = b.pax+' คน';
  document.getElementById('tkSeat').textContent = `${b.className} · ${b.seats.join(', ')}`;
  document.getElementById('tkPrice').textContent = b.price.toLocaleString()+' บาท';
  buildQR();
}

/* ---------------- History ---------------- */
let historyFilter = 'all';   // all | wait | ok | cancel

const STATUS_META = {
  ok:     {cls:'ok',     text:'ชำระแล้ว'},
  wait:   {cls:'wait',   text:'รอชำระเงิน'},
  cancel: {cls:'cancel', text:'ยกเลิกแล้ว'}
};

function renderHistory(){
  const wrap=document.getElementById('historyList');
  wrap.innerHTML='';

  const u = currentUser();
  let list = getBookings();
  // ถ้าเข้าสู่ระบบอยู่ ให้แสดงเฉพาะการจองของผู้ใช้คนนั้น
  if(u) list = list.filter(b => b.owner === u.email);
  if(historyFilter !== 'all') list = list.filter(b => b.status === historyFilter);

  if(list.length === 0){
    wrap.innerHTML = `<div class="empty-note">ยังไม่มีรายการจองในหมวดนี้<br><br>
      <button class="btn btn-primary" onclick="showPage('home')">🔍 ค้นหาและจองตั๋ว</button></div>`;
    return;
  }

  list.forEach(h=>{
    const meta = STATUS_META[h.status] || STATUS_META.ok;
    const card=document.createElement('div');
    card.className='hist-card';
    card.innerHTML=`
      <div>
        <div class="hist-id">${h.id}</div>
        <div style="font-weight:600;font-size:15px;margin:2px 0;">${h.route}</div>
        <div style="font-size:12.5px;color:var(--ink-soft);">${h.date} | ${h.time} · ${h.className||''} · ที่นั่ง ${(h.seats||[]).join(', ')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="font-weight:700;color:var(--primary);">${h.price.toLocaleString()} บาท</div>
        <span class="badge ${meta.cls}">${meta.text}</span>
        <button class="btn btn-ghost" onclick="viewTicket('${h.id}')">ดูรายละเอียด</button>
        <button class="btn btn-ghost" style="color:var(--danger);border-color:#f3d0d0;" onclick="deleteBooking('${h.id}')">🗑 ลบ</button>
      </div>
    `;
    wrap.appendChild(card);
  });
}

function setHistoryFilter(filter, btn){
  historyFilter = filter;
  document.querySelectorAll('.hist-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  renderHistory();
}

function viewTicket(id){
  const b = getBookings().find(x=>x.id===id);
  if(!b) return;
  renderTicket(b);
  showPage('eticket');
}

function deleteBooking(id){
  if(!confirm('ต้องการลบรายการจองนี้ใช่หรือไม่?')) return;
  const all = getBookings().filter(b=>b.id!==id);
  saveBookings(all);
  toast('ลบรายการจองแล้ว');
  renderHistory();
}

/* ---------------- Auth ---------------- */
function doRegister(){
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const phone = document.getElementById('regPhone').value.trim();
  const pass = document.getElementById('regPassword').value;
  const pass2 = document.getElementById('regPasswordConfirm').value;
  const agree = document.getElementById('agreeTerms').checked;

  if(!name || !email || !pass){ toast('กรุณากรอกชื่อ อีเมล และรหัสผ่านให้ครบ'); return; }
  if(pass.length < 6){ toast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
  if(pass !== pass2){ toast('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
  if(!agree){ toast('กรุณายอมรับข้อกำหนดและเงื่อนไข'); return; }

  const users = getUsers();
  if(users.some(u=>u.email===email)){ toast('อีเมลนี้ถูกใช้สมัครแล้ว'); return; }

  users.push({name, email, phone, password:pass});
  saveUsers(users);
  toast('สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ');
  // เติมอีเมลให้อัตโนมัติในหน้า login
  document.getElementById('loginEmail').value = email;
  showPage('login');
}

function doLogin(){
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass = document.getElementById('loginPassword').value;
  if(!email || !pass){ toast('กรุณากรอกอีเมลและรหัสผ่าน'); return; }

  const user = getUsers().find(u=>u.email===email && u.password===pass);
  if(!user){ toast('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); return; }

  setSession({name:user.name, email:user.email});
  applySession();
  toast('เข้าสู่ระบบสำเร็จ · ยินดีต้อนรับ '+user.name);
  showPage('home');
}

function doLogout(){
  setSession(null);
  applySession();
  toast('ออกจากระบบแล้ว');
  showPage('home');
}

// อัปเดต header ตามสถานะการเข้าสู่ระบบปัจจุบัน
function applySession(){
  const u = currentUser();
  const guest = document.getElementById('guestActions');
  const chip = document.getElementById('userChip');
  if(u){
    guest.style.display='none';
    chip.style.display='flex';
    document.getElementById('userName').textContent = u.name;
    document.getElementById('userAvatar').textContent = initials(u.name);
  }else{
    guest.style.display='flex';
    chip.style.display='none';
  }
}

/* ---------------- Init ---------------- */
applySession();
