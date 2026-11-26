import { iconSvg } from '../components/Icons.js';
import { renderSubHeader } from '../components/TopBar.js';
import { mountCategoryPieChart, mountMonthlySpendingBarChart } from '../components/Charts.js';
import { showToast } from '../components/Modal.js';
import { esc } from '../utils/dom.js';
import { formatIDR, splitHeroIDR } from '../utils/currency.js';
import { toDateString } from '../utils/date.js';
import { exportTextFile } from '../services/BackupService.js';
import { exportTransactionsCsv } from '../services/ReportService.js';
import { appStore } from '../store/appStore.js';

let analysisMode = 'spending'; // 'spending' | 'savings' | 'meal'
let savingsFilter = 'all'; // 'all' | 'achieved' | 'in_progress'

export function renderAnalisisPage(state) {
  const { summary, categoryBreakdown, monthlySeries, savingsGoals, mealAnalytics, budgets } = state;

  let modeContent = '';

  if (analysisMode === 'spending') {
    const items = categoryBreakdown?.items || [];
    const avgDaily = summary?.totalDays
      ? Math.round((summary.periodExpense || 0) / Math.max(1, summary.totalDays - summary.remainingDays + 1))
      : 0;
    const estEndBalance =
      avgDaily > 0 ? summary.availableOperationalCash - avgDaily * summary.remainingDays : summary.availableOperationalCash;

    modeContent = `
      <div class="card">
        <div class="section-head">
          <div>
            <span class="section-head__eyebrow">Distribusi Pengeluaran Periode Ini</span>
            <h3 class="section-head__title">Komposisi Kategori</h3>
          </div>
          <span class="tabular-nums" style="font-weight:800;color:var(--forest-dark)">${formatIDR(categoryBreakdown?.grandTotal || 0)}</span>
        </div>

        ${
          items.length === 0
            ? '<div class="empty-state">Belum ada pengeluaran tercatat di periode aktif untuk ditampilkan pada grafik.</div>'
            : `<div class="chart-box chart-box--pie"><canvas id="analysis-pie"></canvas></div>
               <div style="margin-top:8px">
                 ${items
                   .map(
                     (item) => `
                     <div class="list-row">
                       <div class="list-row__left">
                         <span style="width:10px;height:10px;border-radius:50%;background:${esc(item.color)};display:inline-block;flex-shrink:0"></span>
                         <div class="list-row__title">${esc(item.name)}</div>
                       </div>
                       <div class="tabular-nums" style="font-weight:700;font-size:13.5px">
                         ${formatIDR(item.total)} <span style="color:var(--text-muted);font-weight:600">(${item.percentage}%)</span>
                       </div>
                     </div>`
                   )
                   .join('')}
               </div>`
        }
      </div>

      <div class="card">
        <div class="section-head">
          <div>
            <span class="section-head__eyebrow">Tren 6 Bulan Terakhir</span>
            <h3 class="section-head__title">Pemasukan &amp; Pengeluaran</h3>
          </div>
          <button class="btn btn--soft btn--sm" id="btn-export-csv">${iconSvg('download', 15)} CSV</button>
        </div>
        <div class="grid-2" style="margin-bottom:10px">
          <div class="mini-stat" style="margin:0;box-shadow:none;background:var(--bg-cream)">
            <div class="mini-stat__label">Pemasukan Periode</div>
            <div class="mini-stat__value tabular-nums" style="color:var(--emerald)">${formatIDR(summary.periodIncome)}</div>
          </div>
          <div class="mini-stat" style="margin:0;box-shadow:none;background:var(--bg-cream)">
            <div class="mini-stat__label">Pengeluaran Periode</div>
            <div class="mini-stat__value tabular-nums">${formatIDR(summary.periodExpense)}</div>
          </div>
        </div>
        <div class="chart-box"><canvas id="analysis-bar"></canvas></div>
      </div>

      <div class="alert-card alert-card--info">
        <div>
          <strong>Proyeksi Sisa Saldo Akhir Periode (Estimasi)</strong>
          <div style="font-size:12.5px;margin-top:3px">
            Berdasarkan rata-rata belanja ${formatIDR(avgDaily)}/hari, perkiraan saldo operasional di akhir periode adalah
            <strong>${formatIDR(estEndBalance)} (Estimasi)</strong>.
          </div>
        </div>
      </div>
    `;
  } else if (analysisMode === 'savings') {
    const totalSavings = (summary?.lockedSavingsBalance || 0) +
      (savingsGoals || [])
        .filter((g) => !g.wallet_id)
        .reduce((acc, g) => acc + (g.effective_current_amount || 0), 0);

    const hero = splitHeroIDR(totalSavings);
    let filteredGoals = savingsGoals || [];
    if (savingsFilter === 'achieved') filteredGoals = filteredGoals.filter((g) => g.is_achieved);
    else if (savingsFilter === 'in_progress') filteredGoals = filteredGoals.filter((g) => !g.is_achieved);

    modeContent = `
      <div style="padding:4px 0 8px">
        <div style="font-size:13px;color:var(--text-muted)">Total</div>
        <div style="font-size:16px;font-weight:800;color:var(--forest-dark)">Tabungan Terkumpul</div>
        <div class="hero-savings tabular-nums">
          <span class="hero-savings__prefix">${hero.prefix}</span>${hero.whole}
        </div>
      </div>

      <div class="section-head">
        <div>
          <span class="section-head__eyebrow">Snapshot</span>
          <h3 class="section-head__title">Tabungan</h3>
        </div>
        <select class="select-pill" id="sav-filter">
          <option value="all" ${savingsFilter === 'all' ? 'selected' : ''}>Filter: Semua</option>
          <option value="achieved" ${savingsFilter === 'achieved' ? 'selected' : ''}>Target Tercapai</option>
          <option value="in_progress" ${savingsFilter === 'in_progress' ? 'selected' : ''}>Sedang Berjalan</option>
        </select>
      </div>

      <div class="card card--airy">
        ${
          filteredGoals.length === 0
            ? '<div class="empty-state">Belum ada target tabungan sesuai filter ini.</div>'
            : filteredGoals
                .map(
                  (g) => `
                  <div class="list-row">
                    <div>
                      ${g.is_achieved ? `<div style="margin-bottom:4px"><span class="gold-badge">${iconSvg('bell', 11)} Target Tercapai</span></div>` : ''}
                      <div class="list-row__title" style="font-size:16px">${esc(g.name)}</div>
                      <div class="list-row__sub">Target ${formatIDR(g.target_amount)} (${g.progress_pct}%)</div>
                    </div>
                    <div class="list-row__amount tabular-nums">${formatIDR(g.effective_current_amount)}</div>
                  </div>`
                )
                .join('')
        }
      </div>
    `;
  } else {
    const ma = mealAnalytics || {
      consumedCount: 0,
      estimatedConsumedTotal: 0,
      actualConsumedTotal: 0,
      totalFoodTransactions: 0,
      averageDailyFoodSpend: 0
    };
    modeContent = `
      <div class="grid-2">
        <div class="mini-stat">
          <div class="mini-stat__label">Total Belanja Makan</div>
          <div class="mini-stat__value tabular-nums">${formatIDR(ma.totalFoodTransactions)}</div>
          <div class="mini-stat__sub">Rata-rata ${formatIDR(ma.averageDailyFoodSpend)}/hari aktif</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat__label">Menu Terselesaikan</div>
          <div class="mini-stat__value tabular-nums">${ma.consumedCount} Porsi</div>
          <div class="mini-stat__sub">Est: ${formatIDR(ma.estimatedConsumedTotal)} • Aktual: ${formatIDR(ma.actualConsumedTotal)}</div>
        </div>
      </div>

      <div class="card">
        <h3 class="section-head__title" style="margin-bottom:10px">Realisasi vs Anggaran Kategori</h3>
        ${
          (budgets || []).length === 0
            ? '<div class="empty-state">Belum ada batas anggaran kategori yang diatur.</div>'
            : budgets
                .map((b) => {
                  const pct = b.amount > 0 ? Math.round((b.spent_amount / b.amount) * 100) : 0;
                  return `
                    <div class="list-row" style="display:block">
                      <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:5px">
                        <strong>${esc(b.category_name)}</strong>
                        <span class="tabular-nums">${formatIDR(b.spent_amount)} / ${formatIDR(b.amount)} (${pct}%)</span>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill ${pct >= 100 ? 'progress-fill--danger' : pct >= 85 ? 'progress-fill--warning' : ''}" style="width:${Math.min(100, pct)}%"></div>
                      </div>
                    </div>`;
                })
                .join('')
        }
      </div>
    `;
  }

  return `
    <div class="page-content">
      ${renderSubHeader({ eyebrow: 'Periode & Keseluruhan', title: 'Analisis', backAction: 'go-home' })}

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <select id="analysis-mode-select" class="select-pill" style="font-size:15px;font-weight:800;border:none;background-color:transparent;padding-left:0">
          <option value="spending" ${analysisMode === 'spending' ? 'selected' : ''}>Ringkasan Pengeluaran</option>
          <option value="savings" ${analysisMode === 'savings' ? 'selected' : ''}>Ringkasan Tabungan</option>
          <option value="meal" ${analysisMode === 'meal' ? 'selected' : ''}>Analisis Makan &amp; Budget</option>
        </select>
      </div>

      ${modeContent}
      <input type="hidden" value="${esc(JSON.stringify(monthlySeries || []))}" />
    </div>
  `;
}

