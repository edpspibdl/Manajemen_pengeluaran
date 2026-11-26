import { esc, MEAL_TYPE_LABELS } from '../utils/dom.js';
import { formatIDR, parseAmountInput } from '../utils/currency.js';
import { toDateString, toDateTimeString } from '../utils/date.js';
import { createTransaction } from '../repositories/transactionRepo.js';
import { appStore } from '../store/appStore.js';
import { openOverlay, showToast } from './Modal.js';

const CALORIE_PRESETS = [
  { label: 'Ringan (~350)', cal: 350, prot: 10 },
  { label: 'Sedang (~550)', cal: 550, prot: 18 },
  { label: 'Kenyang (~750)', cal: 750, prot: 26 }
];

/**
 * Clean, fast Bottom Sheet for logging manual food purchases.
 * @param {{ defaultSlot?: 'breakfast'|'lunch'|'dinner'|'snack', defaultTreat?: boolean }} [opts]
 */
export function openLogFoodSheet(opts = {}) {
  const { state, db } = appStore;
  const opWallets = (state.wallets || []).filter((w) => w.include_in_daily_budget === 1);
  const wallets = opWallets.length > 0 ? opWallets : state.wallets || [];
  if (wallets.length === 0) {
    showToast('Tambahkan dompet terlebih dahulu.', 'error');
    return;
  }

  const hour = new Date().getHours();
  const autoSlot = hour < 10 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 21 ? 'dinner' : 'snack';

  let mealSlot = opts.defaultSlot || autoSlot;
  let foodName = '';
  let amount = 0;
  let calories = 550;
  let protein = 18;
  let walletId = wallets[0].id;
  let isTreatMeal = Boolean(opts.defaultTreat ?? state.todayTreatMode);

  const summary = state.summary;

  openOverlay('', {
    onMount: (backdrop, close) => {
      const renderSheet = () => {
        backdrop.innerHTML = `
          <div class="sheet">
            <div class="sheet__handle"></div>
            <div class="section-head" style="margin-bottom:10px">
              <h3 style="margin:0;color:var(--forest-dark);font-size:18px">Catat Beli Makan</h3>
              <button class="btn btn--soft btn--sm" data-close-lf>Tutup</button>
            </div>

            <div class="field">
              <label class="field__label">Makan Apa?</label>
              <input id="lf-name" class="input" type="text" value="${esc(foodName)}" placeholder="Mis. Nasi Padang / Telur + Nasi" />
            </div>

            <div class="field">
              <label class="field__label">Berapa Rupiah?</label>
              <input id="lf-amount" class="input input--hero tabular-nums" type="tel" inputmode="numeric" value="${amount > 0 ? amount.toLocaleString('id-ID') : ''}" placeholder="0" />
              <div class="chip-row" style="margin-top:8px;justify-content:center">
                ${[5000, 8000, 10000, 15000, 20000]
                  .map((v) => `<button type="button" class="chip" data-lf-add="${v}">+${v / 1000}rb</button>`)
                  .join('')}
              </div>
            </div>

            <div class="grid-2" style="margin-bottom:12px">
              <div class="field" style="margin-bottom:0">
                <label class="field__label">Waktu Makan</label>
                <select id="lf-slot" class="select">
                  ${Object.entries(MEAL_TYPE_LABELS)
                    .map(([k, lbl]) => `<option value="${k}" ${k === mealSlot ? 'selected' : ''}>${lbl}</option>`)
                    .join('')}
                </select>
              </div>
              <div class="field" style="margin-bottom:0">
                <label class="field__label">Dompet</label>
                <select id="lf-wallet" class="select">
                  ${wallets
                    .map((w) => `<option value="${w.id}" ${w.id === walletId ? 'selected' : ''}>${esc(w.name)} (${formatIDR(w.balance)})</option>`)
                    .join('')}
                </select>
              </div>
            </div>

            <div class="field">
              <label class="field__label">Porsi Kalori (Jaga Berat Badan)</label>
              <div class="chip-row">
                ${CALORIE_PRESETS.map(
                  (p) =>
                    `<button type="button" class="chip ${calories === p.cal ? 'chip--active' : ''}" data-cal-preset="${p.cal}" data-prot-preset="${p.prot}">${p.label}</button>`
                ).join('')}
              </div>
            </div>

            <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:${isTreatMeal ? 'var(--gold-soft)' : 'var(--bg-surface)'};border:1px solid ${isTreatMeal ? 'var(--gold)' : 'var(--border-subtle)'};margin-bottom:14px;font-size:13px;cursor:pointer">
              <input id="lf-treat" type="checkbox" ${isTreatMeal ? 'checked' : ''} />
              <div>
                <strong style="color:var(--forest-dark)">Makan Enak (jatah ${summary?.treatMealsUsedThisWeek || 0}/${summary?.treatMealsPerWeek ?? 3} minggu ini)</strong>
              </div>
            </label>

            <button type="button" class="btn btn--emerald btn--full" id="lf-save">
              Simpan Pengeluaran Makan
            </button>
          </div>
        `;

        backdrop.querySelector('[data-close-lf]').addEventListener('click', close);

        const nameEl = backdrop.querySelector('#lf-name');
        const amtEl = backdrop.querySelector('#lf-amount');

        nameEl.addEventListener('input', (e) => { foodName = e.target.value; });
        amtEl.addEventListener('input', () => {
          amount = parseAmountInput(amtEl.value);
          amtEl.value = amount > 0 ? amount.toLocaleString('id-ID') : '';
        });

        backdrop.querySelectorAll('[data-lf-add]').forEach((btn) => {
          btn.addEventListener('click', () => {
            amount += Number(btn.getAttribute('data-lf-add'));
            amtEl.value = amount.toLocaleString('id-ID');
          });
        });

        backdrop.querySelectorAll('[data-cal-preset]').forEach((btn) => {
          btn.addEventListener('click', () => {
            calories = Number(btn.getAttribute('data-cal-preset'));
            protein = Number(btn.getAttribute('data-prot-preset'));
            backdrop.querySelectorAll('[data-cal-preset]').forEach((b) => b.classList.remove('chip--active'));
            btn.classList.add('chip--active');
          });
        });

        backdrop.querySelector('#lf-slot').addEventListener('change', (e) => { mealSlot = e.target.value; });
        backdrop.querySelector('#lf-wallet').addEventListener('change', (e) => { walletId = e.target.value; });
        backdrop.querySelector('#lf-treat').addEventListener('change', (e) => {
          isTreatMeal = e.target.checked;
          renderSheet();
        });

        backdrop.querySelector('#lf-save').addEventListener('click', async () => {
          try {
            if (!foodName.trim()) return showToast('Isi dulu nama makanannya.', 'error');
            if (amount <= 0) return showToast('Masukkan nominal rupiahnya.', 'error');
            await createTransaction(db, {
              periodId: summary?.period?.id,
              walletId,
              categoryId: 'cat-exp-food',
              type: 'expense',
              amount,
              transactionDate: `${toDateString()} ${toDateTimeString().slice(11)}`,
              description: foodName.trim(),
              mealSlot,
              calories,
              protein,
              isTreatMeal
            });
            close();
            await appStore.refresh({ todayTreatMode: isTreatMeal ? true : state.todayTreatMode });
            showToast('Makan tercatat! Target harian otomatis dihitung ulang.');
          } catch (err) {
            showToast(err.message || 'Gagal mencatat makan.', 'error');
          }
        });
      };

      renderSheet();
    }
  });
}
