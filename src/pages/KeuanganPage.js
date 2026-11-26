import { iconSvg } from '../components/Icons.js';
import { renderSubHeader } from '../components/TopBar.js';
import { renderCircularGauge } from '../components/CircularGauge.js';
import { openQuickAddSheet } from '../components/QuickAddSheet.js';
import { confirmDialog, openOverlay, showToast } from '../components/Modal.js';
import { esc } from '../utils/dom.js';
import { formatIDR, parseAmountInput } from '../utils/currency.js';
import { computeInitialDueDate, formatDateID, toDateString } from '../utils/date.js';
import { createWallet, softDeleteWallet, WALLET_TYPES } from '../repositories/walletRepo.js';
import {
  createPlannedExpense,
  createRecurringExpense,
  createSavingsGoal,
  deleteBudget,
  deletePlannedExpense,
  deleteRecurringExpense,
  deleteSavingsGoal,
  payPlannedExpense,
  payRecurringExpense,
  upsertBudget
} from '../repositories/financeExtrasRepo.js';
import { appStore } from '../store/appStore.js';

let txSearch = '';
let txTypeFilter = 'all';
let txSortBy = 'newest';

function renderCategoryBudgetDetail(state, categoryId) {
  const cat = state.categories.find((c) => c.id === categoryId);
  const budget = state.budgets.find((b) => b.category_id === categoryId);
  const budgetAmount = budget?.amount || 0;
  const spentAmount = budget?.spent_amount || 0;
  const remaining = Math.max(0, budgetAmount - spentAmount);
  const health = spentAmount > budgetAmount ? 'Defisit' : spentAmount >= budgetAmount * 0.85 ? 'Waspada' : 'Aman';

  let txs = state.transactions.filter(
    (t) => t.category_id === categoryId && (!state.summary?.period || t.period_id === state.summary.period.id)
  );
  if (txSortBy === 'oldest') txs = [...txs].reverse();
  else if (txSortBy === 'highest') txs = [...txs].sort((a, b) => b.amount - a.amount);
  else if (txSortBy === 'lowest') txs = [...txs].sort((a, b) => a.amount - b.amount);

  return `
    <div class="page-content">
      ${renderSubHeader({ eyebrow: 'Anggaran Periode Aktif', title: cat?.name || 'Kategori' })}

      ${renderCircularGauge({
        amount: remaining,
        totalBase: budgetAmount,
        eyebrow: 'Sisa Anggaran',
        subPrefix: 'tersedia dari',
        healthStatus: health
      })}

      <div class="circle-actions-row">
        <button class="circle-action" id="det-add-expense">
          <span class="circle-action__btn">${iconSvg('plus', 19)}</span>
          <span>Tambah Pengeluaran</span>
        </button>
        <button class="circle-action" id="det-edit-budget">
          <span class="circle-action__btn">${iconSvg('edit', 17)}</span>
          <span>Edit Budget</span>
        </button>
      </div>

      <div class="section-head">
        <div>
          <span class="section-head__eyebrow">Riwayat Kategori</span>
          <h3 class="section-head__title">Transaksi Periode</h3>
        </div>
        <select class="select-pill" id="det-sort">
          <option value="newest" ${txSortBy === 'newest' ? 'selected' : ''}>Terbaru</option>
          <option value="oldest" ${txSortBy === 'oldest' ? 'selected' : ''}>Terlama</option>
          <option value="highest" ${txSortBy === 'highest' ? 'selected' : ''}>Terbesar</option>
          <option value="lowest" ${txSortBy === 'lowest' ? 'selected' : ''}>Terkecil</option>
        </select>
      </div>

      <div class="card card--airy">
        ${
          txs.length === 0
            ? '<div class="empty-state">Belum ada transaksi untuk kategori ini pada periode aktif.</div>'
            : txs
                .map(
                  (t) => `
                  <div class="list-row" data-edit-tx="${t.id}" style="cursor:pointer">
                    <div class="list-row__left">
                      <div>
                        <div class="list-row__title">${esc(t.description || cat?.name)}</div>
                        <div class="list-row__sub">${formatDateID(t.transaction_date)} • ${esc(t.wallet_name)}</div>
                      </div>
                    </div>
                    <div class="list-row__amount tabular-nums">${formatIDR(t.amount)}</div>
                  </div>`
                )
                .join('')
        }
      </div>
    </div>
  `;
}

