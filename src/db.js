/**
 * db.js — การเชื่อมต่อฐานข้อมูล SQLite และสร้างตาราง (schema)
 * ใช้ node:sqlite (built-in ของ Node v22+) จึงไม่ต้องติดตั้ง native module
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// ไฟล์ฐานข้อมูลเดียว เก็บอยู่ใน src/database.sqlite (commit ขึ้น git ได้ → ข้อมูลตามไปทุกเครื่อง)
const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(DB_PATH);

// เปิด foreign key constraint (SQLite ปิดไว้เป็นค่าเริ่มต้น)
db.exec('PRAGMA foreign_keys = ON;');

/**
 * สร้างตารางทั้งหมดถ้ายังไม่มี (5 ตาราง)
 *  users        — สมาชิก + ผู้ดูแลระบบ
 *  trains       — ขบวนรถ
 *  train_classes— ชั้นโดยสารของแต่ละขบวน (1 ขบวนมีได้หลายชั้น)
 *  bookings     — การจอง
 *  booking_seats— ที่นั่งของแต่ละการจอง (1 การจองมีได้หลายที่นั่ง)
 */
function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      phone         TEXT,
      password      TEXT    NOT NULL,              -- เก็บเป็น bcrypt hash
      role          TEXT    NOT NULL DEFAULT 'user', -- 'user' | 'admin'
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS trains (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      train_number  INTEGER NOT NULL,              -- เลขขบวน เช่น 9, 13
      tag           TEXT    NOT NULL,              -- ประเภท เช่น ด่วนพิเศษ
      from_city     TEXT    NOT NULL,
      to_city       TEXT    NOT NULL,
      dep_time      TEXT    NOT NULL,              -- เวลาออก HH:MM
      arr_time      TEXT    NOT NULL,              -- เวลาถึง HH:MM
      duration      TEXT,                          -- ระยะเวลา
      active        INTEGER NOT NULL DEFAULT 1,    -- 1 = เปิดขาย
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS train_classes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      train_id      INTEGER NOT NULL,
      class_name    TEXT    NOT NULL,              -- เช่น ชั้น 1, ชั้น 2 (นั่งนอน)
      price         INTEGER NOT NULL,
      total_seats   INTEGER NOT NULL DEFAULT 40,
      FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code   TEXT    NOT NULL UNIQUE,      -- รหัสการจอง TRN...
      user_id        INTEGER,                      -- ผู้จอง (NULL ได้กรณี guest)
      train_id       INTEGER NOT NULL,
      class_id       INTEGER NOT NULL,
      travel_date    TEXT    NOT NULL,             -- วันเดินทาง (ข้อความไทย)
      pax            INTEGER NOT NULL,
      total_price    INTEGER NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'paid', -- paid | pending | cancelled
      payment_method TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id)  REFERENCES users(id)         ON DELETE SET NULL,
      FOREIGN KEY (train_id) REFERENCES trains(id)        ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES train_classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS booking_seats (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id  INTEGER NOT NULL,
      seat_code   TEXT    NOT NULL,                -- เช่น 2A, 5C
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );
  `);
}

module.exports = { db, init, DB_PATH };
