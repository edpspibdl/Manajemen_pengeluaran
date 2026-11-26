# PLANNING.md
# KOSMATE — Personal Finance & Meal Planner

## 1. PROJECT OVERVIEW

KosMate adalah aplikasi mobile **offline-first** untuk membantu anak kos mengelola keuangan pribadi, mengendalikan pengeluaran, melacak kewajiban rutin, dan merencanakan makanan sehari-hari berdasarkan kondisi keuangan aktual.

Aplikasi menyesuaikan rekomendasi secara dinamis berdasarkan:
- Saldo dompet operasional yang benar-benar tersedia untuk belanja.
- Pemasukan dan siklus tanggal penerimaan (gajian / uang kiriman).
- Kewajiban rutin yang belum dibayar dan pengeluaran yang sudah direncanakan.
- Dana cadangan / target tabungan dan dana darurat yang harus dilindungi.
- Sisa hari hingga akhir siklus keuangan aktif.
- Harga makanan lokal di sekitar pengguna (dapat dikustomisasi).
- Preferensi makanan, pantangan, dan fasilitas memasak yang dimiliki.
- Realisasi pengeluaran harian secara real-time.

**Tujuan utama:**
Membantu pengguna hidup lebih teratur, makan cukup dan bergizi variatif, kewajiban kos/tagihan terbayar tepat waktu, dan tidak kehabisan uang sebelum pemasukan berikutnya tiba.

---

## 2. TARGET PLATFORM, ARCHITECTURE & TECHNOLOGY

Pengembangan menggunakan pendekatan **Android-first** dan **offline-first** dengan arsitektur web modern yang dibungkus menjadi aplikasi Android native menggunakan Capacitor.

| Komponen | Teknologi & Spesifikasi |
|---|---|
| Mobile UI | HTML5, CSS3, JavaScript (ES Modules) |
| Build Tool & Dev Server | Vite (bundle aset lokal 100% offline, tanpa ketergantungan CDN) |
| UI Styling & Design System | KosMate Custom Mobile-First CSS (Design Tokens, Bottom Sheet, Safe Area) |
| State & Routing | Modular Reactive Store (Pub/Sub) + Lightweight SPA Router |
| Mobile Framework | Capacitor (v6+) untuk Android APK packaging & native bridge |
| Database Lokal | SQLite (`@capacitor-community/sqlite` untuk Android + `jeep-sqlite`/IndexedDB fallback untuk preview & testing di browser) |
| Native Plugins Wajib | `@capacitor/filesystem`, `@capacitor/share` (Backup/Restore & Export), `@capacitor/local-notifications` (Reminder tagihan & makan), `@capacitor/status-bar`, `@capacitor/haptics` |
| Charts | Chart.js (di-bundle lokal via npm) |
| Backend (Opsional / Lanjutan) | Laravel REST API |
| Database Pusat (Opsional) | PostgreSQL |
| IDE | Antigravity / VS Code |
| Build & CI/CD | Android Gradle lokal & GitHub Actions (`.github/workflows/android-apk.yml`) untuk automated APK build |

**Prioritas Teknis:**
- Aplikasi berjalan sebagai APK Android dan dapat langsung diuji penuh di browser saat pengembangan.
- Seluruh fitur inti (pencatatan, kalkulasi budget, meal planner, laporan, backup/restore) berjalan **100% tanpa internet**.
- Semua data user tersimpan secara lokal di SQLite dengan versioning migrasi skema (`schema_migrations`).
- Seluruh tabel inti menggunakan UUID v4, timestamp perubahan (`created_at`, `updated_at`), dan *soft delete* (`deleted_at`) agar siap untuk sinkronisasi cloud di fase lanjutan.
- Arsitektur modular berbasis *Repository & Service Layer* sehingga logika bisnis keuangan dan meal planner terpisah rapi dari lapisan UI.

---

## 3. CORE FEATURES

### A. Dashboard Keuangan (Real-Time)

Menampilkan kondisi keuangan berdasarkan **Siklus Periode Keuangan Aktif** (bukan sekadar tanggal kalender 1–30).

Informasi utama di Dashboard:
- **Saldo Operasional Tersedia**: Total saldo dompet belanja harian (terpisah dari dompet tabungan/dana darurat).
- **Dana Tabungan & Darurat (Terkunci)**: Total saldo dompet non-operasional yang dilindungi.
- **Kewajiban Belum Dibayar**: Total tagihan rutin & pengeluaran terencana yang jatuh tempo di periode aktif dan belum lunas.
- **Dana Aman Digunakan**: Uang riil yang aman dipakai hingga akhir periode.
- **Budget Harian & Sisa Hari Ini**: Plafon belanja hari ini serta sisa limit setelah dikurangi pengeluaran hari ini.
- **Budget Makan Hari Ini**: Alokasi khusus makan hari ini beserta sisa budget makan yang tersedia.
- **Ringkasan Periode Berjalan**: Total pemasukan, total pengeluaran, dan progress bar penggunaan dana aman.
- **Status Kesehatan Keuangan**: `Aman`, `Waspada`, `Kritis`, atau `Defisit` disertai alasan spesifik.
- **Ringkasan Menu Hari Ini & Peringatan Pintar**.

Dashboard wajib diperbarui otomatis (*re-compute*) setiap kali ada mutasi transaksi, pembayaran tagihan, transfer dompet, perubahan budget, atau pencatatan makan.

---

### B. Financial Management

Pencatatan keuangan dinamis dengan dukungan multi-dompet dan akurasi saldo berbasis transaksi.

**Jenis Transaksi:**
- `income` — Pemasukan (uang kiriman, gaji, freelance, bonus, lain-lain).
- `expense` — Pengeluaran (termasuk penanda opsional `is_unexpected` untuk pengeluaran tak terduga).
- `transfer` — Transfer antar-dompet (memindahkan saldo dari `wallet_id` asal ke `to_wallet_id` tujuan tanpa memengaruhi total pemasukan atau pengeluaran).