export function renderKeuanganPage(state) {
  if (state.subView?.type === 'category-budget') {
    return renderCategoryBudgetDetail(state, state.subView.categoryId);
  }

  const seg = state.keuanganSegment || 'transaksi';
  const periodId = state.summary?.period?.id;

  let bodyHtml = '';

  if (seg === 'transaksi') {
    let list = state.transactions || [];
    if (txTypeFilter !== 'all') list = list.filter((t) => t.type === txTypeFilter);
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      list = list.filter(
        (t) =>
          (t.description || '').toLowerCase().includes(q) ||
          (t.category_name || '').toLowerCase().includes(q) ||
          (t.wallet_name || '').toLowerCase().includes(q)
      );
    }
    if (txSortBy === 'oldest') list = [...list].reverse();
    else if (txSortBy === 'highest') list = [...list].sort((a, b) => b.amount - a.amount);
    else if (txSortBy === 'lowest') list = [...list].sort((a, b) => a.amount - b.amount);

    bodyHtml = `
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="keu-search" class="input" type="search" value="${esc(txSearch)}" placeholder="Cari catatan, kategori..." style="padding:9px 12px" />
        <select id="keu-sort" class="select-pill">
          <option value="newest" ${txSortBy === 'newest' ? 'selected' : ''}>Terbaru</option>
          <option value="oldest" ${txSortBy === 'oldest' ? 'selected' : ''}>Terlama</option>
          <option value="highest" ${txSortBy === 'highest' ? 'selected' : ''}>Terbesar</option>
          <option value="lowest" ${txSortBy === 'lowest' ? 'selected' : ''}>Terkecil</option>
        </select>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px">
        <div class="chip-row" style="margin-bottom:0">
          ${[
            ['all', 'Semua'],
            ['expense', 'Pengeluaran'],
            ['income', 'Pemasukan'],
            ['transfer', 'Transfer']
          ]
            .map(
              ([val, lbl]) =>
                `<button class="chip ${txTypeFilter === val ? 'chip--active' : ''}" data-tx-filter="${val}">${lbl}</button>`
            )
            .join('')}
        </div>
        <button class="btn btn--primary btn--sm" id="btn-keu-add-expense" style="white-space:nowrap">+ Pengeluaran</button>
      </div>
      <div class="card">
        ${
          list.length === 0
            ? '<div class="empty-state">Belum ada transaksi tercatat. Tekan tombol <strong>+</strong> di bawah untuk mencatat transaksi pertama.</div>'
            : list
                .map((t) => {
                  const title =
                    t.type === 'transfer'
                      ? `Transfer: ${t.wallet_name} → ${t.to_wallet_name}`
                      : t.description || t.category_name || 'Transaksi';
                  const signPrefix = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '';
                  const amtClass =
                    t.type === 'income'
                      ? 'list-row__amount--income'
                      : t.type === 'transfer'
                        ? 'list-row__amount--transfer'
                        : 'list-row__amount--expense';
                  return `
                    <div class="list-row" data-edit-tx="${t.id}" style="cursor:pointer">
                      <div class="list-row__left">
                        <span class="list-row__icon" style="color:${esc(t.category_color || '#0F7B5B')}">
                          ${iconSvg(t.type === 'transfer' ? 'swap' : t.category_icon || 'wallet', 18)}
                        </span>
                        <div style="min-width:0">
                          <div class="list-row__title">${esc(title)}</div>
                          <div class="list-row__sub">
                            ${formatDateID(t.transaction_date)} • ${esc(t.wallet_name)}
                            ${t.is_unexpected ? ' • <span style="color:var(--warning)">Tak Terduga</span>' : ''}
                          </div>
                        </div>
                      </div>
                      <div class="list-row__amount ${amtClass} tabular-nums">
                        ${signPrefix}${formatIDR(t.amount)}
                      </div>
                    </div>`;
                })
                .join('')
        }
      </div>
    `;
  } else if (seg === 'dompet') {
    bodyHtml = `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn btn--primary btn--sm" id="btn-add-wallet">+ Tambah Dompet</button>
        <button class="btn btn--soft btn--sm" id="btn-quick-transfer">${iconSvg('swap', 16)} Transfer Antar-Dompet</button>
      </div>
      <div class="card">
        ${(state.wallets || [])
          .map((w) => {
            const meta = WALLET_TYPES[w.wallet_type] || WALLET_TYPES.cash;
            return `
              <div class="list-row">
                <div class="list-row__left">
                  <span class="list-row__icon">${iconSvg(w.icon || meta.icon, 19)}</span>
                  <div>
                    <div class="list-row__title">${esc(w.name)}</div>
                    <div class="list-row__sub">
                      ${esc(meta.label)} • ${w.include_in_daily_budget ? 'Uang Belanja Harian' : '🔒 Terkunci (Cadangan)'}
                    </div>
                  </div>
                </div>
                <div style="text-align:right">
                  <div class="list-row__amount tabular-nums">${formatIDR(w.balance)}</div>
                  <button class="link-emerald" style="font-size:11px;color:var(--danger)" data-del-wallet="${w.id}">Hapus</button>
                </div>
              </div>`;
          })
          .join('')}
      </div>
    `;
  } else if (seg === 'tagihan') {
    const bills = state.recurringExpenses || [];
    const planned = state.plannedExpenses || [];

    bodyHtml = `
      <div class="section-head">
        <div>
          <span class="section-head__eyebrow">Kewajiban Periode Aktif</span>
          <h3 class="section-head__title">Tagihan Rutin</h3>
        </div>
        <button class="btn btn--primary btn--sm" id="btn-add-bill">+ Tagihan</button>
      </div>
      <div class="card">
        ${
          bills.length === 0
            ? '<div class="empty-state">Belum ada tagihan rutin (sewa kos, listrik, internet).</div>'
            : bills
                .map((b) => {
                  const isPaid = Boolean(periodId && b.last_paid_period_id === periodId);
                  return `
                    <div class="list-row">
                      <div class="list-row__left">
                        <span class="list-row__icon">${iconSvg(b.category_icon || 'home', 18)}</span>
                        <div>
                          <div class="list-row__title">${esc(b.name)}</div>
                          <div class="list-row__sub">Jatuh tempo: ${formatDateID(b.next_due_date)} • ${esc(b.frequency)}</div>
                        </div>
                      </div>
                      <div style="text-align:right">
                        <div class="list-row__amount tabular-nums">${formatIDR(b.amount)}</div>
                        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:4px">
                          ${
                            isPaid
                              ? '<span class="status-pill status-pill--aman" style="font-size:11px;padding:2px 8px">Lunas</span>'
                              : `<button class="btn btn--emerald btn--sm" data-pay-bill="${b.id}" style="padding:4px 10px;font-size:11.5px">Bayar</button>`
                          }
                          <button class="btn btn--soft btn--sm" data-del-bill="${b.id}" style="padding:4px 8px;color:var(--danger)">${iconSvg('trash', 13)}</button>
                        </div>
                      </div>
                    </div>`;
                })
                .join('')
        }
      </div>

      <div class="section-head" style="margin-top:16px">
        <div>
          <span class="section-head__eyebrow">Sekali Waktu Periode Ini</span>
          <h3 class="section-head__title">Pengeluaran Terencana</h3>
        </div>
        <button class="btn btn--soft btn--sm" id="btn-add-planned">+ Rencana</button>
      </div>
      <div class="card">
        ${
          planned.length === 0
            ? '<div class="empty-state">Belum ada pengeluaran terencana (mis. servis motor, buku kuliah).</div>'
            : planned
                .map(
                  (p) => `
                  <div class="list-row">
                    <div class="list-row__left">
                      <span class="list-row__icon">${iconSvg(p.category_icon || 'bag', 18)}</span>
                      <div>
                        <div class="list-row__title">${esc(p.name)}</div>
                        <div class="list-row__sub">Target: ${formatDateID(p.planned_date)}</div>
                      </div>
                    </div>
                    <div style="text-align:right">
                      <div class="list-row__amount tabular-nums">${formatIDR(p.amount)}</div>
                      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:4px">
                        ${
                          p.status === 'paid'
                            ? '<span class="status-pill status-pill--aman" style="font-size:11px;padding:2px 8px">Terbayar</span>'
                            : `<button class="btn btn--emerald btn--sm" data-pay-planned="${p.id}" style="padding:4px 10px;font-size:11.5px">Bayar</button>`
                        }
                        <button class="btn btn--soft btn--sm" data-del-planned="${p.id}" style="padding:4px 8px;color:var(--danger)">${iconSvg('trash', 13)}</button>
                      </div>
                    </div>
                  </div>`
                )
                .join('')
        }
      </div>
    `;
  } else if (seg === 'anggaran') {
    const budgets = state.budgets || [];
    bodyHtml = `
      <div class="section-head">
        <div>
          <span class="section-head__eyebrow">Batas Pengeluaran Periode</span>
          <h3 class="section-head__title">Anggaran Kategori</h3>
        </div>
        <button class="btn btn--primary btn--sm" id="btn-add-budget">+ Atur Budget</button>
      </div>
      <div class="card">
        ${
          budgets.length === 0
            ? '<div class="empty-state">Belum ada anggaran per kategori. Ketuk <strong>+ Atur Budget</strong> untuk membatasi kategori tertentu (mis. Hiburan atau Makan).</div>'
            : budgets
                .map((b) => {
                  const pct = b.amount > 0 ? Math.min(100, Math.round((b.spent_amount / b.amount) * 100)) : 0;
                  const fillCls = pct >= 100 ? 'progress-fill--danger' : pct >= 85 ? 'progress-fill--warning' : '';
                  return `
                    <div class="list-row" style="display:block;cursor:pointer" data-open-cat-budget="${b.category_id}">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <strong style="color:var(--forest-dark)">${esc(b.category_name)}</strong>
                        <span class="tabular-nums" style="font-size:13px;font-weight:700">${formatIDR(b.spent_amount)} / ${formatIDR(b.amount)}</span>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill ${fillCls}" style="width:${pct}%"></div>
                      </div>
                      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11.5px;color:var(--text-muted)">
                        <span>Terpakai ${pct}% • Tap untuk detail</span>
                        <button class="link-emerald" style="color:var(--danger);font-size:11px" data-del-budget="${b.id}">Hapus</button>
                      </div>
                    </div>`;
                })
                .join('')
        }
      </div>
    `;
  } else if (seg === 'tabungan') {
    const goals = state.savingsGoals || [];
    bodyHtml = `
      <div class="section-head">
        <div>
          <span class="section-head__eyebrow">Target Masa Depan</span>
          <h3 class="section-head__title">Tabungan &amp; Dana Darurat</h3>
        </div>
        <button class="btn btn--primary btn--sm" id="btn-add-goal">+ Target</button>
      </div>
      <div class="card">
        ${
          goals.length === 0
            ? '<div class="empty-state">Belum ada target tabungan. Buat target dana darurat atau barang impianmu.</div>'
            : goals
                .map(
                  (g) => `
                  <div class="list-row" style="display:block">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                      <div>
                        ${g.is_achieved ? `<span class="gold-badge" style="margin-bottom:4px">${iconSvg('bell', 11)} Target Tercapai</span><br/>` : ''}
                        <strong style="color:var(--forest-dark);font-size:15px">${esc(g.name)}</strong>
                        <div style="font-size:11.5px;color:var(--text-muted)">${g.wallet_name ? `Dompet: ${esc(g.wallet_name)}` : 'Target Mandiri'}</div>
                      </div>
                      <div style="text-align:right">
                        <div class="tabular-nums" style="font-weight:800;color:var(--emerald)">${formatIDR(g.effective_current_amount)}</div>
                        <div class="tabular-nums" style="font-size:11.5px;color:var(--text-muted)">dari ${formatIDR(g.target_amount)}</div>
                      </div>
                    </div>
                    <div class="progress-track">
                      <div class="progress-fill" style="width:${g.progress_pct}%"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
                      <span style="font-size:11.5px;color:var(--text-muted)">Progress ${g.progress_pct}%</span>
                      <div style="display:flex;gap:8px">
                        <button class="btn btn--emerald btn--sm" data-fill-goal="${g.wallet_id || ''}">Isi Tabungan</button>
                        <button class="btn btn--soft btn--sm" data-del-goal="${g.id}" style="color:var(--danger)">${iconSvg('trash', 13)}</button>
                      </div>
                    </div>
                  </div>`
                )
                .join('')
        }
      </div>
    `;
  }

  return `
    <div class="page-content">
      <div class="section-head" style="margin-bottom:10px">
        <div>
          <span class="section-head__eyebrow">Manajemen Finansial</span>
          <h2 class="section-head__title">Keuangan</h2>
        </div>
      </div>

      <div class="segmented-bar">
        ${[
          ['transaksi', 'Transaksi'],
          ['dompet', 'Dompet'],
          ['tagihan', 'Tagihan'],
          ['anggaran', 'Anggaran'],
          ['tabungan', 'Tabungan']
        ]
          .map(
            ([id, label]) =>
              `<button class="seg-btn ${seg === id ? 'seg-btn--active' : ''}" data-keu-seg="${id}">${label}</button>`
          )
          .join('')}
      </div>

      ${bodyHtml}
    </div>
  `;
}

