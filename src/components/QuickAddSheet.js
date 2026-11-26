import { iconSvg } from './Icons.js';
import { esc } from '../utils/dom.js';
import { formatIDR, parseAmountInput } from '../utils/currency.js';
import { toDateString, toDateTimeString } from '../utils/date.js';
import { createTransaction, deleteTransaction, updateTransaction } from '../repositories/transactionRepo.js';
import { appStore } from '../store/appStore.js';
import { confirmDialog, openOverlay, showToast } from './Modal.js';

/**
 * Open one-handed Bottom Sheet to add or edit a transaction (< 3 steps).
 * @param {{ defaultType?: 'expense'|'income'|'transfer', defaultCategoryId?: string, editTx?: any }} [opts]
 */
export function openQuickAddSheet(opts = {}) {
  const { state, db } = appStore;
  const editTx = opts.editTx || null;
  const wallets = state.wallets || [];
  if (wallets.length === 0) {
    showToast('Buat dompet terlebih dahulu sebelum mencatat transaksi.', 'error');
    return;
  }

  let txType = editTx?.type || opts.defaultType || 'expense';
  let amount = editTx ? editTx.amount : 0;
  let walletId = editTx?.wallet_id || wallets.find((w) => w.include_in_daily_budget === 1)?.id || wallets[0].id;
  let toWalletId = editTx?.to_wallet_id || opts.toWalletId || wallets.find((w) => w.id !== walletId)?.id || '';
  let categoryId =
    editTx?.category_id ||
    opts.defaultCategoryId ||
    (txType === 'income' ? 'cat-inc-salary' : 'cat-exp-food');
  let txDate = editTx ? editTx.transaction_date.slice(0, 10) : toDateString();
  let description = editTx?.description || '';
  let isUnexpected = Boolean(editTx?.is_unexpected);
  let calories = editTx?.calories ?? 550;
  let isTreatMeal = Boolean(editTx?.is_treat_meal);
  let mealSlot = editTx?.meal_slot || 'lunch';

  const renderContent = (backdrop, close) => {
    const filteredCategories = state.categories.filter((c) => c.type === (txType === 'income' ? 'income' : 'expense'));
    if (txType !== 'transfer' && !filteredCategories.some((c) => c.id === categoryId)) {
      categoryId = filteredCategories[0]?.id || '';
    }

    backdrop.innerHTML = `
      <div class="sheet">
        <div class="sheet__handle"></div>
        <div class="section-head" style="margin-bottom:12px">
          <h3 style="margin:0;color:var(--forest-dark);font-size:18px">${editTx ? 'Edit Transaksi' : 'Catat Transaksi Cepat'}</h3>
          <button class="btn btn--soft btn--sm" data-close-sheet>Tutup</button>
        </div>

        <div class="segmented-bar" style="margin-bottom:12px">
          <button class="seg-btn ${txType === 'expense' ? 'seg-btn--active' : ''}" data-type="expense">Pengeluaran</button>
          <button class="seg-btn ${txType === 'income' ? 'seg-btn--active' : ''}" data-type="income">Pemasukan</button>
          <button class="seg-btn ${txType === 'transfer' ? 'seg-btn--active' : ''}" data-type="transfer" ${wallets.length < 2 ? 'disabled' : ''}>Transfer Dompet</button>
        </div>

        <div class="field">
          <label class="field__label">Nominal (Rp)</label>
          <input id="qa-amount" class="input input--hero tabular-nums" type="tel" inputmode="numeric" value="${amount > 0 ? amount.toLocaleString('id-ID') : ''}" placeholder="0" />
          <div class="chip-row" style="margin-top:8px;justify-content:center">
            ${[5000, 10000, 15000, 25000, 50000]
              .map((val) => `<button type="button" class="chip" data-add-chip="${val}">+${val / 1000}rb</button>`)
              .join('')}
          </div>
        </div>

        <div class="grid-2" style="margin-bottom:10px">
          <div class="field" style="margin-bottom:0">
            <label class="field__label">${txType === 'transfer' ? 'Dari Dompet' : 'Dompet'}</label>
            <select id="qa-wallet" class="select">
              ${wallets
                .map(
                  (w) =>
                    `<option value="${w.id}" ${w.id === walletId ? 'selected' : ''}>${esc(w.name)} (${formatIDR(w.balance)})</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="field" style="margin-bottom:0">
            ${
              txType === 'transfer'
                ? `<label class="field__label">Ke Dompet</label>
                   <select id="qa-to-wallet" class="select">
                     ${wallets
                       .filter((w) => w.id !== walletId)
                       .map(
                         (w) =>
                           `<option value="${w.id}" ${w.id === toWalletId ? 'selected' : ''}>${esc(w.name)} (${formatIDR(w.balance)})</option>`
                       )
                       .join('')}
                   </select>`
                : `<label class="field__label">Tanggal</label>
                   <input id="qa-date" class="input" type="date" value="${esc(txDate)}" />`
            }
          </div>
        </div>

        ${
          txType !== 'transfer'
            ? `<div class="field">
                 <label class="field__label">Kategori</label>
                 <div class="cat-grid">
                   ${filteredCategories
                     .map(
                       (c) => `
                       <button type="button" class="cat-tile ${c.id === categoryId ? 'cat-tile--active' : ''}" data-cat="${c.id}">
                         <span style="color:${esc(c.color)}">${iconSvg(c.icon, 20)}</span>
                         <span>${esc(c.name)}</span>
                       </button>`
                     )
                     .join('')}
                 </div>
               </div>`
            : `<div class="field">
                 <label class="field__label">Tanggal Transfer</label>
                 <input id="qa-date" class="input" type="date" value="${esc(txDate)}" />
               </div>`
        }

        <div class="field">
          <label class="field__label">${categoryId === 'cat-exp-food' && txType === 'expense' ? 'Makan Apa?' : 'Catatan (opsional)'}</label>
          <input id="qa-desc" class="input" type="text" value="${esc(description)}" placeholder="${categoryId === 'cat-exp-food' && txType === 'expense' ? 'Mis. Nasi Padang / Telur + Nasi' : 'Mis. Beli bensin, kiriman orang tua...'}" />
        </div>

        ${
          txType === 'expense' && categoryId === 'cat-exp-food'
            ? `<div class="grid-2" style="margin-bottom:10px">
                 <div class="field" style="margin-bottom:0">
                   <label class="field__label">Waktu Makan</label>
                   <select id="qa-slot" class="select">
                     <option value="breakfast" ${mealSlot === 'breakfast' ? 'selected' : ''}>Sarapan</option>
                     <option value="lunch" ${mealSlot === 'lunch' ? 'selected' : ''}>Makan Siang</option>
                     <option value="dinner" ${mealSlot === 'dinner' ? 'selected' : ''}>Makan Malam</option>
                     <option value="snack" ${mealSlot === 'snack' ? 'selected' : ''}>Camilan</option>
                   </select>
                 </div>
                 <div class="field" style="margin-bottom:0">
                   <label class="field__label">Estimasi Kalori</label>
                   <input id="qa-cal" class="input tabular-nums" type="number" min="0" value="${calories}" />
                 </div>
               </div>
               <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;color:var(--forest-dark);font-weight:600">
                 <input id="qa-treat" type="checkbox" ${isTreatMeal ? 'checked' : ''} />
                 Tandai sebagai Makan Enak (jatah 3x/minggu)
               </label>`
            : ''
        }

        ${
          txType === 'expense'
            ? `<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:14px;color:var(--text-body)">
                 <input id="qa-unexpected" type="checkbox" ${isUnexpected ? 'checked' : ''} />
                 Tandai sebagai pengeluaran tidak terduga
               </label>`
            : ''
        }

        <div style="display:flex;gap:10px">
          ${editTx ? `<button type="button" class="btn btn--danger" id="qa-delete">${iconSvg('trash', 18)}</button>` : ''}
          <button type="button" class="btn btn--primary btn--full" id="qa-save">
            ${editTx ? 'Simpan Perubahan' : 'Simpan Transaksi'}
          </button>
        </div>
      </div>
    `;

    backdrop.querySelector('[data-close-sheet]').addEventListener('click', close);

    const amountInput = backdrop.querySelector('#qa-amount');
    amountInput.addEventListener('input', () => {
      amount = parseAmountInput(amountInput.value);
      amountInput.value = amount > 0 ? amount.toLocaleString('id-ID') : '';
    });

    backdrop.querySelectorAll('[data-add-chip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        amount += Number(btn.getAttribute('data-add-chip'));
        amountInput.value = amount.toLocaleString('id-ID');
      });
    });

    backdrop.querySelectorAll('[data-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        txType = btn.getAttribute('data-type');
        if (txType === 'transfer' && (!toWalletId || toWalletId === walletId)) {
          toWalletId = wallets.find((w) => w.id !== walletId)?.id || '';
        }
        renderContent(backdrop, close);
      });
    });

    backdrop.querySelector('#qa-wallet').addEventListener('change', (e) => {
      walletId = e.target.value;
      if (txType === 'transfer' && toWalletId === walletId) {
        toWalletId = wallets.find((w) => w.id !== walletId)?.id || '';
        renderContent(backdrop, close);
      }
    });

    const toSelect = backdrop.querySelector('#qa-to-wallet');
    if (toSelect) {
      toSelect.addEventListener('change', (e) => {
        toWalletId = e.target.value;
      });
    }

    backdrop.querySelectorAll('[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        categoryId = btn.getAttribute('data-cat');
        renderContent(backdrop, close);
      });
    });

    const dateEl = backdrop.querySelector('#qa-date');
    if (dateEl) dateEl.addEventListener('change', (e) => { txDate = e.target.value; });

    const descEl = backdrop.querySelector('#qa-desc');
    descEl.addEventListener('input', (e) => { description = e.target.value; });

    const slotEl = backdrop.querySelector('#qa-slot');
    if (slotEl) slotEl.addEventListener('change', (e) => { mealSlot = e.target.value; });
    const calEl = backdrop.querySelector('#qa-cal');
    if (calEl) calEl.addEventListener('input', (e) => { calories = Number(e.target.value) || 0; });
    const treatEl = backdrop.querySelector('#qa-treat');
    if (treatEl) treatEl.addEventListener('change', (e) => { isTreatMeal = e.target.checked; });

    const unexpEl = backdrop.querySelector('#qa-unexpected');
    if (unexpEl) unexpEl.addEventListener('change', (e) => { isUnexpected = e.target.checked; });

    const delBtn = backdrop.querySelector('#qa-delete');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        close();
        const ok = await confirmDialog({
          title: 'Hapus Transaksi?',
          message: 'Saldo dompet terkait dan perhitungan budget harian akan otomatis dikembalikan.',
          confirmLabel: 'Hapus',
          danger: true
        });
        if (!ok) return;
        await deleteTransaction(db, editTx.id);
        await appStore.refresh();
        showToast('Transaksi dihapus & saldo diperbarui.');
      });
    }

    backdrop.querySelector('#qa-save').addEventListener('click', async () => {
      try {
        const finalDate = `${txDate} ${toDateTimeString().slice(11)}`;
        const isFoodExpense = txType === 'expense' && categoryId === 'cat-exp-food';
        if (editTx) {
          await updateTransaction(db, editTx.id, {
            type: txType,
            walletId,
            toWalletId: txType === 'transfer' ? toWalletId : null,
            categoryId: txType === 'transfer' ? null : categoryId,
            amount,
            transactionDate: finalDate,
            description,
            isUnexpected,
            mealSlot: isFoodExpense ? mealSlot : null,
            calories: isFoodExpense ? calories : null,
            isTreatMeal: isFoodExpense ? isTreatMeal : false
          });
          showToast('Transaksi berhasil diperbarui.');
        } else {
          await createTransaction(db, {
            periodId: state.summary?.period?.id,
            type: txType,
            walletId,
            toWalletId: txType === 'transfer' ? toWalletId : null,
            categoryId: txType === 'transfer' ? null : categoryId,
            amount,
            transactionDate: finalDate,
            description,
            isUnexpected,
            mealSlot: isFoodExpense ? mealSlot : null,
            calories: isFoodExpense ? calories : null,
            isTreatMeal: isFoodExpense ? isTreatMeal : false
          });
          showToast('Transaksi tersimpan & budget terhitung ulang.');
        }
        close();
        await appStore.refresh();
      } catch (err) {
        showToast(err.message || 'Gagal menyimpan transaksi.', 'error');
      }
    });
  };

  openOverlay('', {
    onMount: (backdrop, close) => renderContent(backdrop, close)
  });
}