**Kategori Default:**
- *Pengeluaran:* Makan & Minum, Kos & Listrik, Transportasi, Pulsa & Internet, Kebutuhan Pribadi, Hiburan, Kesehatan, Tabungan/Cadangan, Lain-lain.
- *Pemasukan:* Uang Kiriman/Gajian, Kerja Sampingan/Freelance, Bonus/Hadiah, Pengembalian Dana, Lain-lain.
- Pengguna dapat menambah, mengubah, atau menonaktifkan kategori kustom (kategori sistem seperti Makan & Minum dan Kos & Listrik tetap terlindungi dari penghapusan permanen).

**Manajemen Dompet (`wallets`):**
- Tipe dompet eksplisit: `cash` (Tunai), `bank` (Rekening Bank), `ewallet` (Dompet Digital), `savings` (Tabungan), dan `emergency` (Dana Darurat).
- Flag `include_in_daily_budget`:
  - `1` (Aktif) untuk `cash`, `bank`, `ewallet` (dompet operasional).
  - `0` (Terkunci) untuk `savings` dan `emergency` agar tidak otomatis terpakai sebagai uang belanja harian.

**Tagihan Rutin (`recurring_expenses`) & Pengeluaran Terencana (`planned_expenses`):**
- Tagihan rutin (kos, listrik, air, internet, cicilan) memiliki `due_day`, `frequency`, `next_due_date`, dan `last_paid_period_id`.
- Aksi **"Bayar Tagihan"** membuat transaksi pengeluaran atomik yang tertaut ke `recurring_expense_id` dan langsung menandai tagihan lunas untuk periode berjalan sehingga tidak dapat terduplikasi.
- Pengeluaran terencana (`planned_expenses`) mencatat kebutuhan *one-time* yang sudah pasti di periode ini (mis. beli buku, servis motor, iuran kampus) agar ikut diperhitungkan sebelum dana bebas dibelanjakan.

**Fitur Pendukung:**
- Tambah (Quick-Add maks. 3 langkah), edit, dan hapus transaksi (dengan pembaruan saldo otomatis & atomik).
- Riwayat transaksi dengan pencarian & filter berdasarkan rentang tanggal, dompet, jenis, dan kategori.
- Grafik pengeluaran & perbandingan realisasi terhadap batas anggaran kategori (`budgets`).

---

### C. Smart Budget Calculator

Fitur inti KosMate. Semua angka dihitung dinamis dari kondisi keuangan aktual dan siklus periode aktif.

#### 1. Definisi Siklus Periode Keuangan (`financial_periods`)
- Periode mengikuti pengaturan user:
  - `monthly` berdasarkan `income_day` (mis. tanggal 25 bulan berjalan s.d. tanggal 24 bulan berikutnya), atau tanggal 1 s.d. akhir bulan.
  - `biweekly` (14 hari) atau `weekly` (7 hari).
- `RemainingDays = max(1, selisih_hari(period_end_date, today) + 1)` (inklusif hari ini).

#### 2. Rumus Inti Anti-Double-Counting
1. **Uang Operasional Tersedia (`AvailableOperationalCash`):**
   ```
   AvailableOperationalCash = SUM(wallets.balance WHERE include_in_daily_budget = 1 AND deleted_at IS NULL)
   ```
   *(Secara akuntansi ekuivalen dengan: Saldo Awal Operasional Periode + Pemasukan ke Dompet Operasional - Pengeluaran dari Dompet Operasional ± Net Transfer antara Dompet Operasional dan Non-Operasional. Saldo dompet `savings`/`emergency` otomatis terpisah sehingga tidak pernah dihitung ganda sebagai uang belanja).*

2. **Kewajiban Belum Dibayar (`UnpaidObligations`):**
   ```
   UnpaidObligations =
       SUM(recurring_expenses.amount WHERE is_active = 1 AND deleted_at IS NULL AND next_due_date <= period_end_date AND (last_paid_period_id IS NULL OR last_paid_period_id != active_period_id))
     + SUM(planned_expenses.amount WHERE period_id = active_period_id AND status = 'pending' AND deleted_at IS NULL)
   ```

3. **Sisa Target Cadangan Periode (`RemainingReserveAllocation`):**
   - Jika user menetapkan target tabungan/dana cadangan periode ini (`reserve_target`, mis. Rp300.000/periode) yang uangnya masih mengendap di dompet operasional, sistem mengurangi porsi yang *belum dipindahkan* ke dompet tabungan/darurat:
   ```
   TransferredToSavingsThisPeriod = SUM(transactions.amount WHERE period_id = active_period_id AND type = 'transfer' AND deleted_at IS NULL AND from_wallet.include_in_daily_budget = 1 AND to_wallet.include_in_daily_budget = 0)
   RemainingReserveAllocation = max(0, active_period.reserve_target - TransferredToSavingsThisPeriod)
   ```
   *(Begitu user mentransfer uang tabungan ke dompet `savings`/`emergency`, saldo operasional berkurang dan `RemainingReserveAllocation` juga berkurang — sehingga tidak terjadi pemotongan ganda).*

4. **Dana Aman Digunakan (`SafeToSpend`):**
   ```
   SafeToSpend = AvailableOperationalCash - UnpaidObligations - RemainingReserveAllocation
   ```

5. **Budget Harian Total (`BaseDailyBudget` & `RemainingDailyToday`):**
   - Pengeluaran operasional hari ini (`TodayOperationalExpense`) sudah memotong `AvailableOperationalCash`. Agar plafon awal hari ini tetap konsisten dan *rolling* untuk esok hari:
   ```
   SafeBeforeTodayExpense = SafeToSpend + TodayOperationalExpense
   BaseDailyBudgetToday   = max(0, floor(SafeBeforeTodayExpense / RemainingDays))
   RemainingDailyToday    = BaseDailyBudgetToday - TodayOperationalExpense
   ```
   - Jika hari ini hemat (`RemainingDailyToday > 0`), sisa dana otomatis terbagi rata untuk sisa hari berikutnya mulai besok.
   - Jika hari ini melebihi budget (`RemainingDailyToday < 0`), sisa hari berikutnya otomatis terkoreksi turun.

