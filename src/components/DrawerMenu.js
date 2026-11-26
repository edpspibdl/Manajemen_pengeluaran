import { iconSvg } from './Icons.js';
import { esc } from '../utils/dom.js';
import { appStore } from '../store/appStore.js';
import { exportBackupJson, exportTextFile } from '../services/BackupService.js';
import { exportTransactionsCsv } from '../services/ReportService.js';
import { toDateString } from '../utils/date.js';
import { showToast } from './Modal.js';
import { openQuickAddSheet } from './QuickAddSheet.js';
import { openLogFoodSheet } from './LogFoodSheet.js';

export function openDrawerMenu() {
  const existing = document.getElementById('kosmate-drawer');
  if (existing) existing.remove();

  const { user, summary } = appStore.state;
  const drawer = document.createElement('div');
  drawer.id = 'kosmate-drawer';
  drawer.className = 'drawer-backdrop';
  drawer.innerHTML = `
    <div class="drawer-panel">
      <div style="display:flex;align-items:center;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--border-subtle);margin-bottom:14px">
        <div style="width:44px;height:44px;border-radius:14px;background:var(--forest-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px">
          ${esc((user?.name || 'K').slice(0, 1).toUpperCase())}
        </div>
        <div>
          <div style="font-weight:800;color:var(--forest-dark);font-size:16px">${esc(user?.name || 'KosMate')}</div>
          <div style="font-size:12px;color:var(--text-muted)">Status: ${esc(summary?.healthStatus || 'Aman')}</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;flex:1">
        <button class="btn btn--primary" style="justify-content:flex-start" data-drawer-quick="expense">
          ${iconSvg('plus', 18)} Tambah Pengeluaran
        </button>
        <button class="btn btn--emerald" style="justify-content:flex-start" data-drawer-quick="food">
          ${iconSvg('utensils', 18)} Input Beli Makan
        </button>
        <button class="btn btn--soft" style="justify-content:flex-start" data-drawer-quick="income">
          ${iconSvg('wallet', 18)} Tambah Pemasukan
        </button>
        <div style="border-top:1px solid var(--border-subtle);margin:4px 0"></div>
        <button class="btn btn--soft" style="justify-content:flex-start" data-drawer-nav="profil">
          ${iconSvg('user', 18)} Profil &amp; Pengaturan
        </button>
        <button class="btn btn--soft" style="justify-content:flex-start" data-drawer-keu="tagihan">
          ${iconSvg('bellOutline', 18)} Tagihan Rutin &amp; Terencana
        </button>
        <button class="btn btn--soft" style="justify-content:flex-start" data-drawer-food="katalog">
          ${iconSvg('utensils', 18)} Edit Harga Makanan Lokal
        </button>
        <button class="btn btn--soft" style="justify-content:flex-start" data-drawer-action="backup">
          ${iconSvg('download', 18)} Backup Data (JSON)
        </button>
        <button class="btn btn--soft" style="justify-content:flex-start" data-drawer-action="csv">
          ${iconSvg('upload', 18)} Export Laporan (CSV)
        </button>
      </div>

      <div style="font-size:11.5px;color:var(--text-muted);padding-top:14px;border-top:1px solid var(--border-subtle)">
        KosMate v1.0 • Offline-First SQLite
      </div>
    </div>
  `;

  const close = () => drawer.remove();
  drawer.addEventListener('click', (e) => {
    if (e.target === drawer) close();
  });

  drawer.querySelector('[data-drawer-quick="expense"]').addEventListener('click', () => {
    close();
    openQuickAddSheet({ defaultType: 'expense' });
  });
  drawer.querySelector('[data-drawer-quick="food"]').addEventListener('click', () => {
    close();
    openLogFoodSheet();
  });
  drawer.querySelector('[data-drawer-quick="income"]').addEventListener('click', () => {
    close();
    openQuickAddSheet({ defaultType: 'income' });
  });

  drawer.querySelector('[data-drawer-nav="profil"]').addEventListener('click', () => {
    close();
    appStore.setState({ activeTab: 'profil', subView: null });
  });

  drawer.querySelector('[data-drawer-keu="tagihan"]').addEventListener('click', () => {
    close();
    appStore.setState({ activeTab: 'keuangan', subView: null, keuanganSegment: 'tagihan' });
  });

  drawer.querySelector('[data-drawer-food="katalog"]').addEventListener('click', () => {
    close();
    appStore.setState({ activeTab: 'makanan', subView: null, makananSegment: 'katalog' });
  });

  drawer.querySelector('[data-drawer-action="backup"]').addEventListener('click', async () => {
    try {
      const json = await exportBackupJson(appStore.db);
      await exportTextFile(`kosmate-backup-${toDateString()}.json`, json, 'application/json');
      showToast('Backup JSON berhasil diekspor.');
      close();
    } catch (err) {
      showToast(err.message || 'Gagal backup.', 'error');
    }
  });

  drawer.querySelector('[data-drawer-action="csv"]').addEventListener('click', async () => {
    try {
      const csv = await exportTransactionsCsv(appStore.db, summary?.period?.start_date, summary?.period?.end_date);
      await exportTextFile(`kosmate-laporan-${toDateString()}.csv`, csv, 'text/csv');
      showToast('Laporan CSV berhasil diekspor.');
      close();
    } catch (err) {
      showToast(err.message || 'Gagal export CSV.', 'error');
    }
  });

  document.body.appendChild(drawer);
}