export function bindKeuanganHandlers(container, rerender) {
  const { state, db } = appStore;

  // Subview Screen 1 handlers
  if (state.subView?.type === 'category-budget') {
    const catId = state.subView.categoryId;
    container.querySelector('[data-action="close-subview"]')?.addEventListener('click', () => {
      appStore.setState({ subView: null });
    });
    container.querySelector('#det-add-expense')?.addEventListener('click', () => {
      openQuickAddSheet({ defaultType: 'expense', defaultCategoryId: catId });
    });
    container.querySelector('#det-edit-budget')?.addEventListener('click', () => {
      openBudgetModal(catId);
    });
    container.querySelector('#det-sort')?.addEventListener('change', (e) => {
      txSortBy = e.target.value;
      rerender();
    });
    container.querySelectorAll('[data-edit-tx]').forEach((el) => {
      el.addEventListener('click', () => {
        const tx = state.transactions.find((t) => t.id === el.getAttribute('data-edit-tx'));
        if (tx) openQuickAddSheet({ editTx: tx });
      });
    });
    return;
  }

  // Segment tabs
  container.querySelectorAll('[data-keu-seg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      appStore.setState({ keuanganSegment: btn.getAttribute('data-keu-seg') });
    });
  });

  // Transactions
  const searchEl = container.querySelector('#keu-search');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      txSearch = e.target.value;
      rerender();
    });
  }
  container.querySelector('#keu-sort')?.addEventListener('change', (e) => {
    txSortBy = e.target.value;
    rerender();
  });
  container.querySelectorAll('[data-tx-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      txTypeFilter = btn.getAttribute('data-tx-filter');
      rerender();
    });
  });
  container.querySelectorAll('[data-edit-tx]').forEach((el) => {
    el.addEventListener('click', () => {
      const tx = state.transactions.find((t) => t.id === el.getAttribute('data-edit-tx'));
      if (tx) openQuickAddSheet({ editTx: tx });
    });
  });

  container.querySelector('#btn-keu-add-expense')?.addEventListener('click', () => {
    openQuickAddSheet({ defaultType: 'expense' });
  });

  // Wallets
  container.querySelector('#btn-add-wallet')?.addEventListener('click', () => openAddWalletModal());
  container.querySelector('#btn-quick-transfer')?.addEventListener('click', () => {
    openQuickAddSheet({ defaultType: 'transfer' });
  });
  container.querySelectorAll('[data-del-wallet]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del-wallet');
      const ok = await confirmDialog({
        title: 'Hapus Dompet?',
        message: 'Dompet yang belum memiliki transaksi dapat dihapus permanen.',
        confirmLabel: 'Hapus',
        danger: true
      });
      if (!ok) return;
      try {
        await softDeleteWallet(db, id);
        await appStore.refresh();
        showToast('Dompet dihapus.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Recurring & Planned
  container.querySelector('#btn-add-bill')?.addEventListener('click', () => openAddBillModal());
  container.querySelector('#btn-add-planned')?.addEventListener('click', () => openAddPlannedModal());
  container.querySelectorAll('[data-pay-bill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bill = state.recurringExpenses.find((b) => b.id === btn.getAttribute('data-pay-bill'));
      if (bill) openPayModal({ kind: 'recurring', item: bill });
    });
  });
  container.querySelectorAll('[data-del-bill]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await deleteRecurringExpense(db, btn.getAttribute('data-del-bill'));
      await appStore.refresh();
      showToast('Tagihan rutin dihapus.');
    });
  });
  container.querySelectorAll('[data-pay-planned]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = state.plannedExpenses.find((p) => p.id === btn.getAttribute('data-pay-planned'));
      if (item) openPayModal({ kind: 'planned', item });
    });
  });
  container.querySelectorAll('[data-del-planned]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await deletePlannedExpense(db, btn.getAttribute('data-del-planned'));
      await appStore.refresh();
      showToast('Rencana pengeluaran dihapus.');
    });
  });

  // Budgets
  container.querySelector('#btn-add-budget')?.addEventListener('click', () => openBudgetModal());
  container.querySelectorAll('[data-open-cat-budget]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-del-budget]')) return;
      appStore.setState({
        subView: { type: 'category-budget', categoryId: row.getAttribute('data-open-cat-budget') }
      });
    });
  });
  container.querySelectorAll('[data-del-budget]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteBudget(db, btn.getAttribute('data-del-budget'));
      await appStore.refresh();
      showToast('Anggaran kategori dihapus.');
    });
  });

  // Savings Goals
  container.querySelector('#btn-add-goal')?.addEventListener('click', () => openAddGoalModal());
  container.querySelectorAll('[data-fill-goal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const toWalletId = btn.getAttribute('data-fill-goal');
      openQuickAddSheet({ defaultType: 'transfer', toWalletId });
    });
  });
  container.querySelectorAll('[data-del-goal]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await deleteSavingsGoal(db, btn.getAttribute('data-del-goal'));
      await appStore.refresh();
      showToast('Target tabungan dihapus.');
    });
  });
}