6. **Alokasi Budget Makan Harian (`DailyFoodBudget`), Makan Enak 3x/Minggu & Kalori Anti-Turun BB:**
   - Mendukung **2 Mode Budget Makan**:
     1. **Mode Target Tetap per Periode (`food_budget_mode = 'fixed'`)**: Pengguna menginput langsung nominal budget makan per periode (mis. **Rp 300.000/bulan**). Sisa dana makan (`RemainingFoodPool`) dibagi cerdas ke sisa hari dengan porsi terpisah antara **Hari Biasa** (`RegularDayFoodTarget`, bobot `1.0`) dan **Hari Makan Enak** (`TreatDayFoodTarget`, bobot `1.65`, default **3x/minggu**) sehingga total tetap mencukupi sampai akhir periode. Setiap pencatatan beli makan manual langsung menghitung ulang target besok hingga akhir bulan (`NextDayFlatFoodTarget`).
     2. **Mode Rasio Otomatis (`food_budget_mode = 'ratio'`)**: Dihitung dari `food_budget_ratio` terhadap `BaseDailyBudgetToday` (atau batas budget kategori Makan & Minum).
   - **Guardrail Kalori & Berat Badan (`min_daily_calories`, default `1.900 kkal/hari`):**
     - Pencatatan makan manual menyimpan nama makanan, nominal rupiah, waktu makan, kalori, protein, dan penanda `is_treat_meal`.
     - Sistem melacak total kalori harian yang sudah terpenuhi serta menampilkan evaluasi kelayakan (*Nyaman*, *Seimbang*, *Ketat — Wajib Masak Sendiri*, atau *Risiko Defisit Kalori*) dan mengutamakan menu tinggi kalori-per-rupiah saat budget harian ketat.

#### 3. Status Kesehatan Keuangan & Mode Penyelamatan
- **`Aman`**: `SafeToSpend > 0`, `RemainingDailyToday >= 0`, dan `DailyFoodBudget >= MinimumHealthyMealThreshold` (default Rp20.000/hari, dapat disesuaikan).
- **`Waspada`**: `RemainingDailyToday < 0` (pengeluaran hari ini melewati plafon) **atau** `DailyFoodBudget` di bawah ambang nyaman (`< Rp20.000/hari` namun masih `>= Rp10.000/hari`).
- **`Kritis`**: `SafeToSpend > 0` namun `DailyFoodBudget < Rp10.000/hari` (perlu mode `Super Hemat` ketat dan menunda pengeluaran non-esensial).
- **`Defisit`**: `SafeToSpend <= 0` (uang operasional tidak cukup menutup kewajiban belum dibayar + target cadangan). Sistem mengunci saran ke mode penyelamatan: menyarankan penghentian pengeluaran non-esensial, meninjau penundaan target tabungan sementara, atau mencairkan sebagian dana darurat secara sadar melalui fitur transfer.

---

### D. Smart Food Recommendation

Fitur unggulan KosMate yang menghubungkan daya beli harian dengan kecukupan gizi anak kos.

**Parameter Penentu Rekomendasi:**
- Sisa `DailyFoodBudget` hari ini dan anggaran per slot waktu makan.
- Kondisi status keuangan (`Aman`, `Waspada`, `Kritis`, `Defisit`).
- Harga menu lokal (editable oleh user, dengan fallback ke `default_price`).
- Fasilitas memasak yang dimiliki user (`none`/beli jadi, `kettle`/pemanas air, `rice_cooker`, `stove`/kompor, `fridge`/kulkas).
- Preferensi dan pantangan makanan (`food_preferences`: halal, vegetarian, alergi seafood/kacang/telur, tingkat pedas, dll.).
- Riwayat makan (`meal_plans`) untuk menghindari menu monoton.

**Klasifikasi Kategori Menu (Dinamis terhadap Budget):**
1. **Super Hemat**: Menu darurat/ekonomis (mis. Rp5.000 – Rp10.000/porsi) dengan tetap menjaga asupan energi.
2. **Hemat**: Menu terjangkau seimbang (mis. Rp10.000 – Rp16.000/porsi).
3. **Normal**: Menu harian lengkap karbo + protein + sayur (mis. Rp16.000 – Rp25.000/porsi).
4. **Fleksibel**: Menu variatif bernutrisi tinggi saat budget longgar (`> Rp25.000/porsi`).

