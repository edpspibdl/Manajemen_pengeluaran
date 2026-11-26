import { iconSvg } from '../components/Icons.js';
import { openOverlay, showToast } from '../components/Modal.js';
import { openLogFoodSheet } from '../components/LogFoodSheet.js';
import { openQuickAddSheet } from '../components/QuickAddSheet.js';
import { EQUIPMENT_LABELS, esc, FOOD_CATEGORY_LABELS, MEAL_TYPE_LABELS } from '../utils/dom.js';
import { formatIDR, parseAmountInput } from '../utils/currency.js';
import { formatDayMonthID, getDayNameID, toDateString } from '../utils/date.js';
import {
  consumeMealPlan,
  createCustomFoodItem,
  resetFoodPrice,
  toggleFoodFavorite,
  updateFoodPrice,
  upsertMealPlanSlot
} from '../repositories/foodRepo.js';
import { updateFinancialCycleSettings } from '../services/PeriodService.js';
import { generateMealPlanRange, recommendForSlot } from '../services/FoodRecommender.js';
import { appStore } from '../store/appStore.js';

let catalogSearch = '';
let catalogFilter = 'all';

export function renderMakananPage(state) {
  const seg = state.makananSegment || 'hari_ini';
  const summary = state.summary;
  const todayStr = toDateString();
  const plansToday = state.mealPlansToday || [];
  const planBySlot = new Map(plansToday.map((p) => [p.meal_type, p]));

  const todayFoodTxs = (state.transactions || []).filter(
    (t) => t.type === 'expense' && t.category_id === 'cat-exp-food' && t.transaction_date.slice(0, 10) === todayStr
  );

  let bodyHtml = '';

  if (seg === 'hari_ini') {
    bodyHtml = `
      <div class="card">
        <div class="section-head" style="margin-bottom:4px">
          <div>
            <span class="section-head__eyebrow">Pengeluaran Makan Hari Ini (${formatIDR(summary.todayFoodExpense)})</span>
            <h3 class="section-head__title" style="font-size:16px">Sudah Dimakan Hari Ini</h3>
          </div>
          <button class="btn btn--emerald btn--sm" id="btn-log-food-inline">+ Catat</button>
        </div>
        ${
          todayFoodTxs.length === 0
            ? '<div class="empty-state" style="padding:14px 8px">Belum ada catatan makan hari ini. Ketuk <strong>+ Input Beli Makan</strong> untuk mencatat makanan &amp; nominalmu.</div>'
            : todayFoodTxs
                .map(
                  (t) => `
                  <div class="list-row" data-edit-food-tx="${t.id}" style="cursor:pointer">
                    <div style="min-width:0">
                      <div class="list-row__title">
                        ${esc(t.description || 'Makan')}
                        ${t.is_treat_meal ? '<span class="gold-badge" style="margin-left:5px;padding:2px 6px;font-size:10px">Makan Enak</span>' : ''}
                      </div>
                      <div class="list-row__sub">
                        ${t.meal_slot ? MEAL_TYPE_LABELS[t.meal_slot] : 'Makan'} ${t.calories ? `• ${t.calories} kkal` : ''} • ${esc(t.wallet_name)}
                      </div>
                    </div>
                    <div class="list-row__amount tabular-nums">${formatIDR(t.amount)}</div>
                  </div>`
                )
                .join('')
        }
      </div>

      <div class="card">
        <div class="section-head" style="margin-bottom:6px">
          <div>
            <span class="section-head__eyebrow">Rekomendasi Masuk Target &amp; Jaga BB</span>
            <h3 class="section-head__title" style="font-size:16px">Saran Menu Hari Ini</h3>
          </div>
          <button class="link-emerald" id="btn-gen-daily">Acak Menu</button>
        </div>

        ${
          plansToday.length === 0
            ? '<div class="empty-state" style="padding:12px 8px">Ketuk <strong>Acak Menu</strong> jika butuh ide menu hemat yang sesuai target kalori.</div>'
            : ['breakfast', 'lunch', 'dinner', 'snack']
                .map((slot) => {
                  const plan = planBySlot.get(slot);
                  if (!plan) return '';
                  const isConsumed = plan.status === 'consumed';
                  return `
                    <div class="list-row">
                      <div style="min-width:0;flex:1">
                        <div class="list-row__sub">${MEAL_TYPE_LABELS[slot]} ${plan.calories ? `• ${plan.calories} kkal` : ''}</div>
                        <div class="list-row__title">${esc(plan.food_name)}</div>
                      </div>
                      <div style="text-align:right;display:flex;align-items:center;gap:6px">
                        <span class="tabular-nums" style="font-weight:800;font-size:13.5px">${formatIDR(plan.actual_cost ?? plan.estimated_cost)}</span>
                        ${
                          isConsumed
                            ? '<span class="status-pill status-pill--aman" style="font-size:10.5px;padding:2px 7px">✓</span>'
                            : `<button class="btn btn--soft btn--sm" data-pick-slot="${slot}" style="padding:5px 8px">${iconSvg('swap', 13)}</button>
                               <button class="btn btn--emerald btn--sm" data-consume-paid="${plan.id}" style="padding:5px 9px;font-size:11.5px">Catat</button>`
                        }
                      </div>
                    </div>`;
                })
                .join('')
        }
      </div>
    `;
  } else if (seg === 'mingguan') {
    const weekPlans = state.mealPlansWeek || [];
    const grouped = new Map();
    for (const p of weekPlans) {
      if (!grouped.has(p.meal_date)) grouped.set(p.meal_date, []);
      grouped.get(p.meal_date).push(p);
    }

    bodyHtml = `
      <button class="btn btn--primary btn--full" id="btn-gen-weekly" style="margin-bottom:12px">
        Generate Rencana Makan 7 Hari
      </button>
      ${
        grouped.size === 0
          ? '<div class="card"><div class="empty-state">Ketuk tombol di atas untuk membuat jadwal makan 7 hari (termasuk 3x Makan Enak).</div></div>'
          : Array.from(grouped.entries())
              .map(([dateStr, items]) => {
                const dayTotal = items.reduce((s, x) => s + (x.actual_cost ?? x.estimated_cost ?? 0), 0);
                return `
                  <div class="card">
                    <div class="section-head" style="margin-bottom:6px">
                      <strong style="color:var(--forest-dark)">${getDayNameID(dateStr)}, ${formatDayMonthID(dateStr)} ${dateStr === todayStr ? '(Hari Ini)' : ''}</strong>
                      <span class="tabular-nums" style="font-weight:800;color:var(--emerald)">${formatIDR(dayTotal)}</span>
                    </div>
                    ${items
                      .map(
                        (i) => `
                        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12.5px;border-top:1px solid var(--border-subtle)">
                          <span><strong>${MEAL_TYPE_LABELS[i.meal_type]}:</strong> ${esc(i.food_name)}</span>
                          <span class="tabular-nums">${formatIDR(i.actual_cost ?? i.estimated_cost)}</span>
                        </div>`
                      )
                      .join('')}
                  </div>`;
              })
              .join('')
      }
    `;
  } else {
    let foods = state.foodItems || [];
    if (catalogFilter === 'favorite') foods = foods.filter((f) => f.is_favorite === 1);
    else if (catalogFilter !== 'all') foods = foods.filter((f) => f.food_category === catalogFilter);
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase();
      foods = foods.filter((f) => f.name.toLowerCase().includes(q));
    }

    bodyHtml = `
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="food-search" class="input" type="search" value="${esc(catalogSearch)}" placeholder="Cari menu atau bahan..." style="padding:9px 12px" />
        <button class="btn btn--primary btn--sm" id="btn-add-food">+ Menu</button>
      </div>
      <div class="chip-row" style="margin-bottom:12px">
        ${[
          ['all', 'Semua'],
          ['favorite', 'Favorit'],
          ['super_hemat', 'Super Hemat'],
          ['hemat', 'Hemat'],
          ['normal', 'Normal']
        ]
          .map(
            ([val, lbl]) =>
              `<button class="chip ${catalogFilter === val ? 'chip--active' : ''}" data-food-filter="${val}">${lbl}</button>`
          )
          .join('')}
      </div>

      <div class="card">
        ${foods
          .map(
            (f) => `
            <div class="list-row">
              <div class="list-row__left">
                <button data-fav-food="${f.id}" style="color:${f.is_favorite ? '#E11D48' : '#CBD5E1'}">
                  ${iconSvg('heart', 18)}
                </button>
                <div style="min-width:0">
                  <div class="list-row__title">${esc(f.name)}</div>
                  <div class="list-row__sub">
                    ${FOOD_CATEGORY_LABELS[f.food_category]} • ${f.calories || '-'} kkal • ${esc(EQUIPMENT_LABELS[f.required_equipment] || 'Beli')}
                  </div>
                </div>
              </div>
              <button class="list-row__amount tabular-nums" data-edit-price="${f.id}" style="text-decoration:underline dotted">
                ${formatIDR(f.estimated_price)}
              </button>
            </div>`
          )
          .join('')}
      </div>
    `;
  }

  return `
    <div class="page-content">
      <div class="card" style="background:var(--forest-dark);color:#fff;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div>
            <div style="font-size:11.5px;opacity:0.8">
              ${summary.foodBudgetMode === 'fixed' ? `Sisa Uang Makan (${summary.remainingDays} hari lagi)` : 'Target Makan Hari Ini'}
            </div>
            <div class="tabular-nums" style="font-size:25px;font-weight:800;margin-top:2px">
              ${summary.foodBudgetMode === 'fixed' ? formatIDR(summary.remainingFoodPool) : formatIDR(summary.remainingFoodToday)}
            </div>
            <div style="font-size:12px;opacity:0.85;margin-top:3px">
              Target hari ini: <strong>${formatIDR(summary.dailyFoodBudget)}</strong>
              ${summary.foodBudgetMode === 'fixed' ? ` • Besok+: <strong>${formatIDR(summary.nextDayFlatFoodTarget)}/hr</strong>` : ''}
            </div>
          </div>
          <button class="btn btn--sm" id="btn-edit-food-target" style="background:rgba(255,255,255,0.16);color:#fff;font-size:11.5px">
            ${iconSvg('edit', 14)} Ubah
          </button>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.16);font-size:11.5px;gap:6px;flex-wrap:wrap">
          <span>
            Biasa: <strong>${formatIDR(summary.regularDayFoodTarget)}</strong> • Enak: <strong style="color:#FDE68A">${formatIDR(summary.treatDayFoodTarget)}</strong>
          </span>
          <span>
            Kalori: <strong>${summary.todayCalories}/${summary.minDailyCalories}</strong> kkal
          </span>
        </div>

        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn--emerald btn--full" id="btn-log-food-manual">+ Input Beli Makan</button>
          <button class="btn btn--sm" id="btn-toggle-treat-day" style="background:${summary.isTodayTreatDay ? 'var(--gold)' : 'rgba(255,255,255,0.15)'};color:#fff;white-space:nowrap">
            ${summary.isTodayTreatDay ? '★ Makan Enak' : 'Hari Biasa'} (${summary.treatMealsUsedThisWeek}/${summary.treatMealsPerWeek})
          </button>
        </div>
      </div>

      <div class="segmented-bar">
        ${[
          ['hari_ini', 'Hari Ini'],
          ['mingguan', 'Planner 7 Hari'],
          ['katalog', 'Daftar Menu']
        ]
          .map(
            ([id, label]) =>
              `<button class="seg-btn ${seg === id ? 'seg-btn--active' : ''}" data-food-seg="${id}">${label}</button>`
          )
          .join('')}
      </div>

      ${bodyHtml}
    </div>
  `;
}