function openAddWalletModal() {
  openOverlay(
    `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <h3 style="margin:0 0 12px;color:var(--forest-dark)">Tambah Dompet Baru</h3>
      <div class="field">
        <label class="field__label">Nama Dompet</label>
        <input id="nw-name" class="input" placeholder="Mis. GoPay / Mandiri / Tabungan Kos" />
      </div>
      <div class="field">
        <label class="field__label">Jenis Dompet</label>
        <select id="nw-type" class="select">
          <option value="cash">Tunai (Operasional)</option>
          <option value="bank">Rekening Bank (Operasional)</option>
          <option value="ewallet">E-Wallet (Operasional)</option>
          <option value="savings">Tabungan (Terkunci dari Budget Harian)</option>
          <option value="emergency">Dana Darurat (Terkunci dari Budget Harian)</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label">Saldo Awal (Rp)</label>
        <input id="nw-bal" class="input tabular-nums" type="tel" value="0" />
      </div>
      <button class="btn btn--primary btn--full" id="nw-save">Simpan Dompet</button>
    </div>`,
    {
      onMount: (backdrop, close) => {
        backdrop.querySelector('#nw-save').addEventListener('click', async () => {
          const name = backdrop.querySelector('#nw-name').value;
          const walletType = backdrop.querySelector('#nw-type').value;
          const balance = parseAmountInput(backdrop.querySelector('#nw-bal').value);
          if (!name.trim()) return showToast('Nama dompet wajib diisi.', 'error');
          await createWallet(appStore.db, { name, walletType, balance });
          close();
          await appStore.refresh();
          showToast('Dompet ditambahkan.');
        });
      }
    }
  );
}