**Aturan Scoring & Anti-Monoton:**
- *Hard Filter:* `estimated_price <= available_slot_budget` (Rule #7), alat masak yang dibutuhkan tersedia di profil user, dan tidak mengandung tag pantangan/alergi user.
- *Variety Cooldown:* Menu yang sudah dikonsumsi/direncanakan dalam **2–3 hari terakhir** diberi penalti skor agar tidak muncul berulang kali.
- *Nutrition Guardrail:* Sistem memprioritaskan variasi protein dan sayur (`has_protein`, `has_vegetable`) sehingga makanan instan/rendah gizi (seperti mie instan polos) tidak direkomendasikan berturut-turut apabila masih ada menu bergizi dalam rentang budget yang sama.

**Informasi per Menu:**
- Nama makanan & kategori budget.
- Estimasi harga (dapat diedit & di-reset ke harga bawaan).
- Komposisi bahan (`ingredients`).
- Estimasi kalori & protein (jika tersedia).
- Cara membuat atau cara mendapatkan (`instructions`, termasuk opsi beli di warteg/kantin bila `preparation_type` = `beli`/`keduanya`).
- Alasan rekomendasi yang kontekstual (contoh: *"Masuk budget makan siang Rp12.000, tinggi protein, bisa dimasak dengan rice cooker, dan belum muncul dalam 4 hari terakhir"*).

---

### E. Daily & Weekly Meal Planner

Perencanaan makan harian terstruktur untuk:
- Sarapan (`breakfast`)
- Makan Siang (`lunch`)
- Makan Malam (`dinner`)
- Camilan (`snack` — opsional jika sisa budget memungkinkan)

**Fitur:**
- Generate rencana menu otomatis untuk hari ini atau 7 hari ke depan (*weekly planner*).
- Ganti menu (`swap`) per slot dengan alternatif yang tetap sesuai sisa budget hari itu; total estimasi biaya langsung ter-update.
- **2 Mode Pencatatan Konsumsi:**
  1. **Tandai Dimakan & Catat Pengeluaran**: Membuka form cepat dengan nominal default = `estimated_cost` (bisa diubah ke biaya aktual struk), memilih dompet sumber, otomatis membuat transaksi pengeluaran kategori *Makan & Minum*, menautkan `transaction_id` ke `meal_plans`, lalu menghitung ulang saldo & budget secara real-time.
  2. **Tandai Dimakan Tanpa Transaksi Baru**: Untuk kondisi bahan sudah dibeli sebelumnya / makan gratis / dibayari, mencatat status `consumed` dengan `actual_cost = 0` tanpa memotong saldo lagi.
- Bandingkan total estimasi meal plan vs pengeluaran makan aktual.
- Simpan menu favorit & tambah menu kustom user sendiri.

---

### F. Smart Spending Assistant

Asisten keuangan deterministik berbasis aturan nyata dari data SQLite (bukan pesan motivasi acak).

Contoh deteksi & pemicu pintar:
- *Overbudget Harian:* `"Pengeluaran hari ini sudah melewati batas harian sebesar Rp12.000. Budget esok hari disesuaikan menjadi Rp38.000/hari."`
- *Overbudget Makan:* `"Pengeluaran makan hari ini Rp32.000 (melebihi alokasi Rp25.000). Rekomendasi makan malam otomatis disesuaikan ke kategori Hemat."`
- *Peringatan Tagihan:* `"Tagihan Kos Bulan Ini (Rp750.000) jatuh tempo 3 hari lagi dan belum ditandai lunas."`
- *Lonjakan Pengeluaran:* `"Pengeluaran kategori Hiburan minggu ini naik 45% dibanding rata-rata minggu lalu."`
- *Prediksi Ketahanan Saldo (Estimasi):* `"Berdasarkan rata-rata pengeluaran 7 hari terakhir (Rp62.000/hari), saldo operasional diperkirakan bertahan 9 hari (Estimasi) sebelum periode berakhir 14 hari lagi."` *(Wajib diberi label **Estimasi** sesuai Rule #11)*.

---

### G. Reports & Analytics

Laporan komprehensif yang sepenuhnya berjalan offline dengan Chart.js:
- Ringkasan Harian, Mingguan, dan per Siklus Periode.
- Grafik tren Pemasukan vs Pengeluaran.
- Grafik komposisi Pengeluaran per Kategori (Doughnut/Bar chart).
- Grafik Realisasi Anggaran vs Batas Budget per Kategori.
- Statistik Makanan: rata-rata biaya makan/hari, estimasi vs aktual meal plan, dan distribusi kategori menu.
- Riwayat pertumbuhan Tabungan & Dana Darurat.
- Proyeksi sisa dana periode aktif (berlabel *Estimasi*).
- Export laporan periode ke format CSV / Backup JSON.

---

## 4. APPLICATION SCREENS & UX FLOW

### A. Onboarding Wizard (First-Run Experience)
Wajib diselesaikan saat pertama kali aplikasi dibuka agar setelah onboarding selesai aplikasi **tidak memakai data dummy keuangan sama sekali** (hanya master data kategori & katalog menu dasar):
1. **Profil & Siklus Keuangan**: Nama panggilan, tanggal gajian/uang kiriman, jenis siklus (`monthly`/`biweekly`/`weekly`), dan nominal pemasukan rutin.
2. **Setup Dompet & Saldo Awal Nyata**: Input dompet operasional aktif (mis. Tunai, Rekening Bank, E-Wallet) beserta saldo nyata saat ini, serta opsional dompet Tabungan/Dana Darurat.
3. **Kewajiban Rutin & Cadangan**: Input cepat tagihan wajib (Kos, Listrik, Internet) beserta tanggal jatuh tempo dan target tabungan/dana cadangan per periode.
4. **Preferensi Makan & Alat Masak**: Pilih fasilitas memasak yang dimiliki, rasio porsi budget makan (default 60%), serta alergi/pantangan makanan.

### B. Navigasi Utama (Dark Forest Green Bottom Bar + Center Elevated `+` FAB)
Mengadopsi referensi visual UI KosMate (4 ikon navigasi simetris di kiri & kanan + tombol aksi tengah `+` yang menonjol di atas bar + header ikon `≡` & `🔔`):

- **Top Header Bar:**
  - Kiri (`≡`): Menu drawer cepat untuk akses **Profil & Pengaturan**, Siklus Periode, Alat Masak & Preferensi Makan, Kategori, PIN Lock, Backup & Restore JSON, dan Export CSV.
  - Kanan (`🔔`): Panel **Smart Spending Assistant & Pengingat Tagihan** (dengan badge indikator peringatan aktif).
  - Sub-header halaman detail: tombol kembali bulat `<` + judul 2-baris.

- **Bottom Navigation Bar (2 Kiri + FAB Tengah `+` + 2 Kanan):**
  1. **Home**
     - Circular Budget Gauge utama (**Budget Aman Hari Ini** & *"tersedia dari ..."* `SafeToSpend`).
     - Ringkasan Saldo Operasional vs Tabungan/Darurat (terkunci) & Tagihan Belum Dibayar.
     - Grafik **Pengeluaran Bulanan** (*Capsule Bar Chart* gradien magenta) + tautan `Analisis Pengeluaran »`.
     - Kartu Rekomendasi Makan Terdekat & Alert Asisten Pintar.
  2. **Keuangan**
     - Segmen: *Transaksi*, *Dompet*, *Tagihan & Terencana*, *Tabungan*, *Anggaran Kategori*.
     - Tampilan detail kategori/dompet mengadopsi Circular Gauge + 2 tombol aksi bulat (`Tambah Pengeluaran` & `Edit Budget`) + daftar transaksi dengan filter `Urutkan`.
  3. **Tombol Tengah `(+)` (Center Elevated FAB)**
     - Quick-Add Bottom Sheet satu tangan (< 3 ketuk) untuk mencatat `Pengeluaran`, `Pemasukan`, dan `Transfer Antar-Dompet`.
  4. **Makanan**
     - Rekomendasi pintar sesuai sisa `DailyFoodBudget` hari ini.
     - Daily & Weekly Meal Planner (Sarapan, Makan Siang, Makan Malam, Camilan).
     - Katalog Menu & Edit Harga Lokal + Tambah Menu Kustom + Menu Favorit.
  5. **Analisis** (Laporan & Savings Synopsis)
     - Dropdown pemilih tampilan: *Spending Synopsis*, *Savings Synopsis*, dan *Analisis Makan & Budget*.
     - Pie Chart komposisi kategori pengeluaran dengan label persentase eksternal.
     - *Total Tabungan* & *Savings Snapshot* dengan filter status dan badge emas **`Target Tercapai`** (*Goal Achieved*).
     - Proyeksi ketahanan saldo (berlabel **Estimasi**) & Export CSV.

---

## 5. DATABASE DESIGN (SQLite)

Gunakan SQLite dengan `PRAGMA foreign_keys = ON;`.
Standar umum seluruh tabel:
- Primary key `id` bertipe `TEXT` (UUID v4).
- Nilai uang disimpan dalam `INTEGER` (Rupiah bulat) atau `REAL` jika dibutuhkan, konsisten menggunakan integer Rupiah untuk mencegah *floating-point rounding error*.
- Timestamp ISO-8601 UTC (`created_at`, `updated_at`, dan `deleted_at` untuk soft delete).
- Seluruh operasi yang mengubah saldo dompet harus dieksekusi di dalam `BEGIN TRANSACTION ... COMMIT`.

### Tabel Migrasi & Konfigurasi
#### `schema_migrations`
- `version` (INTEGER PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `applied_at` (TEXT NOT NULL)

#### `settings`
- `id` (TEXT PRIMARY KEY)
- `setting_key` (TEXT UNIQUE NOT NULL)
- `setting_value` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)

### Tabel Pengguna & Siklus Keuangan
#### `users`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `currency` (TEXT DEFAULT 'IDR')
- `monthly_income` (INTEGER DEFAULT 0)
- `income_day` (INTEGER DEFAULT 1)
- `budget_period` (TEXT DEFAULT 'monthly') -- 'monthly' | 'biweekly' | 'weekly'
- `food_budget_ratio` (REAL DEFAULT 0.60)
- `min_daily_food_warning` (INTEGER DEFAULT 20000)
- `reserve_target_amount` (INTEGER DEFAULT 0)
- `cooking_equipment` (TEXT DEFAULT '["none"]') -- JSON array
- `onboarding_completed` (INTEGER DEFAULT 0)
- `pin_hash` (TEXT NULL)
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)

#### `financial_periods`
- `id` (TEXT PRIMARY KEY)
- `start_date` (TEXT NOT NULL) -- YYYY-MM-DD
- `end_date` (TEXT NOT NULL)   -- YYYY-MM-DD
- `opening_operational_balance` (INTEGER NOT NULL DEFAULT 0)
- `expected_income` (INTEGER NOT NULL DEFAULT 0)
- `reserve_target` (INTEGER NOT NULL DEFAULT 0)
- `status` (TEXT NOT NULL DEFAULT 'active') -- 'active' | 'closed'
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)