export function bindMakananHandlers(container, rerender) {
  const { state, db } = appStore;
  const todayStr = toDateString();

  container.querySelector('#btn-log-food-manual')?.addEventListener('click', () => openLogFoodSheet());
  container.querySelector('#btn-log-food-inline')?.addEventListener('click', () => openLogFoodSheet());
  container.querySelector('#btn-edit-food-target')?.addEventListener('click', () => openFoodTargetModal());

  container.querySelector('#btn-toggle-treat-day')?.addEventListener('click', async () => {
    await appStore.refresh({ todayTreatMode: !state.summary?.isTodayTreatDay });
  });

  container.querySelectorAll('[data-edit-food-tx]').forEach((el) => {
    el.addEventListener('click', () => {
      const tx = state.transactions.find((t) => t.id === el.getAttribute('data-edit-food-tx'));
      if (tx) openQuickAddSheet({ editTx: tx });
    });
  });

  container.querySelectorAll('[data-food-seg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      appStore.setState({ makananSegment: btn.getAttribute('data-food-seg') });
    });
  });

  container.querySelector('#btn-gen-daily')?.addEventListener('click', async () => {
    await generateMealPlanRange(db, { startDate: todayStr, days: 1, budgetSummary: state.summary });
    await appStore.refresh();
    showToast('Saran menu harian diperbarui.');
  });

  container.querySelector('#btn-gen-weekly')?.addEventListener('click', async () => {
    await generateMealPlanRange(db, { startDate: todayStr, days: 7, budgetSummary: state.summary });
    await appStore.refresh();
    showToast('Rencana makan 7 hari dibuat!');
  });

  container.querySelectorAll('[data-pick-slot]').forEach((btn) => {
    btn.addEventListener('click', () => openSwapMealSheet(btn.getAttribute('data-pick-slot')));
  });

  container.querySelectorAll('[data-consume-paid]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = state.mealPlansToday.find((m) => m.id === btn.getAttribute('data-consume-paid'));
      if (plan) openConsumeMealSheet(plan);
    });
  });

  container.querySelector('#food-search')?.addEventListener('input', (e) => {
    catalogSearch = e.target.value;
    rerender();
  });
  container.querySelectorAll('[data-food-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      catalogFilter = btn.getAttribute('data-food-filter');
      rerender();
    });
  });
  container.querySelectorAll('[data-fav-food]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await toggleFoodFavorite(db, btn.getAttribute('data-fav-food'));
      await appStore.refresh();
    });
  });
  container.querySelectorAll('[data-edit-price]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const food = state.foodItems.find((f) => f.id === btn.getAttribute('data-edit-price'));
      if (food) openEditFoodPriceSheet(food);
    });
  });
  container.querySelector('#btn-add-food')?.addEventListener('click', () => openAddCustomFoodSheet());
}

