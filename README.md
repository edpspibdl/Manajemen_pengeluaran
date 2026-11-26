# KosMate — Personal Finance & Meal Planner

Aplikasi mobile **offline-first** berbasis **Vite + Vanilla ES Modules + Capacitor + SQLite** untuk membantu anak kos mengelola keuangan pribadi, menghitung budget harian realistis, memantau tagihan rutin, dan merencanakan menu makanan harian sesuai sisa uang.

## Fitur Utama

- **Onboarding Wizard 4 Langkah:** Setup siklus gajian/kiriman, dompet operasional & dompet tabungan/darurat, tagihan rutin, target cadangan, alat masak, dan pantangan makanan tanpa data dummy transaksi.
- **Smart Budget Calculator (`BudgetEngine`):**
  - Memisahkan saldo operasional (`cash`, `bank`, `ewallet`) dari dompet `savings`/`emergency` agar dana darurat tidak terhitung ganda.
  - Menghitung `SafeToSpend = AvailableOperationalCash - UnpaidObligations - RemainingReserveAllocation`.
  - Menghitung budget harian dinamis (*rolling*) dan alokasi `DailyFoodBudget` per slot waktu makan (Sarapan, Siang, Malam, Camilan).
- **Keuangan Lengkap & Atomik:** Multi-dompet, transfer antar-dompet (non-income/expense), tagihan rutin anti-duplikasi, pengeluaran terencana, anggaran kategori, dan target tabungan dengan badge *Target Tercapai*.
- **Smart Food Recommendation & Meal Planner:** 40+ menu anak kos (Super Hemat, Hemat, Normal, Fleksibel), filter alat masak & pantangan, anti-monoton, edit harga lokal + reset default, planner harian/7 hari, serta catat pengeluaran makan langsung ke transaksi.
- **Asisten Pintar & Analisis Offline:** Deteksi lonjakan belanja, pengingat tagihan, prediksi ketahanan saldo berlabel **Estimasi**, grafik *Chart.js* lokal, serta export CSV dan Backup/Restore JSON ber-checksum.

## Menjalankan di Browser (Dev / Preview)

```bash
npm install
npm test
npm run dev
```

Buka URL lokal Vite di browser (tampilan mobile-first otomatis terpusat). Database lokal berjalan dengan `sql.js` (WebAssembly SQLite) yang tersimpan persisten di IndexedDB.

## Build & Sinkronisasi Android (Capacitor)

1. Build aset web dan sinkronkan ke proyek Android:
   ```bash
   npm run cap:sync
   ```
2. **Build APK via Android Studio / Gradle lokal** (membutuhkan Android SDK):
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   Output APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
3. **Build APK otomatis via GitHub Actions:**
   Push ke branch `main`/`master` atau jalankan workflow `.github/workflows/android-apk.yml` untuk mengunduh artifact `kosmate-debug-apk`.