export function bindAnalisisHandlers(container, rerender) {
  const { state, db } = appStore;

  container.querySelector('[data-action="go-home"]')?.addEventListener('click', () => {
    appStore.setState({ activeTab: 'home', subView: null });
  });

  container.querySelector('#analysis-mode-select')?.addEventListener('change', (e) => {
    analysisMode = e.target.value;
    rerender();
  });

  container.querySelector('#sav-filter')?.addEventListener('change', (e) => {
    savingsFilter = e.target.value;
    rerender();
  });

  container.querySelector('#btn-export-csv')?.addEventListener('click', async () => {
    try {
      const csv = await exportTransactionsCsv(db, state.summary?.period?.start_date, state.summary?.period?.end_date);
      await exportTextFile(`kosmate-laporan-${toDateString()}.csv`, csv, 'text/csv');
      showToast('Laporan CSV berhasil diekspor.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  if (analysisMode === 'spending') {
    const pieCanvas = container.querySelector('#analysis-pie');
    if (pieCanvas && (state.categoryBreakdown?.items || []).length > 0) {
      mountCategoryPieChart(pieCanvas, state.categoryBreakdown.items);
    }
    const barCanvas = container.querySelector('#analysis-bar');
    if (barCanvas) {
      mountMonthlySpendingBarChart(barCanvas, state.monthlySeries || []);
    }
  }
}