async function openSwapMealSheet(slot) {
  const { state, db } = appStore;
  const todayStr = toDateString();
  const slotBudget = state.summary?.slotBudgets?.[slot] || 15000;
  const options = await recommendForSlot(db, {
    mealDate: todayStr,
    mealType: slot,
    slotBudget: Math.max(slotBudget, Math.min(state.summary.remainingFoodToday, slotBudget + 3000)),
    healthStatus: state.summary?.healthStatus || 'Aman',
    isTreatSlot: Boolean(state.summary?.isTodayTreatDay)
  });

  openOverlay(
    `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <div class="section-head">
        <div>
          <span class="section-head__eyebrow">Rekomendasi ${MEAL_TYPE_LABELS[slot]}</span>
          <h3 class="section-head__title">Pilih Menu</h3>
        </div>
        <button class="btn btn--soft btn--sm" data-close-swap>Tutup</button>
      </div>
      ${
        options.length === 0
          ? '<div class="empty-state">Tidak ada menu yang cocok dengan pantangan & alat masakmu.</div>'
          : options
              .slice(0, 10)
              .map(
                (f) => `
                <div class="list-row" style="cursor:pointer" data-choose-food="${f.id}" data-choose-price="${f.estimated_price}">
                  <div style="min-width:0;flex:1">
                    <div class="list-row__title">${esc(f.name)}</div>
                    <div class="list-row__sub">${esc(f.reason)}</div>
                  </div>
                  <div class="list-row__amount tabular-nums" style="color:${f.overBudget ? 'var(--warning)' : 'var(--emerald)'}">
                    ${formatIDR(f.estimated_price)}
                  </div>
                </div>`
              )
              .join('')
      }
    </div>`,
    {
      onMount: (backdrop, close) => {
        backdrop.querySelector('[data-close-swap]').addEventListener('click', close);
        backdrop.querySelectorAll('[data-choose-food]').forEach((row) => {
          row.addEventListener('click', async () => {
            await upsertMealPlanSlot(db, {
              mealDate: todayStr,
              mealType: slot,
              foodItemId: row.getAttribute('data-choose-food'),
              estimatedCost: Number(row.getAttribute('data-choose-price'))
            });
            close();
            await appStore.refresh();
            showToast('Menu diperbarui.');
          });
        });
      }
    }
  );
}

