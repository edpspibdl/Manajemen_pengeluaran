import { iconSvg } from '../components/Icons.js';
import { renderSubHeader } from '../components/TopBar.js';
import { confirmDialog, showToast } from '../components/Modal.js';
import { EQUIPMENT_LABELS, esc } from '../utils/dom.js';
import { parseAmountInput } from '../utils/currency.js';
import { hashPin } from '../utils/hash.js';
import { toDateString } from '../utils/date.js';
import { upsertUserProfile, updateUserPin } from '../repositories/userRepo.js';
import { createCategory, softDeleteCategory } from '../repositories/categoryRepo.js';
import { replaceFoodPreferences } from '../repositories/foodRepo.js';
import { updateFinancialCycleSettings } from '../services/PeriodService.js';
import { exportBackupJson, exportTextFile, restoreBackupJson } from '../services/BackupService.js';
import { appStore } from '../store/appStore.js';

export function renderProfilPage(state) {
  const { user, categories, foodPreferences } = state;
  let equipment = ['none'];
  try {
    equipment = JSON.parse(user?.cooking_equipment || '["none"]');
  } catch {
    equipment = ['none'];
  }

  const prefSet = new Set((foodPreferences || []).map((p) => `${p.preference_type}:${p.preference_value}`));
  const customCategories = (categories || []).filter((c) => c.is_default === 0);

  return `
    <div class="page-content">
      ${renderSubHeader({ eyebrow: 'Pengaturan', title: 'Profil & Preferensi', backAction: 'go-home' })}

      <div class="card">
        <h3 class="section-head__title" style="font-size:16px;margin-bottom:10px">Siklus Keuangan &amp; Target</h3>
        <div class="field">
          <label class="field__label">Nama Panggilan</label>
          <input id="pf-name" class="input" value="${esc(user?.name || '')}" />
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="field__label">Siklus Periode</label>
            <select id="pf-period" class="select">
              <option value="monthly" ${user?.budget_period === 'monthly' ? 'selected' : ''}>Bulanan</option>
              <option value="biweekly" ${user?.budget_period === 'biweekly' ? 'selected' : ''}>2 Mingguan</option>
              <option value="weekly" ${user?.budget_period === 'weekly' ? 'selected' : ''}>Mingguan</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label">Tanggal Pemasukan</label>
            <input id="pf-day" class="input tabular-nums" type="number" min="1" max="31" value="${user?.income_day || 1}" />
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="field__label">Pemasukan Rutin (Rp)</label>
            <input id="pf-income" class="input tabular-nums" type="tel" value="${(user?.monthly_income || 0).toLocaleString('id-ID')}" />
          </div>
          <div class="field">
            <label class="field__label">Target Cadangan (Rp)</label>
            <input id="pf-reserve" class="input tabular-nums" type="tel" value="${(user?.reserve_target_amount || 0).toLocaleString('id-ID')}" />
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="field__label">Target Makan / Periode (Rp)</label>
            <input id="pf-food-budget" class="input tabular-nums" type="tel" value="${(user?.monthly_food_budget || 0).toLocaleString('id-ID')}" placeholder="300000" />
          </div>
          <div class="field">
            <label class="field__label">Makan Enak / Minggu</label>
            <input id="pf-treat-week" class="input tabular-nums" type="number" min="0" max="7" value="${user?.treat_meals_per_week ?? 3}" />
          </div>
        </div>
        <div class="field">
          <label class="field__label">Target Kalori Minimal / Hari (Anti-Turun BB)</label>
          <input id="pf-min-cal" class="input tabular-nums" type="number" min="1200" max="3500" step="50" value="${user?.min_daily_calories ?? 1900}" />
        </div>
        <div class="field">
          <label class="field__label">Porsi Budget Makan (<span id="pf-ratio-lbl">${Math.round((user?.food_budget_ratio ?? 0.6) * 100)}</span>% bila target tetap = 0)</label>
          <input id="pf-ratio" type="range" min="30" max="85" step="5" value="${Math.round((user?.food_budget_ratio ?? 0.6) * 100)}" style="width:100%;accent-color:var(--emerald)" />
        </div>
        <button class="btn btn--primary btn--full" id="pf-save-finance">Simpan Pengaturan Keuangan</button>
      </div>

      <details class="card">
        <summary style="font-weight:800;font-size:15.5px;color:var(--forest-dark);cursor:pointer">Fasilitas Masak &amp; Pantangan</summary>
        <div style="margin-top:12px">
          <div class="field">
            <label class="field__label">Alat Masak di Kos</label>
            <div class="chip-row">
              ${Object.entries(EQUIPMENT_LABELS)
                .map(
                  ([k, lbl]) =>
                    `<button class="chip ${equipment.includes(k) ? 'chip--active' : ''}" data-pf-eq="${k}">${esc(lbl)}</button>`
                )
                .join('')}
            </div>
          </div>
          <div class="field" style="margin-bottom:0">
            <label class="field__label">Preferensi &amp; Alergi</label>
            <div class="chip-row">
              <button class="chip ${prefSet.has('diet:halal') ? 'chip--active' : ''}" data-pf-pref="diet:halal">Halal</button>
              <button class="chip ${prefSet.has('diet:vegetarian') ? 'chip--active' : ''}" data-pf-pref="diet:vegetarian">Vegetarian</button>
              <button class="chip ${prefSet.has('diet:no_spicy') ? 'chip--active' : ''}" data-pf-pref="diet:no_spicy">Tidak Pedas</button>
              <button class="chip ${prefSet.has('allergen:seafood') ? 'chip--active' : ''}" data-pf-pref="allergen:seafood">Alergi Seafood</button>
            </div>
          </div>
        </div>
      </details>

      <details class="card">
        <summary style="font-weight:800;font-size:15.5px;color:var(--forest-dark);cursor:pointer">Kategori Kustom</summary>
        <div style="margin-top:12px">
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <input id="pf-new-cat" class="input" placeholder="Nama kategori baru..." />
            <button class="btn btn--emerald btn--sm" id="pf-add-cat">Tambah</button>
          </div>
          ${
            customCategories.length === 0
              ? '<div style="font-size:12.5px;color:var(--text-muted)">Belum ada kategori kustom.</div>'
              : customCategories
                  .map(
                    (c) => `
                    <div class="list-row">
                      <span>${esc(c.name)} (${c.type === 'income' ? 'Pemasukan' : 'Pengeluaran'})</span>
                      <button class="btn btn--soft btn--sm" data-del-cat="${c.id}" style="color:var(--danger)">${iconSvg('trash', 14)}</button>
                    </div>`
                  )
                  .join('')
          }
        </div>
      </details>

      <details class="card">
        <summary style="font-weight:800;font-size:15.5px;color:var(--forest-dark);cursor:pointer">Keamanan PIN &amp; Backup Data</summary>
        <div style="margin-top:12px">
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <input id="pf-pin" class="input tabular-nums" type="password" inputmode="numeric" maxlength="4" placeholder="PIN 4 digit baru" />
            <button class="btn btn--soft btn--sm" id="pf-set-pin">${user?.pin_hash ? 'Ubah PIN' : 'Aktifkan PIN'}</button>
            ${user?.pin_hash ? '<button class="btn btn--danger btn--sm" id="pf-clear-pin">Hapus</button>' : ''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn--emerald btn--sm" id="pf-backup">${iconSvg('download', 15)} Backup JSON</button>
            <label class="btn btn--soft btn--sm" style="cursor:pointer">
              ${iconSvg('upload', 15)} Restore JSON
              <input type="file" id="pf-restore-input" accept=".json,application/json" style="display:none" />
            </label>
            <button class="btn btn--danger btn--sm" id="pf-reset-all">Reset Data</button>
          </div>
        </div>
      </details>
    </div>
  `;
}

