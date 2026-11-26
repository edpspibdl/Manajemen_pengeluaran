import { esc } from '../utils/dom.js';
import { formatIDR, parseAmountInput } from '../utils/currency.js';
import { completeOnboarding } from '../services/OnboardingService.js';
import { appStore } from '../store/appStore.js';
import { showToast } from '../components/Modal.js';

const obDraft = {
  name: '',
  monthlyIncome: 0,
  incomeDay: new Date().getDate(),
  bills: [
    { name: 'Bayar Kos', amount: 0, dueDay: 1, categoryId: 'cat-exp-kos' },
    { name: 'Listrik', amount: 0, dueDay: 5, categoryId: 'cat-exp-kos' },
    { name: 'Kuota / Internet', amount: 0, dueDay: 10, categoryId: 'cat-exp-internet' }
  ],
  monthlyFoodBudget: 300000
};

export function renderOnboardingPage() {
  const totalBills = obDraft.bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const leftover = (Number(obDraft.monthlyIncome) || 0) - totalBills - (Number(obDraft.monthlyFoodBudget) || 0);

  return `
    <div class="page-content page-content--no-nav" style="padding-top:calc(28px + var(--safe-top))">
      <div style="margin-bottom:18px">
        <span class="section-head__eyebrow">Selamat Datang di KosMate</span>
        <h1 class="section-head__title" style="font-size:23px">Atur Keuangan Simpel</h1>
      </div>

      <div class="card">
        <div class="grid-2" style="margin-bottom:12px">
          <div class="field" style="margin-bottom:0">
            <label class="field__label">Nama Panggilan</label>
            <input id="ob-name" class="input" type="text" value="${esc(obDraft.name)}" placeholder="Mis. Budi" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label class="field__label">Tanggal Gajian</label>
            <input id="ob-day" class="input tabular-nums" type="number" min="1" max="31" value="${obDraft.incomeDay}" />
          </div>
        </div>

        <div class="field" style="margin-bottom:0">
          <label class="field__label">Gaji / Pemasukan Sebulan (Rp)</label>
          <input id="ob-income" class="input input--hero tabular-nums" type="tel" inputmode="numeric" value="${obDraft.monthlyIncome > 0 ? obDraft.monthlyIncome.toLocaleString('id-ID') : ''}" placeholder="2.000.000" />
        </div>
      </div>

      <div class="card">
        <div class="section-head" style="margin-bottom:8px">
          <strong style="color:var(--forest-dark);font-size:15px">Tanggungan Rutin Sebulan</strong>
          <button type="button" class="link-emerald" id="ob-add-bill">+ Tambah</button>
        </div>

        ${obDraft.bills
          .map(
            (b, idx) => `
            <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:8px;margin-bottom:8px">
              <input class="input" data-ob-bname="${idx}" value="${esc(b.name)}" placeholder="Nama tanggungan" style="padding:9px 11px" />
              <input class="input tabular-nums" data-ob-bamt="${idx}" type="tel" inputmode="numeric" value="${b.amount > 0 ? b.amount.toLocaleString('id-ID') : ''}" placeholder="Rp 0" style="padding:9px 11px" />
            </div>`
          )
          .join('')}
      </div>

      <div class="card">
        <div class="field" style="margin-bottom:0">
          <label class="field__label">Uang Makan Sebulan (Rp)</label>
          <input id="ob-food" class="input input--hero tabular-nums" type="tel" inputmode="numeric" value="${obDraft.monthlyFoodBudget > 0 ? obDraft.monthlyFoodBudget.toLocaleString('id-ID') : ''}" placeholder="300.000" />
        </div>
      </div>

      <div id="ob-summary-line" style="text-align:center;font-size:13px;color:var(--text-muted);margin:4px 0 14px">
        Sisa uang di luar tanggungan &amp; makan:
        <strong class="tabular-nums" style="color:${leftover < 0 ? 'var(--danger)' : 'var(--forest-dark)'}">${formatIDR(leftover)}</strong>
      </div>

      <button type="button" class="btn btn--primary btn--full" id="ob-submit">Mulai KosMate</button>
    </div>
  `;
}

export function bindOnboardingHandlers(container, rerender) {
  const refreshSummaryLine = () => {
    const totalBills = obDraft.bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    const leftover = (Number(obDraft.monthlyIncome) || 0) - totalBills - (Number(obDraft.monthlyFoodBudget) || 0);
    const line = container.querySelector('#ob-summary-line');
    if (line) {
      line.innerHTML = `Sisa uang di luar tanggungan &amp; makan: <strong class="tabular-nums" style="color:${leftover < 0 ? 'var(--danger)' : 'var(--forest-dark)'}">${formatIDR(leftover)}</strong>`;
    }
  };

  container.querySelector('#ob-name')?.addEventListener('input', (e) => {
    obDraft.name = e.target.value;
  });

  container.querySelector('#ob-day')?.addEventListener('change', (e) => {
    obDraft.incomeDay = Math.max(1, Math.min(31, Number(e.target.value) || 1));
  });

  const incomeEl = container.querySelector('#ob-income');
  incomeEl?.addEventListener('input', () => {
    obDraft.monthlyIncome = parseAmountInput(incomeEl.value);
    incomeEl.value = obDraft.monthlyIncome > 0 ? obDraft.monthlyIncome.toLocaleString('id-ID') : '';
    refreshSummaryLine();
  });

  const foodEl = container.querySelector('#ob-food');
  foodEl?.addEventListener('input', () => {
    obDraft.monthlyFoodBudget = parseAmountInput(foodEl.value);
    foodEl.value = obDraft.monthlyFoodBudget > 0 ? obDraft.monthlyFoodBudget.toLocaleString('id-ID') : '';
    refreshSummaryLine();
  });

  container.querySelectorAll('[data-ob-bname]').forEach((el) => {
    el.addEventListener('input', () => {
      obDraft.bills[Number(el.getAttribute('data-ob-bname'))].name = el.value;
    });
  });

  container.querySelectorAll('[data-ob-bamt]').forEach((el) => {
    el.addEventListener('input', () => {
      const idx = Number(el.getAttribute('data-ob-bamt'));
      const val = parseAmountInput(el.value);
      obDraft.bills[idx].amount = val;
      el.value = val > 0 ? val.toLocaleString('id-ID') : '';
      refreshSummaryLine();
    });
  });

  container.querySelector('#ob-add-bill')?.addEventListener('click', () => {
    obDraft.bills.push({ name: '', amount: 0, dueDay: 15, categoryId: 'cat-exp-other' });
    rerender();
  });

  container.querySelector('#ob-submit')?.addEventListener('click', async () => {
    try {
      const cleanName = obDraft.name.trim() || 'Anak Kos';
      const activeBills = obDraft.bills.filter((b) => b.name.trim() && b.amount > 0);
      await completeOnboarding(appStore.db, {
        name: cleanName,
        budgetPeriod: 'monthly',
        incomeDay: obDraft.incomeDay,
        monthlyIncome: obDraft.monthlyIncome,
        monthlyFoodBudget: obDraft.monthlyFoodBudget,
        treatMealsPerWeek: 3,
        minDailyCalories: 1900,
        cookingEquipment: ['none', 'rice_cooker'],
        wallets: [{ name: 'Dompet Utama', walletType: 'bank', balance: obDraft.monthlyIncome }],
        recurringBills: activeBills
      });
      await appStore.refresh();
      showToast('Siap! Keuangan kos sudah tersusun rapi.');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan pengaturan awal.', 'error');
    }
  });
}