function openAddBillModal() {
  const cats = appStore.state.categories.filter((c) => c.type === 'expense');
  openOverlay(
    `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <h3 style="margin:0 0 12px;color:var(--forest-dark)">Tambah Tagihan Rutin</h3>
      <div class="field"><label class="field__label">Nama Tagihan</label><input id="nb-name" class="input" placeholder="Mis. Sewa Kos / Listrik / WiFi" /></div>
      <div class="grid-2">
        <div class="field"><label class="field__label">Nominal (Rp)</label><input id="nb-amt" class="input tabular-nums" type="tel" placeholder="500000" /></div>
        <div class="field"><label class="field__label">Tgl Jatuh Tempo</label><input id="nb-day" class="input tabular-nums" type="number" min="1" max="31" value="1" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label class="field__label">Frekuensi</label>
          <select id="nb-freq" class="select">
            <option value="monthly">Bulanan</option>
            <option value="weekly">Mingguan</option>
            <option value="yearly">Tahunan</option>
          </select>
        </div>
        <div class="field"><label class="field__label">Kategori</label>
          <select id="nb-cat" class="select">${cats.map((c) => `<option value="${c.id}" ${c.id === 'cat-exp-kos' ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        </div>
      </div>
      <button class="btn btn--primary btn--full" id="nb-save">Simpan Tagihan</button>
    </div>`,
    {
      onMount: (backdrop, close) => {
        backdrop.querySelector('#nb-save').addEventListener('click', async () => {
          try {
            const freq = backdrop.querySelector('#nb-freq').value;
            const day = Number(backdrop.querySelector('#nb-day').value) || 1;
            await createRecurringExpense(appStore.db, {
              name: backdrop.querySelector('#nb-name').value,
              amount: parseAmountInput(backdrop.querySelector('#nb-amt').value),
              dueDay: day,
              frequency: freq,
              categoryId: backdrop.querySelector('#nb-cat').value,
              nextDueDate: computeInitialDueDate(toDateString(), day, freq)
            });
            close();
            await appStore.refresh();
            showToast('Tagihan rutin disimpan.');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    }
  );
}

function openAddPlannedModal() {
  const cats = appStore.state.categories.filter((c) => c.type === 'expense');
  openOverlay(
    `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <h3 style="margin:0 0 12px;color:var(--forest-dark)">Tambah Pengeluaran Terencana</h3>
      <div class="field"><label class="field__label">Kebutuhan</label><input id="np-name" class="input" placeholder="Mis. Servis Motor / Beli Galon" /></div>
      <div class="grid-2">
        <div class="field"><label class="field__label">Nominal (Rp)</label><input id="np-amt" class="input tabular-nums" type="tel" /></div>
        <div class="field"><label class="field__label">Tanggal Rencana</label><input id="np-date" class="input" type="date" value="${toDateString()}" /></div>
      </div>
      <div class="field"><label class="field__label">Kategori</label>
        <select id="np-cat" class="select">${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      </div>
      <button class="btn btn--primary btn--full" id="np-save">Simpan Rencana</button>
    </div>`,
    {
      onMount: (backdrop, close) => {
        backdrop.querySelector('#np-save').addEventListener('click', async () => {
          try {
            await createPlannedExpense(appStore.db, {
              periodId: appStore.state.summary?.period?.id,
              name: backdrop.querySelector('#np-name').value,
              amount: parseAmountInput(backdrop.querySelector('#np-amt').value),
              plannedDate: backdrop.querySelector('#np-date').value,
              categoryId: backdrop.querySelector('#np-cat').value
            });
            close();
            await appStore.refresh();
            showToast('Pengeluaran terencana ditambahkan.');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    }
  );
}

function openPayModal({ kind, item }) {
  const wallets = appStore.state.wallets || [];
  openOverlay(
    `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <h3 style="margin:0 0 12px;color:var(--forest-dark)">Bayar: ${esc(item.name)}</h3>
      <div class="field">
        <label class="field__label">Nominal Pembayaran Aktual (Rp)</label>
        <input id="pay-amt" class="input input--hero tabular-nums" type="tel" value="${item.amount.toLocaleString('id-ID')}" />
      </div>
      <div class="field">
        <label class="field__label">Bayar Dari Dompet</label>
        <select id="pay-wallet" class="select">
          ${wallets.map((w) => `<option value="${w.id}">${esc(w.name)} (${formatIDR(w.balance)})</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--emerald btn--full" id="pay-confirm">Konfirmasi Lunas &amp; Potong Saldo</button>
    </div>`,
    {
      onMount: (backdrop, close) => {
        backdrop.querySelector('#pay-confirm').addEventListener('click', async () => {
          try {
            const actualAmount = parseAmountInput(backdrop.querySelector('#pay-amt').value);
            const walletId = backdrop.querySelector('#pay-wallet').value;
            const periodId = appStore.state.summary?.period?.id;
            if (kind === 'recurring') {
              await payRecurringExpense(appStore.db, { recurringId: item.id, walletId, periodId, actualAmount });
            } else {
              await payPlannedExpense(appStore.db, { plannedId: item.id, walletId, periodId, actualAmount });
            }
            close();
            await appStore.refresh();
            showToast(`${item.name} ditandai lunas.`);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    }
  );
}

function openBudgetModal(preselectedCatId = null) {
  const cats = appStore.state.categories.filter((c) => c.type === 'expense');
  const existing = preselectedCatId ? appStore.state.budgets.find((b) => b.category_id === preselectedCatId) : null;
  openOverlay(
    `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <h3 style="margin:0 0 12px;color:var(--forest-dark)">Atur Budget Kategori</h3>
      <div class="field">
        <label class="field__label">Kategori</label>
        <select id="bg-cat" class="select" ${preselectedCatId ? 'disabled' : ''}>
          ${cats.map((c) => `<option value="${c.id}" ${c.id === preselectedCatId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field__label">Batas Anggaran Periode Ini (Rp)</label>
        <input id="bg-amt" class="input input--hero tabular-nums" type="tel" value="${existing ? existing.amount.toLocaleString('id-ID') : ''}" placeholder="500000" />
      </div>
      <button class="btn btn--primary btn--full" id="bg-save">Simpan Anggaran</button>
    </div>`,
    {
      onMount: (backdrop, close) => {
        backdrop.querySelector('#bg-save').addEventListener('click', async () => {
          try {
            const p = appStore.state.summary?.period;
            await upsertBudget(appStore.db, {
              periodId: p.id,
              categoryId: preselectedCatId || backdrop.querySelector('#bg-cat').value,
              amount: parseAmountInput(backdrop.querySelector('#bg-amt').value),
              startDate: p.start_date,
              endDate: p.end_date
            });
            close();
            await appStore.refresh();
            showToast('Anggaran kategori diperbarui.');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    }
  );
}

function openAddGoalModal() {
  const lockedWallets = (appStore.state.wallets || []).filter((w) => w.include_in_daily_budget === 0);
  openOverlay(
    `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <h3 style="margin:0 0 12px;color:var(--forest-dark)">Target Tabungan Baru</h3>
      <div class="field"><label class="field__label">Nama Target</label><input id="ng-name" class="input" placeholder="Mis. Dana Darurat / Laptop Baru" /></div>
      <div class="grid-2">
        <div class="field"><label class="field__label">Target Nominal (Rp)</label><input id="ng-target" class="input tabular-nums" type="tel" placeholder="1000000" /></div>
        <div class="field"><label class="field__label">Saldo Awal (Rp)</label><input id="ng-cur" class="input tabular-nums" type="tel" value="0" /></div>
      </div>
      <div class="field">
        <label class="field__label">Hubungkan ke Dompet Terkunci (Opsional)</label>
        <select id="ng-wallet" class="select">
          <option value="">-- Target Mandiri --</option>
          ${lockedWallets.map((w) => `<option value="${w.id}">${esc(w.name)} (${formatIDR(w.balance)})</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--primary btn--full" id="ng-save">Simpan Target</button>
    </div>`,
    {
      onMount: (backdrop, close) => {
        backdrop.querySelector('#ng-save').addEventListener('click', async () => {
          try {
            await createSavingsGoal(appStore.db, {
              name: backdrop.querySelector('#ng-name').value,
              targetAmount: parseAmountInput(backdrop.querySelector('#ng-target').value),
              currentAmount: parseAmountInput(backdrop.querySelector('#ng-cur').value),
              walletId: backdrop.querySelector('#ng-wallet').value || null
            });
            close();
            await appStore.refresh();
            showToast('Target tabungan dibuat.');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    }
  );
}