export function bindProfilHandlers(container) {
  const { state, db } = appStore;
  const user = state.user;

  container.querySelector('[data-action="go-home"]')?.addEventListener('click', () => {
    appStore.setState({ activeTab: 'home', subView: null });
  });

  const ratioInput = container.querySelector('#pf-ratio');
  const ratioLbl = container.querySelector('#pf-ratio-lbl');
  ratioInput?.addEventListener('input', () => {
    if (ratioLbl) ratioLbl.textContent = ratioInput.value;
  });

  container.querySelector('#pf-save-finance')?.addEventListener('click', async () => {
    try {
      const foodBudgetVal = parseAmountInput(container.querySelector('#pf-food-budget').value);
      await upsertUserProfile(db, { name: container.querySelector('#pf-name').value.trim() || 'Anak Kos' });
      await updateFinancialCycleSettings(db, {
        budgetPeriod: container.querySelector('#pf-period').value,
        incomeDay: Number(container.querySelector('#pf-day').value) || 1,
        monthlyIncome: parseAmountInput(container.querySelector('#pf-income').value),
        reserveTargetAmount: parseAmountInput(container.querySelector('#pf-reserve').value),
        foodBudgetMode: foodBudgetVal > 0 ? 'fixed' : 'ratio',
        monthlyFoodBudget: foodBudgetVal,
        treatMealsPerWeek: Number(container.querySelector('#pf-treat-week').value) || 0,
        minDailyCalories: Number(container.querySelector('#pf-min-cal').value) || 1900,
        foodBudgetRatio: Number(ratioInput.value) / 100
      });
      await appStore.refresh();
      showToast('Pengaturan keuangan & target makan disimpan.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelectorAll('[data-pf-eq]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      let current = ['none'];
      try {
        current = JSON.parse(user?.cooking_equipment || '["none"]');
      } catch {
        current = ['none'];
      }
      const val = btn.getAttribute('data-pf-eq');
      const next = current.includes(val) ? current.filter((x) => x !== val) : [...current, val];
      await upsertUserProfile(db, { cooking_equipment: next.length ? next : ['none'] });
      await appStore.refresh();
      showToast('Fasilitas memasak diperbarui.');
    });
  });

  container.querySelectorAll('[data-pf-pref]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const [preferenceType, preferenceValue] = btn.getAttribute('data-pf-pref').split(':');
      const current = (state.foodPreferences || []).map((p) => ({
        preferenceType: p.preference_type,
        preferenceValue: p.preference_value
      }));
      const exists = current.some((p) => p.preferenceType === preferenceType && p.preferenceValue === preferenceValue);
      const next = exists
        ? current.filter((p) => !(p.preferenceType === preferenceType && p.preferenceValue === preferenceValue))
        : [...current, { preferenceType, preferenceValue }];
      await replaceFoodPreferences(db, next);
      await appStore.refresh();
      showToast('Preferensi makanan diperbarui.');
    });
  });

  container.querySelector('#pf-add-cat')?.addEventListener('click', async () => {
    const name = container.querySelector('#pf-new-cat').value;
    if (!name.trim()) return showToast('Masukkan nama kategori.', 'error');
    await createCategory(db, { name, type: 'expense', icon: 'tag', color: '#0F7B5B' });
    await appStore.refresh();
    showToast('Kategori kustom ditambahkan.');
  });

  container.querySelectorAll('[data-del-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await softDeleteCategory(db, btn.getAttribute('data-del-cat'));
        await appStore.refresh();
        showToast('Kategori dihapus.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  container.querySelector('#pf-set-pin')?.addEventListener('click', async () => {
    const raw = container.querySelector('#pf-pin').value.trim();
    if (!/^\d{4}$/.test(raw)) {
      return showToast('PIN harus tepat 4 digit angka.', 'error');
    }
    const hashed = await hashPin(raw);
    await updateUserPin(db, hashed);
    await appStore.refresh();
    showToast('PIN keamanan diaktifkan.');
  });

  container.querySelector('#pf-clear-pin')?.addEventListener('click', async () => {
    await updateUserPin(db, null);
    await appStore.refresh();
    showToast('PIN keamanan dinonaktifkan.');
  });

  container.querySelector('#pf-backup')?.addEventListener('click', async () => {
    const json = await exportBackupJson(db);
    await exportTextFile(`kosmate-backup-${toDateString()}.json`, json, 'application/json');
    showToast('Backup JSON berhasil diekspor.');
  });

  container.querySelector('#pf-restore-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = await confirmDialog({
      title: 'Restore Data Backup?',
      message: 'Data saat ini akan digantikan seluruhnya dengan isi file backup JSON.',
      confirmLabel: 'Restore Sekarang'
    });
    if (!ok) return;
    try {
      const text = await file.text();
      await restoreBackupJson(db, text);
      await appStore.refresh();
      showToast('Backup berhasil dipulihkan!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelector('#pf-reset-all')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Reset Semua Data?',
      message: 'Semua transaksi, dompet, tagihan, dan pengaturan akan dihapus dan kembali ke onboarding awal.',
      confirmLabel: 'Reset Data',
      danger: true
    });
    if (!ok) return;
    await db.resetAllData();
    await appStore.refresh({ activeTab: 'home', subView: null, lockedByPin: false });
    showToast('Aplikasi di-reset ke kondisi awal.');
  });
}