function openConsumeMealSheet(plan) {
  const opWallets = (appStore.state.wallets || []).filter((w) => w.include_in_daily_budget === 1);
  const wallets = opWallets.length > 0 ? opWallets : appStore.state.wallets || [];
  openOverlay(
    `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <h3 style="margin:0 0 12px;color:var(--forest-dark)">Catat Makan: ${esc(plan.food_name)}</h3>
      <div class="field">
        <label class="field__label">Pengeluaran Aktual (Rp)</label>
        <input id="cm-cost" class="input input--hero tabular-nums" type="tel" value="${plan.estimated_cost.toLocaleString('id-ID')}" />
      </div>
      <div class="field">
        <label class="field__label">Sumber Dompet</label>
        <select id="cm-wallet" class="select">
          ${wallets.map((w) => `<option value="${w.id}">${esc(w.name)} (${formatIDR(w.balance)})</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--emerald btn--full" id="cm-save">Simpan Pengeluaran Makan</button>
    </div>`,
    {
      onMount: (backdrop, close) => {
        backdrop.querySelector('#cm-save').addEventListener('click', async () => {
          try {
            await consumeMealPlan(appStore.db, {
              mealPlanId: plan.id,
              walletId: backdrop.querySelector('#cm-wallet').value,
              periodId: appStore.state.summary?.period?.id,
              actualCost: parseAmountInput(backdrop.querySelector('#cm-cost').value),
              recordExpense: true,
              isTreatMeal: Boolean(appStore.state.summary?.isTodayTreatDay)
            });
            close();
            await appStore.refresh();
            showToast('Pengeluaran makan tercatat & target diperbarui.');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    }
  );
}

function openEditFoodPriceSheet(food) {
  openOverlay(
    `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <h3 style="margin:0 0 6px;color:var(--forest-dark)">Edit Harga Lokal</h3>
      <p style="margin:0 0 12px;font-size:13px;color:var(--text-muted)">${esc(food.name)} (Bawaan: ${formatIDR(food.default_price)})</p>
      <div class="field">
        <label class="field__label">Harga di Daerahmu (Rp)</label>
        <input id="ef-price" class="input input--hero tabular-nums" type="tel" value="${food.estimated_price.toLocaleString('id-ID')}" />
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn--soft" id="ef-reset">Reset Default</button>
        <button class="btn btn--primary btn--full" id="ef-save">Simpan Harga</button>
      </div>
    </div>`,
    {
      onMount: (backdrop, close) => {
        backdrop.querySelector('#ef-save').addEventListener('click', async () => {
          await updateFoodPrice(appStore.db, food.id, parseAmountInput(backdrop.querySelector('#ef-price').value));
          close();
          await appStore.refresh();
          showToast('Harga lokal diperbarui.');
        });
        backdrop.querySelector('#ef-reset').addEventListener('click', async () => {
          await resetFoodPrice(appStore.db, food.id);
          close();
          await appStore.refresh();
          showToast('Harga dikembalikan ke bawaan.');
        });
      }
    }
  );
}

function openAddCustomFoodSheet() {
  openOverlay(
    `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <h3 style="margin:0 0 12px;color:var(--forest-dark)">Tambah Menu Kustom</h3>
      <div class="field"><label class="field__label">Nama Menu</label><input id="cf-name" class="input" placeholder="Mis. Nasi Ayam Geprek" /></div>
      <div class="grid-2">
        <div class="field"><label class="field__label">Harga (Rp)</label><input id="cf-price" class="input tabular-nums" type="tel" placeholder="14000" /></div>
        <div class="field"><label class="field__label">Kalori (kkal)</label><input id="cf-cal" class="input tabular-nums" type="number" value="550" /></div>
      </div>
      <button class="btn btn--primary btn--full" id="cf-save">Simpan Menu</button>
    </div>`,
    {
      onMount: (backdrop, close) => {
        backdrop.querySelector('#cf-save').addEventListener('click', async () => {
          const name = backdrop.querySelector('#cf-name').value;
          const estimatedPrice = parseAmountInput(backdrop.querySelector('#cf-price').value);
          if (!name.trim()) return showToast('Nama menu wajib diisi.', 'error');
          await createCustomFoodItem(appStore.db, {
            name,
            estimatedPrice,
            calories: Number(backdrop.querySelector('#cf-cal').value) || 550,
            requiredEquipment: 'none',
            preparationType: 'beli',
            suitableMealTypes: ['breakfast', 'lunch', 'dinner'],
            hasProtein: true,
            hasVegetable: true
          });
          close();
          await appStore.refresh();
          showToast('Menu ditambahkan.');
        });
      }
    }
  );
}

function openFoodTargetModal() {
  const user = appStore.state.user;
  const currentBudget = Number(user?.monthly_food_budget || 0);
  const currentTreat = Number(user?.treat_meals_per_week ?? 3);
  const currentCal = Number(user?.min_daily_calories ?? 1900);

  openOverlay(
    `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <h3 style="margin:0 0 12px;color:var(--forest-dark)">Atur Target Uang Makan</h3>
      <div class="field">
        <label class="field__label">Uang Makan Sebulan / Periode (Rp)</label>
        <input id="ft-budget" class="input input--hero tabular-nums" type="tel" value="${currentBudget > 0 ? currentBudget.toLocaleString('id-ID') : '300.000'}" />
      </div>
      <div class="grid-2">
        <div class="field">
          <label class="field__label">Makan Enak / Minggu</label>
          <input id="ft-treat" class="input tabular-nums" type="number" min="0" max="7" value="${currentTreat}" />
        </div>
        <div class="field">
          <label class="field__label">Kalori Minimal/Hr</label>
          <input id="ft-cal" class="input tabular-nums" type="number" min="1200" max="3500" step="50" value="${currentCal}" />
        </div>
      </div>
      <button class="btn btn--primary btn--full" id="ft-save">Simpan &amp; Hitung Ulang</button>
    </div>`,
    {
      onMount: (backdrop, close) => {
        backdrop.querySelector('#ft-save').addEventListener('click', async () => {
          try {
            const budget = parseAmountInput(backdrop.querySelector('#ft-budget').value);
            const treat = Math.max(0, Math.min(7, Number(backdrop.querySelector('#ft-treat').value) || 0));
            const cal = Math.max(1200, Number(backdrop.querySelector('#ft-cal').value) || 1900);
            await updateFinancialCycleSettings(appStore.db, {
              foodBudgetMode: budget > 0 ? 'fixed' : 'ratio',
              monthlyFoodBudget: budget,
              treatMealsPerWeek: treat,
              minDailyCalories: cal
            });
            close();
            await appStore.refresh();
            showToast('Target makan diperbarui.');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    }
  );
}
