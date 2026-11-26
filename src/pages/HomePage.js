import { iconSvg } from '../components/Icons.js';
import { renderCircularGauge } from '../components/CircularGauge.js';
import { mountMonthlySpendingBarChart } from '../components/Charts.js';
import { openQuickAddSheet } from '../components/QuickAddSheet.js';
import { openLogFoodSheet } from '../components/LogFoodSheet.js';
import { esc } from '../utils/dom.js';
import { formatIDR } from '../utils/currency.js';
import { appStore } from '../store/appStore.js';

export function renderHomePage(state) {
  const { summary } = state;
  const statusClass = `status-pill--${String(summary.healthStatus || 'aman').toLowerCase()}`;
  const gaugeDisplayAmount = Math.max(0, summary.remainingDailyToday);
  const freeMoney = summary.foodBudgetMode === 'fixed' ? summary.nonFoodSafeToSpend : summary.safeToSpend;

  return `
    <div class="page-content">
      ${renderCircularGauge({
        amount: gaugeDisplayAmount,
        totalBase: summary.baseDailyBudgetToday,
        eyebrow: summary.remainingDailyToday < 0 ? 'Budget Hari Ini Habis' : 'Budget Hari Ini',
        subPrefix: 'dari jatah harian',
        healthStatus: summary.healthStatus
      })}

      <div style="text-align:center;margin:-6px 0 14px">
        <span class="status-pill ${statusClass}">● ${esc(summary.healthStatus)}</span>
      </div>

      <div class="circle-actions-row" style="margin:0 0 16px;gap:38px">
        <button class="circle-action" id="home-add-expense">
          <span class="circle-action__btn">${iconSvg('plus', 19)}</span>
          <span>Tambah Pengeluaran</span>
        </button>
        <button class="circle-action" id="home-add-food">
          <span class="circle-action__btn" style="background:var(--emerald)">${iconSvg('utensils', 18)}</span>
          <span>Catat Beli Makan</span>
        </button>
      </div>

      <div class="card" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;padding:13px 10px">
        <div data-home-go="tagihan" style="cursor:pointer">
          <div style="font-size:11px;color:var(--text-muted)">Tanggungan</div>
          <div class="tabular-nums" style="font-size:13.5px;font-weight:800;color:var(--forest-dark);margin-top:2px">
            ${formatIDR(summary.unpaidObligations)}
          </div>
        </div>
        <div data-home-go="makanan" style="cursor:pointer;border-left:1px solid var(--border-subtle);border-right:1px solid var(--border-subtle)">
          <div style="font-size:11px;color:var(--text-muted)">Sisa Makan</div>
          <div class="tabular-nums" style="font-size:13.5px;font-weight:800;color:var(--emerald);margin-top:2px">
            ${formatIDR(summary.foodBudgetMode === 'fixed' ? summary.remainingFoodPool : summary.remainingFoodToday)}
          </div>
        </div>
        <div data-home-go="keuangan" style="cursor:pointer">
          <div style="font-size:11px;color:var(--text-muted)">${summary.foodBudgetMode === 'fixed' ? 'Uang Bebas' : 'Dana Aman'}</div>
          <div class="tabular-nums" style="font-size:13.5px;font-weight:800;color:${freeMoney < 0 ? 'var(--danger)' : 'var(--forest-dark)'};margin-top:2px">
            ${formatIDR(freeMoney)}
          </div>
        </div>
      </div>

      <div class="card card--airy" style="margin-top:8px">
        <div class="section-head">
          <div>
            <span class="section-head__eyebrow">Ringkasan Bulanan</span>
            <h3 class="section-head__title">Pengeluaran</h3>
          </div>
        </div>
        <div class="chart-box">
          <canvas id="home-spending-bar"></canvas>
        </div>
        <div style="text-align:right;margin-top:8px">
          <button class="link-emerald" data-home-go="analisis">Analisis Pengeluaran &raquo;</button>
        </div>
      </div>
    </div>
  `;
}

export function bindHomeHandlers(container) {
  const { state } = appStore;
  const barCanvas = container.querySelector('#home-spending-bar');
  if (barCanvas) {
    mountMonthlySpendingBarChart(barCanvas, state.monthlySeries || []);
  }

  container.querySelector('#home-add-expense')?.addEventListener('click', () => {
    openQuickAddSheet({ defaultType: 'expense' });
  });
  container.querySelector('#home-add-food')?.addEventListener('click', () => {
    openLogFoodSheet();
  });

  container.querySelectorAll('[data-home-go]').forEach((el) => {
    el.addEventListener('click', () => {
      const target = el.getAttribute('data-home-go');
      if (target === 'tagihan') {
        appStore.setState({ activeTab: 'keuangan', subView: null, keuanganSegment: 'tagihan' });
      } else {
        appStore.setState({ activeTab: target, subView: null });
      }
    });
  });
}