### Tabel Keuangan Inti
#### `wallets`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `wallet_type` (TEXT NOT NULL) -- 'cash' | 'bank' | 'ewallet' | 'savings' | 'emergency'
- `balance` (INTEGER NOT NULL DEFAULT 0)
- `include_in_daily_budget` (INTEGER NOT NULL DEFAULT 1) -- 1=operasional, 0=terkunci
- `icon` (TEXT)
- `is_active` (INTEGER NOT NULL DEFAULT 1)
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)
- `deleted_at` (TEXT NULL)

#### `categories`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `type` (TEXT NOT NULL) -- 'income' | 'expense'
- `icon` (TEXT NOT NULL)
- `color` (TEXT NOT NULL)
- `is_default` (INTEGER NOT NULL DEFAULT 0)
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)
- `deleted_at` (TEXT NULL)

#### `transactions`
- `id` (TEXT PRIMARY KEY)
- `period_id` (TEXT NOT NULL REFERENCES financial_periods(id))
- `wallet_id` (TEXT NOT NULL REFERENCES wallets(id))
- `to_wallet_id` (TEXT NULL REFERENCES wallets(id)) -- Wajib terisi jika type='transfer'
- `category_id` (TEXT NULL REFERENCES categories(id)) -- Wajib untuk income/expense, NULL untuk transfer
- `recurring_expense_id` (TEXT NULL REFERENCES recurring_expenses(id))
- `type` (TEXT NOT NULL) -- 'income' | 'expense' | 'transfer'
- `amount` (INTEGER NOT NULL CHECK(amount > 0))
- `transaction_date` (TEXT NOT NULL) -- ISO datetime / YYYY-MM-DD HH:mm:ss
- `description` (TEXT)
- `is_unexpected` (INTEGER NOT NULL DEFAULT 0)
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)
- `deleted_at` (TEXT NULL)

#### `budgets`
- `id` (TEXT PRIMARY KEY)
- `period_id` (TEXT NULL REFERENCES financial_periods(id))
- `category_id` (TEXT NOT NULL REFERENCES categories(id))
- `amount` (INTEGER NOT NULL CHECK(amount >= 0))
- `period_type` (TEXT NOT NULL DEFAULT 'monthly')
- `start_date` (TEXT NOT NULL)
- `end_date` (TEXT NOT NULL)
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)
- `deleted_at` (TEXT NULL)

