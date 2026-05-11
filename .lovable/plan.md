
# GHR Payment System — Rencana Implementasi

Aplikasi web pencatatan iuran warga "GHR Payment System". Diakses via browser (bukan Electron desktop). Repo GitHub disambungkan manual oleh user via menu **+ → GitHub → Connect project** setelah build pertama.

## Stack
- TanStack Start (template Lovable) + React 19 + Tailwind v4 + shadcn/ui
- Database: **Neon Postgres** (connection string yang Anda berikan) — diakses dari server functions saja via driver `postgres` (postgres.js)
- Auth: implementasi custom (email + password) dengan tabel `users`, bcrypt hash, dan JWT session cookie httpOnly — karena tidak pakai Lovable Cloud/Supabase
- PDF: `jspdf` + `jspdf-autotable`. Excel: `xlsx`

## Keamanan kredensial Neon
Connection string Neon adalah kredensial sensitif dan **tidak boleh masuk ke kode**. Akan saya simpan sebagai secret server (`DATABASE_URL`) lewat tool secrets — Anda diminta paste sekali di form aman. Begitu juga `JWT_SECRET` untuk session.

> Catatan: Anda menempelkan connection string di chat. Sebaiknya **rotate password** Neon tersebut setelah implementasi selesai (Neon Console → Roles → Reset password), karena chat history menyimpan nilainya.

## Skema database (migration awal)

```text
users
  id uuid pk, email unique, password_hash, full_name, role ('admin'|'bendahara'),
  created_at

residents (warga)
  id uuid pk, nik, full_name, house_block, house_number, phone,
  status ('active'|'inactive'), joined_at, created_at

dues_types (jenis iuran)
  id uuid pk, name, amount_default numeric, period ('monthly'|'one_time'),
  active bool, created_at

dues_periods (periode tagihan bulanan yang di-generate)
  id uuid pk, dues_type_id fk, year int, month int,
  unique(dues_type_id, year, month)

bills (tagihan per warga per periode)
  id uuid pk, resident_id fk, dues_period_id fk, amount numeric,
  status ('unpaid'|'paid'|'partial'), due_date,
  unique(resident_id, dues_period_id)

payments (pembayaran)
  id uuid pk, bill_id fk, resident_id fk, amount numeric, paid_at,
  method ('cash'|'transfer'|'qris'), note, receipt_no, recorded_by fk users
```

Index pada `bills(status, due_date)` dan `payments(paid_at)`.

## Halaman & routing

```text
/login                       — login
/                            — dashboard (ringkasan kas, tunggakan, grafik)
/warga                       — list & CRUD warga
/iuran                       — kelola jenis iuran + generate periode bulanan
/tagihan                     — daftar tagihan, filter periode/status, tandai lunas
/pembayaran                  — riwayat pembayaran + cetak kwitansi
/laporan                     — laporan kas bulanan, export PDF/Excel
/pengguna   (admin only)     — kelola user admin/bendahara
```

Layout pakai sidebar shadcn + topbar. Route diproteksi via `_authenticated` layout dengan `beforeLoad` cek session cookie. `/pengguna` extra check role=admin.

## Server functions (createServerFn)
- `auth.functions.ts`: `login`, `logout`, `me`, `register` (admin only)
- `residents.functions.ts`: list/create/update/delete/import
- `dues.functions.ts`: CRUD jenis iuran, `generateMonthlyPeriod({year, month, duesTypeId})` → bikin `dues_periods` + `bills` untuk semua warga aktif
- `bills.functions.ts`: list dengan filter, mark paid
- `payments.functions.ts`: record payment (transaksi: insert payment + update bill status), list, get receipt data
- `reports.functions.ts`: monthly cashflow, arrears list, exports

Semua pakai pool `postgres` dari `process.env.DATABASE_URL`, dibuat sekali di `src/lib/db.server.ts`. Validasi input dengan zod.

## Fitur utama
1. **Data warga & iuran**: CRUD warga (blok/nomor rumah, kontak), jenis iuran (mis. "Iuran Keamanan" 50.000/bulan), generate tagihan bulanan sekaligus.
2. **Pembayaran**: form catat bayar per tagihan, otomatis update status, generate nomor kwitansi `GHR/{YYMM}/0001`, cetak kwitansi PDF.
3. **Laporan**: kas masuk bulanan, rincian per jenis iuran, daftar tunggakan; export **PDF** (jspdf) & **Excel** (xlsx).
4. **Multi-user**: role `admin` (semua akses + kelola user) dan `bendahara` (warga/tagihan/pembayaran/laporan, tanpa kelola user). Seed 1 admin awal via secret `INITIAL_ADMIN_EMAIL` & `INITIAL_ADMIN_PASSWORD`.

## Desain
Tema: profesional, "civic-modern". Warna utama hijau zamrud (oklch) + neutral hangat, aksen emas tipis untuk angka rupiah. Font: Plus Jakarta Sans (display) + Inter (body). Sidebar gelap, content terang. Kartu KPI di dashboard, tabel rapat dengan filter & badge status.

## Langkah eksekusi
1. Install deps: `postgres`, `bcryptjs`, `jose` (JWT), `jspdf`, `jspdf-autotable`, `xlsx`, `date-fns`.
2. Tambah secrets: `DATABASE_URL`, `JWT_SECRET`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`.
3. Buat `src/lib/db.server.ts` + script migrasi yang dijalankan saat boot (idempotent `CREATE TABLE IF NOT EXISTS`) + seed admin.
4. Implement auth (server fn + `/login` + `_authenticated` guard).
5. Implement CRUD warga → jenis iuran → generate periode → tagihan → pembayaran → laporan.
6. Dashboard + sidebar layout + styling tema.
7. Anda hubungkan ke GitHub repo `ghr-finance/ghr-pay` lewat menu **+ → GitHub → Connect project** (Lovable tidak bisa otomatis push ke repo existing — repo harus kosong atau dibuat baru lewat Lovable; jika `ghr-pay` sudah berisi kode, opsinya: kosongkan repo dulu, atau biarkan Lovable buat repo baru lalu pindahkan).

## Catatan / batasan
- **Bukan desktop app (Electron)** — Anda memilih web only. Kalau nanti ingin .exe/.dmg, bisa ditambahkan packaging Electron di tahap lanjutan.
- Lovable **tidak bisa import** repo GitHub existing secara otomatis. Untuk repo `git@github.com:ghr-finance/ghr-pay.git`: jika kosong → bisa langsung connect setelah unlink default; jika sudah berisi → siapkan repo kosong atau biarkan Lovable bikin repo baru di organisasi `ghr-finance`.
- Connection string Neon yang Anda kirim di chat sebaiknya di-rotate setelah app jalan.
