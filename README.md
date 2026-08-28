# 🚆 TrainBook — ระบบจองตั๋วรถไฟออนไลน์ (Full-stack)

เว็บแอปพลิเคชันจองตั๋วรถไฟ พัฒนาด้วย **Node.js + Express + SQLite** (backend) และ **HTML/CSS/JavaScript** (frontend) รองรับทั้งผู้ใช้ทั่วไป (User) และผู้ดูแลระบบ (Admin)

## ✨ ความสามารถ

**ผู้ใช้ทั่วไป (User)**
- สมัครสมาชิก / เข้าสู่ระบบ (รหัสผ่านเข้ารหัสด้วย bcrypt)
- ค้นหาเที่ยวรถ เลือกขบวน ชั้นโดยสาร และที่นั่ง (ที่นั่งที่ถูกจองแล้วจะล็อกอัตโนมัติ)
- ชำระเงิน → รับ E-Ticket พร้อม QR Code และสถานะ "ชำระแล้ว"
- ดู / ลบ ประวัติการจองของตนเอง

**ผู้ดูแลระบบ (Admin)**
- แดชบอร์ดสรุป (จำนวนสมาชิก / ขบวนรถ / การจอง / รายได้)
- จัดการขบวนรถ: เพิ่ม / แก้ไข / ลบ (พร้อมชั้นโดยสารและราคา)
- ดูการจองทั้งหมดของทุกผู้ใช้ และยกเลิก / คืนสถานะได้
- ดูรายชื่อสมาชิกทั้งหมด

## 🧱 สถาปัตยกรรม

```
เบราว์เซอร์ (Frontend)  ──fetch /api/*──►  Express (Backend)  ──►  SQLite (Database)
  public/*.html/css/js        REST + JWT         src/server.js        src/database.sqlite
```

- **Backend**: Express + `node:sqlite` (SQLite ในตัว Node v22+ ไม่ต้องคอมไพล์ native module)
- **Auth**: JWT + bcryptjs
- **Database**: SQLite ไฟล์เดียว (`src/database.sqlite`) — 5 ตาราง

## 📂 โครงสร้างโปรเจค

```
trainbook/
├── public/            Frontend
│   ├── index.html     หน้าเว็บผู้ใช้
│   ├── style.css
│   ├── app.js
│   ├── admin.html     หน้าผู้ดูแลระบบ
│   └── admin.js
├── src/               Backend
│   ├── server.js      Express + REST API
│   ├── db.js          เชื่อมต่อ + schema
│   ├── seed.js        ข้อมูลตั้งต้น
│   └── database.sqlite ฐานข้อมูล
├── package.json
└── README.md
```

## 🚀 วิธีติดตั้งและรัน

```bash
npm install       # ติดตั้ง dependencies
npm run seed      # ใส่ข้อมูลตั้งต้น (ทำครั้งแรก หรือเมื่อต้องการรีเซ็ต)
npm start         # รัน server
```

เปิดเบราว์เซอร์ที่ **http://localhost:3000**

## 🔑 บัญชีเริ่มต้น (หลัง seed)

| บทบาท | อีเมล | รหัสผ่าน |
|-------|-------|---------|
| ผู้ดูแลระบบ | `admin@trainbook.com` | `admin123` |
| ผู้ใช้ตัวอย่าง | `somchai@example.com` | `123456` |

> เข้าด้วยบัญชีแอดมิน แล้วเมนู "🛠 แอดมิน" จะปรากฏบนแถบนำทาง

## 🗄️ ฐานข้อมูล (5 ตาราง)

| ตาราง | หน้าที่ |
|-------|--------|
| `users` | สมาชิกและผู้ดูแลระบบ |
| `trains` | ขบวนรถ |
| `train_classes` | ชั้นโดยสารของแต่ละขบวน |
| `bookings` | การจอง |
| `booking_seats` | ที่นั่งของแต่ละการจอง |

## 🔌 REST API (สรุป)

| Method | Endpoint | สิทธิ์ |
|--------|----------|-------|
| POST | `/api/auth/register` | ทั่วไป |
| POST | `/api/auth/login` | ทั่วไป |
| GET | `/api/trains` | ทั่วไป |
| GET | `/api/trains/:t/classes/:c/taken-seats` | ทั่วไป |
| POST | `/api/bookings` | ผู้ใช้ |
| GET | `/api/bookings` | ผู้ใช้ |
| DELETE | `/api/bookings/:id` | ผู้ใช้/แอดมิน |
| GET | `/api/admin/summary` | แอดมิน |
| GET/POST/PUT/DELETE | `/api/admin/trains` | แอดมิน |
| GET | `/api/admin/bookings` | แอดมิน |
| PATCH | `/api/admin/bookings/:id/status` | แอดมิน |
| GET | `/api/admin/users` | แอดมิน |