#### `recurring_expenses`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `amount` (INTEGER NOT NULL CHECK(amount > 0))
- `category_id` (TEXT NOT NULL REFERENCES categories(id))
- `default_wallet_id` (TEXT NULL REFERENCES wallets(id))
- `due_day` (INTEGER NOT NULL) -- 1-31 atau 1-7 untuk weekly
- `frequency` (TEXT NOT NULL DEFAULT 'monthly') -- 'weekly' | 'monthly' | 'yearly'
- `next_due_date` (TEXT NOT NULL) -- YYYY-MM-DD
- `last_paid_period_id` (TEXT NULL REFERENCES financial_periods(id))
- `last_paid_at` (TEXT NULL)
- `is_active` (INTEGER NOT NULL DEFAULT 1)
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)
- `deleted_at` (TEXT NULL)

#### `planned_expenses`
- `id` (TEXT PRIMARY KEY)
- `period_id` (TEXT NOT NULL REFERENCES financial_periods(id))
- `name` (TEXT NOT NULL)
- `amount` (INTEGER NOT NULL CHECK(amount > 0))
- `category_id` (TEXT NOT NULL REFERENCES categories(id))
- `planned_date` (TEXT NOT NULL)
- `status` (TEXT NOT NULL DEFAULT 'pending') -- 'pending' | 'paid' | 'cancelled'
- `transaction_id` (TEXT NULL REFERENCES transactions(id))
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)
- `deleted_at` (TEXT NULL)

#### `savings_goals`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `wallet_id` (TEXT NULL REFERENCES wallets(id))
- `target_amount` (INTEGER NOT NULL CHECK(target_amount > 0))
- `current_amount` (INTEGER NOT NULL DEFAULT 0)
- `monthly_allocation` (INTEGER NOT NULL DEFAULT 0)
- `target_date` (TEXT NULL)
- `is_emergency` (INTEGER NOT NULL DEFAULT 0)
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)
- `deleted_at` (TEXT NULL)

### Tabel Makanan & Meal Planner
#### `food_items`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `default_price` (INTEGER NOT NULL CHECK(default_price >= 0))
- `estimated_price` (INTEGER NOT NULL CHECK(estimated_price >= 0))
- `calories` (INTEGER NULL)
- `protein` (REAL NULL)
- `food_category` (TEXT NOT NULL) -- 'super_hemat' | 'hemat' | 'normal' | 'fleksibel'
- `preparation_type` (TEXT NOT NULL) -- 'beli' | 'masak' | 'keduanya'
- `required_equipment` (TEXT NOT NULL DEFAULT 'none') -- 'none' | 'kettle' | 'rice_cooker' | 'stove'
- `suitable_meal_types` (TEXT NOT NULL) -- JSON array: ['breakfast','lunch','dinner','snack']
- `ingredients` (TEXT NOT NULL DEFAULT '[]') -- JSON array bahan
- `instructions` (TEXT NOT NULL DEFAULT '') -- Cara masak / cara mendapatkan
- `tags` (TEXT NOT NULL DEFAULT '[]') -- JSON array: ['halal','high_protein','vegetarian','spicy']
- `has_protein` (INTEGER NOT NULL DEFAULT 0)
- `has_vegetable` (INTEGER NOT NULL DEFAULT 0)
- `is_favorite` (INTEGER NOT NULL DEFAULT 0)
- `is_custom` (INTEGER NOT NULL DEFAULT 0)
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)
- `deleted_at` (TEXT NULL)

#### `meal_plans`
- `id` (TEXT PRIMARY KEY)
- `meal_date` (TEXT NOT NULL) -- YYYY-MM-DD
- `meal_type` (TEXT NOT NULL) -- 'breakfast' | 'lunch' | 'dinner' | 'snack'
- `food_item_id` (TEXT NOT NULL REFERENCES food_items(id))
- `estimated_cost` (INTEGER NOT NULL DEFAULT 0)
- `actual_cost` (INTEGER NULL)
- `status` (TEXT NOT NULL DEFAULT 'planned') -- 'planned' | 'consumed' | 'skipped'
- `transaction_id` (TEXT NULL REFERENCES transactions(id))
- `notes` (TEXT NULL)
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)
- `deleted_at` (TEXT NULL)

#### `food_preferences`
- `id` (TEXT PRIMARY KEY)
- `preference_type` (TEXT NOT NULL) -- 'diet' | 'allergen' | 'dislike' | 'favorite_tag'
- `preference_value` (TEXT NOT NULL)
- `created_at` (TEXT NOT NULL)
- `updated_at` (TEXT NOT NULL)
- `deleted_at` (TEXT NULL)

### Indeks SQLite Wajib
- `CREATE INDEX idx_transactions_date ON transactions(transaction_date, deleted_at);`
- `CREATE INDEX idx_transactions_period_type ON transactions(period_id, type, deleted_at);`
- `CREATE INDEX idx_transactions_wallet ON transactions(wallet_id, to_wallet_id);`
- `CREATE INDEX idx_meal_plans_date ON meal_plans(meal_date, meal_type, deleted_at);`
- `CREATE INDEX idx_recurring_due ON recurring_expenses(is_active, next_due_date);`
- `CREATE INDEX idx_planned_period ON planned_expenses(period_id, status);`

---

## 6. SMART SYSTEM LOGIC

Seluruh modul saling terhubung secara reaktif:

1. Pengguna menyelesaikan onboarding: memasukkan siklus pemasukan, dompet + saldo awal nyata, kewajiban rutin (kos/listrik/internet), target cadangan, alat masak, dan preferensi makanan.
2. Sistem membuat/mengaktifkan baris `financial_periods` dan mencatat `opening_operational_balance`.
3. Smart Budget Calculator menghitung `AvailableOperationalCash`, `UnpaidObligations`, `RemainingReserveAllocation`, `SafeToSpend`, `BaseDailyBudgetToday`, dan `DailyFoodBudget`.
4. Smart Food Recommendation memfilter `food_items` berdasarkan sisa `DailyFoodBudget` per slot waktu makan, fasilitas memasak, pantangan, nilai gizi, serta penalti menu berulang.
5. Saat pengguna memilih menu di Meal Planner dan menandai **"Dimakan & Catat Pengeluaran"**:
   - Dalam satu transaksi SQLite atomik, sistem membuat baris `transactions` (`expense`), mengurangi `wallets.balance`, dan mengikat `transaction_id` ke `meal_plans`.
6. Saat pengguna membayar tagihan rutin:
   - Dalam satu transaksi SQLite atomik, sistem membuat transaksi `expense` dengan `recurring_expense_id`, memotong saldo dompet, memperbarui `last_paid_period_id` dan memajukan `next_due_date` ke siklus berikutnya.
7. Saat pengguna melakukan transfer ke dompet `savings`/`emergency`:
   - Saldo dompet operasional berkurang, saldo dompet tujuan bertambah, total income/expense tetap tidak berubah, dan `RemainingReserveAllocation` menyesuaikan tanpa *double deduction*.
8. Setiap mutasi memicu `BudgetEngine.recalculate()` sehingga Dashboard, Status Kesehatan Keuangan, Smart Spending Assistant, dan Rekomendasi Menu berikutnya langsung diperbarui seketika.

---

## 7. USER EXPERIENCE & KOSMATE DESIGN SYSTEM

Menggunakan desain UI referensi KosMate (**Clean Cream & Forest Green Fintech Style**) yang ringan, minimalis, dan nyaman dioperasikan dengan satu tangan:

**Konsep Desain:**
- Modern, clean, airy, mobile-first, light cream theme dengan kontras hijau tua yang tegas dan elegan.
- Safe-area aware (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`) untuk layar Android berponi/gesture bar.
- Navigasi utama berupa bottom bar hijau tua (`#073B2E`) dengan tombol `+` besar menonjol di tengah berbingkai halo krem.

**Palet Warna & Komponen Visual:**
- Background Utama: `#F6F8F5` (Soft Warm Cream / Off-White)
- Surface / Cards: `#FFFFFF` dengan border halus `#E3E9E4`
- Primary Deep Forest Green: `#073B2E` (Bottom Nav Bar, active donut ring, nominal utama, tombol aksi bulat)
- Secondary Emerald Green: `#0F7B5B` (Center `+` FAB, top menu/bell icons, Total Savings display, action links)
- Soft Ring Track: `#E3EBE7` (track latar circular progress ring)
- Gold Badge Accent: `#C89D3E` (badge `Target Tercapai` / `Goal Achieved`)
- Chart Accents: Gradien vertikal Magenta-Rose (`#D91B5C` → `#F9D5E1`) untuk bar chart pengeluaran bulanan; palet cerah terpisah untuk pie chart kategori.
- Text Primary: `#073B2E` / `#0F172A` | Text Muted: `#64748B`
- Warning: `#F59E0B` (Bg `#FEF3C7`) | Danger: `#DC2626` (Bg `#FEE2E2`)
- Tipografi: System Sans-Serif modern (`Plus Jakarta Sans` / system UI stack) dengan `font-variant-numeric: tabular-nums` untuk seluruh angka nominal.

**Prinsip UX:**
- Format mata uang otomatis Indonesia (`Rp 15.000`) + *quick nominal chips* (`+5rb`, `+10rb`, `+15rb`, `+25rb`, `+50rb`) untuk mempercepat input.
- Input transaksi cepat maksimal 3 langkah via FAB (`+`) Bottom Sheet.
- Konfirmasi penghapusan dengan penjelasan dampak ke saldo/dompet.
- **Zero Dummy Data Policy:** Master data kategori dan katalog menu makanan dasar terisi saat instalasi, tetapi **tidak ada saldo palsu atau transaksi fiktif** setelah onboarding selesai.

---

## 8. DEVELOPMENT PHASES

### Phase 1 — Foundation & Core Architecture
- Inisialisasi proyek **Vite + Vanilla ES Modules + KosMate Design System CSS**.
- Integrasi **Capacitor** (`@capacitor/core`, `@capacitor/android`) & plugin SQLite (`@capacitor-community/sqlite` + `jeep-sqlite` web fallback).
- Struktur folder modular:
  - `src/db/` (koneksi SQLite, `migrations/`, `seeders/` untuk kategori & master makanan)
  - `src/repositories/` (akses data per tabel dengan query terparametrisasi & transaksi atomik)
  - `src/services/` (`BudgetEngine`, `FoodRecommender`, `SpendingAssistant`, `BackupService`, `PeriodService`)
  - `src/store/` (reactive app state)
  - `src/components/` (BottomNav, QuickAddSheet, MetricCard, ChartWrapper, Toast/Modal)
  - `src/pages/` (Onboarding, Home, Keuangan, Makanan, Laporan, Profil)
- Implementasi Onboarding Wizard & halaman Profil dasar.

### Phase 2 — Financial Management
- Manajemen multi-dompet (`cash`, `bank`, `ewallet`, `savings`, `emergency`).
- Pencatatan transaksi atomik (`income`, `expense`, `transfer`) + edit/hapus dengan rollback saldo otomatis.
- Manajemen kategori & anggaran per kategori (`budgets`).
- Manajemen tagihan rutin (`recurring_expenses`) dengan tombol "Bayar Tagihan" anti-duplikasi & pengeluaran terencana (`planned_expenses`).
- Dashboard Keuangan real-time & manajemen pergantian `financial_periods`.

### Phase 3 — Smart Budget & Spending Assistant
- Implementasi penuh `BudgetEngine` (AvailableOperationalCash, UnpaidObligations, RemainingReserveAllocation, SafeToSpend, BaseDailyBudgetToday, DailyFoodBudget, Status Kesehatan, dan Mode Defisit).
- Implementasi `SpendingAssistant` berbasis aturan aktual + prediksi ketahanan saldo (*Runway*) berlabel **Estimasi**.
- Notifikasi lokal pengingat tagihan jatuh tempo.

### Phase 4 — Smart Food Recommendation & Meal Planner
- Katalog master menu anak kos Indonesia (35–50+ menu realistis mencakup kategori `super_hemat`, `hemat`, `normal`, `fleksibel`, lengkap dengan estimasi harga, kalori, protein, bahan, cara buat/beli, dan alat masak).
- Fitur edit harga lokal (dengan opsi reset ke `default_price`) + tambah menu kustom + favorit.
- Implementasi algoritma `FoodRecommender` (budget filter, equipment filter, preference filter, cooldown anti-monoton, guardrail gizi).
- Daily & Weekly Meal Planner + aksi "Tandai Dimakan & Catat Pengeluaran" yang tertaut langsung ke `transactions`.

### Phase 5 — Reports & Analytics
- Grafik interaktif offline dengan Chart.js (Tren Pemasukan vs Pengeluaran, Breakdown Kategori, Realisasi Budget, Tren Biaya Makan).
- Evaluasi estimasi vs pengeluaran makan aktual & riwayat pertumbuhan tabungan.
- Export laporan CSV.

### Phase 6 — Optimization, Security, Backup & APK Build
- Export & Import Backup JSON terstruktur (lengkap dengan validasi versi skema & *atomic restore*).
- Opsional PIN Lock layar pembuka aplikasi (`pin_hash` lokal).
- Unit test untuk `BudgetEngine`, `TransactionRepository`, `RecurringService`, dan `FoodRecommender` (menggunakan Vitest / Node test runner).
- Konfigurasi GitHub Actions `.github/workflows/android-apk.yml` untuk build APK otomatis (serta panduan build Android Studio lokal).
- Pengujian end-to-end offline di web & Android APK.

---

## 9. IMPORTANT BUSINESS RULES

1. Saldo dompet tidak boleh berubah tanpa catatan transaksi yang sah (kecuali saldo awal saat pembuatan dompet di onboarding/awal setup).
2. Transfer antar-dompet tidak dihitung sebagai pemasukan atau pengeluaran.
3. Transaksi yang diedit atau dihapus wajib memperbarui saldo dompet terkait, anggaran, dan laporan secara atomik.
4. Pengeluaran rutin tidak boleh terduplikasi dalam periode tagihan yang sama (`last_paid_period_id` & `recurring_expense_id`).
5. Perhitungan `SafeToSpend` wajib memperhitungkan seluruh tagihan rutin dan pengeluaran terencana periode aktif yang berstatus belum dibayar.
6. Saldo pada dompet bertipe `savings` dan `emergency` (`include_in_daily_budget = 0`) tidak boleh otomatis dianggap sebagai uang belanja harian.
7. Rekomendasi makanan tidak boleh melebihi sisa budget makan harian yang tersedia (kecuali ditampilkan sebagai mode peringatan jika tidak ada opsi lain di kondisi defisit).
8. Harga makanan wajib dapat diedit oleh pengguna sesuai harga daerahnya tanpa merusak `default_price`.
9. Semua kalkulasi keuangan menggunakan nilai transaksi aktual yang tercatat di database.
10. Aplikasi wajib tetap berfungsi penuh tanpa koneksi internet.
11. Semua angka proyeksi dan prediksi ketahanan saldo wajib diberi label **Estimasi**, bukan kepastian.
12. Pergantian atau perubahan siklus periode keuangan tidak boleh menghapus atau merusak riwayat transaksi sebelumnya.
13. Seluruh mutasi keuangan (saldo dompet, insert/update/delete transaksi, pelunasan tagihan, konversi meal plan ke transaksi) wajib dijalankan dalam SQLite transaction (`BEGIN ... COMMIT` / `ROLLBACK`).
14. Seed awal aplikasi hanya boleh mengisi master data (kategori standar dan katalog makanan dasar), tidak boleh menyisipkan transaksi atau saldo dummy setelah onboarding selesai.

---

## 10. MVP ACCEPTANCE CRITERIA

Versi pertama dianggap berhasil apabila seluruh skenario berikut lulus pengujian:

- Pengguna dapat menyelesaikan onboarding tanpa data dummy tersisa dan siklus periode keuangan aktif terbentuk otomatis.
- Pengguna dapat menambah, mengedit, dan menghapus pemasukan, pengeluaran, serta transfer antar-dompet dengan pembaruan saldo instan yang akurat.
- Transfer ke dompet Tabungan/Dana Darurat memindahkan saldo dengan benar tanpa mengubah total pemasukan/pengeluaran dan tanpa *double deduction* pada `RemainingReserveAllocation`.
- Tagihan rutin diperhitungkan sebagai kewajiban belum dibayar sampai user menandainya lunas (1x per periode, anti-duplikasi).
- Budget harian dan alokasi budget makan dihitung dinamis berdasarkan kondisi aktual dan otomatis terhitung ulang saat ada transaksi.
- Pengguna mendapatkan rekomendasi makanan yang sesuai budget makan, alat masak, pantangan, serta tidak monoton.
- Harga makanan lokal dapat diedit (dan di-reset), serta pencatatan pengeluaran makan dari Meal Planner otomatis tercatat sebagai transaksi dan memotong saldo dompet.
- Dashboard dan Laporan Chart.js menampilkan kondisi keuangan aktual tanpa koneksi internet.
- Backup JSON dan Restore berfungsi utuh mengembalikan seluruh data lokal.
- Data tetap tersimpan persisten setelah aplikasi ditutup/dibuka ulang, dan proyek dapat di-build menjadi APK Android melalui Capacitor.

---

## 11. FINAL DEVELOPMENT PRINCIPLE

KosMate bukan aplikasi yang memaksa pengguna hidup pelit atau menyiksa diri.

KosMate harus membantu pengguna mengambil keputusan keuangan yang masuk akal, tenang, dan realistis berdasarkan kondisi nyata di dompetnya.

**Prioritas sistem:**
1. Kebutuhan hidup dasar terpenuhi.
2. Makan cukup, terjangkau, dan tetap bergizi variatif.
3. Kewajiban rutin (kos & tagihan) aman terbayar tepat waktu.
4. Pengeluaran harian terkendali secara sadar.
5. Tabungan & dana darurat bertumbuh tanpa mengganggu uang makan.
6. Pengguna tidak kehabisan uang sebelum pemasukan berikutnya.

**Build smart, spend wisely, eat well.**
