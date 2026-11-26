import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../src/db/database.js';
import { completeOnboarding } from '../src/services/OnboardingService.js';
import { calculateBudgetSummary } from '../src/services/BudgetEngine.js';
import { generateSpendingAlerts } from '../src/services/SpendingAssistant.js';
import { generateMealPlanRange, recommendForSlot } from '../src/services/FoodRecommender.js';
import { exportBackupJson, restoreBackupJson } from '../src/services/BackupService.js';
import { ensureActivePeriod, updateFinancialCycleSettings } from '../src/services/PeriodService.js';
import { createTransaction, deleteTransaction, listTransactions, updateTransaction } from '../src/repositories/transactionRepo.js';
import { payRecurringExpense } from '../src/repositories/financeExtrasRepo.js';
import { consumeMealPlan, listMealPlans, resetFoodPrice, updateFoodPrice } from '../src/repositories/foodRepo.js';
import { listWallets } from '../src/repositories/walletRepo.js';
import { computePeriodBounds } from '../src/utils/date.js';

describe('KosMate Core Financial & Meal Logic', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  it('seeds only master categories and food items without fake transactions or balances', async () => {
    const wallets = await listWallets(db);
    const txs = await listTransactions(db);
    const foods = await db.query('SELECT COUNT(*) AS cnt FROM food_items');
    const cats = await db.query('SELECT COUNT(*) AS cnt FROM categories');

    expect(wallets.length).toBe(0);
    expect(txs.length).toBe(0);
    expect(foods[0].cnt).toBeGreaterThanOrEqual(35);
    expect(cats[0].cnt).toBeGreaterThanOrEqual(14);
  });

  it('handles custom period bounds including day 31 in February safely', () => {
    const bounds = computePeriodBounds('2026-02-15', 'monthly', 31);
    expect(bounds.startDate).toBe('2026-01-31');
    expect(bounds.endDate).toBe('2026-02-27');

    const bounds2 = computePeriodBounds('2026-02-28', 'monthly', 31);
    expect(bounds2.startDate).toBe('2026-02-28');
    expect(bounds2.endDate).toBe('2026-03-30');
  });

  it('computes SafeToSpend without double-counting emergency wallet or reserve transfers', async () => {
    const today = '2026-11-26';
    await completeOnboarding(
      db,
      {
        name: 'Andi',
        budgetPeriod: 'monthly',
        incomeDay: 25,
        monthlyIncome: 2000000,
        reserveTargetAmount: 300000,
        cookingEquipment: ['none', 'rice_cooker'],
        wallets: [
          { name: 'Tunai', walletType: 'cash', balance: 500000 },
          { name: 'Bank', walletType: 'bank', balance: 1500000 },
          { name: 'Dana Darurat', walletType: 'emergency', balance: 1000000 }
        ],
        recurringBills: [
          { name: 'Sewa Kos', amount: 700000, dueDay: 1, categoryId: 'cat-exp-kos' }
        ]
      },
      today
    );

    let summary = await calculateBudgetSummary(db, today);
    // Operational cash = 500k + 1500k = 2,000,000 (emergency 1,000,000 excluded!)
    expect(summary.availableOperationalCash).toBe(2000000);
    expect(summary.lockedSavingsBalance).toBe(1000000);
    expect(summary.unpaidObligations).toBe(700000);
    expect(summary.remainingReserveAllocation).toBe(300000);
    // SafeToSpend = 2,000,000 - 700,000 - 300,000 = 1,000,000
    expect(summary.safeToSpend).toBe(1000000);

    // Transfer Rp 300,000 from Bank -> Dana Darurat
    const wallets = await listWallets(db);
    const bank = wallets.find((w) => w.name === 'Bank');
    const emergency = wallets.find((w) => w.name === 'Dana Darurat');

    await createTransaction(db, {
      periodId: summary.period.id,
      type: 'transfer',
      walletId: bank.id,
      toWalletId: emergency.id,
      amount: 300000,
      transactionDate: `${today} 10:00:00`,
      description: 'Sisihkan dana cadangan'
    });

    summary = await calculateBudgetSummary(db, today);
    expect(summary.availableOperationalCash).toBe(1700000);
    expect(summary.lockedSavingsBalance).toBe(1300000);
    expect(summary.remainingReserveAllocation).toBe(0);
    // SafeToSpend remains exactly 1,000,000 (ZERO double deduction!) and transfer is NOT income/expense!
    expect(summary.safeToSpend).toBe(1000000);
    expect(summary.periodIncome).toBe(0);
    expect(summary.periodExpense).toBe(0);
  });

  it('updates and rolls back wallet balances atomically on edit and delete', async () => {
    const today = '2026-11-26';
    await completeOnboarding(
      db,
      {
        name: 'Budi',
        budgetPeriod: 'monthly',
        incomeDay: 1,
        wallets: [{ name: 'Tunai', walletType: 'cash', balance: 500000 }]
      },
      today
    );

    const summary = await calculateBudgetSummary(db, today);
    const [cash] = await listWallets(db);

    const tx = await createTransaction(db, {
      periodId: summary.period.id,
      type: 'expense',
      walletId: cash.id,
      categoryId: 'cat-exp-food',
      amount: 25000,
      transactionDate: `${today} 12:00:00`,
      description: 'Warteg'
    });

    let walletsNow = await listWallets(db);
    expect(walletsNow[0].balance).toBe(475000);

    await updateTransaction(db, tx.id, { amount: 40000 });
    walletsNow = await listWallets(db);
    expect(walletsNow[0].balance).toBe(460000);

    await deleteTransaction(db, tx.id);
    walletsNow = await listWallets(db);
    expect(walletsNow[0].balance).toBe(500000);
  });

  it('prevents duplicate payment of recurring bills in the same period and restores unpaid state if deleted', async () => {
    const today = '2026-11-26';
    await completeOnboarding(
      db,
      {
        name: 'Citra',
        budgetPeriod: 'monthly',
        incomeDay: 25,
        wallets: [{ name: 'Bank', walletType: 'bank', balance: 1500000 }],
        recurringBills: [{ name: 'Internet Kos', amount: 150000, dueDay: 28, categoryId: 'cat-exp-internet' }]
      },
      today
    );

    let summary = await calculateBudgetSummary(db, today);
    const [bank] = await listWallets(db);
    const [bill] = await db.query('SELECT * FROM recurring_expenses WHERE deleted_at IS NULL');

    expect(summary.unpaidObligations).toBe(150000);

    const payTx = await payRecurringExpense(db, {
      recurringId: bill.id,
      walletId: bank.id,
      periodId: summary.period.id,
      paidDate: `${today} 09:00:00`
    });

    // Duplicate payment in same period must fail
    await expect(
      payRecurringExpense(db, {
        recurringId: bill.id,
        walletId: bank.id,
        periodId: summary.period.id
      })
    ).rejects.toThrow(/sudah dibayar/i);

    summary = await calculateBudgetSummary(db, today);
    expect(summary.unpaidObligations).toBe(0);
    expect(summary.availableOperationalCash).toBe(1350000);

    // Deleting the bill transaction returns balance and restores unpaid status
    await deleteTransaction(db, payTx.id);
    summary = await calculateBudgetSummary(db, today);
    expect(summary.availableOperationalCash).toBe(1500000);
    expect(summary.unpaidObligations).toBe(150000);
  });

  it('filters food recommendations by budget, equipment, allergens, and records meal expense atomically', async () => {
    const today = '2026-11-26';
    await completeOnboarding(
      db,
      {
        name: 'Dina',
        budgetPeriod: 'monthly',
        incomeDay: 25,
        cookingEquipment: ['none'], // cannot cook with stove/rice_cooker!
        foodPreferences: [{ preferenceType: 'allergen', preferenceValue: 'seafood' }],
        wallets: [{ name: 'Tunai', walletType: 'cash', balance: 900000 }]
      },
      today
    );

    let summary = await calculateBudgetSummary(db, today);
    const recs = await recommendForSlot(db, {
      mealDate: today,
      mealType: 'lunch',
      slotBudget: 15000,
      healthStatus: summary.healthStatus
    });

    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.estimated_price).toBeLessThanOrEqual(15000);
      expect(r.required_equipment).toBe('none');
      expect(r.tags).not.toContain('seafood');
    }

    // Price edit & reset
    const targetFood = recs[0];
    const updatedFood = await updateFoodPrice(db, targetFood.id, 12500);
    expect(updatedFood.estimated_price).toBe(12500);
    const resetFood = await resetFoodPrice(db, targetFood.id);
    expect(resetFood.estimated_price).toBe(targetFood.default_price);

    // Generate plan and consume with actual expense
    await generateMealPlanRange(db, { startDate: today, days: 1, budgetSummary: summary });
    const plans = await listMealPlans(db, { startDate: today, endDate: today });
    expect(plans.length).toBeGreaterThanOrEqual(3);

    const [cash] = await listWallets(db);
    const lunchPlan = plans.find((p) => p.meal_type === 'lunch');
    const result = await consumeMealPlan(db, {
      mealPlanId: lunchPlan.id,
      walletId: cash.id,
      periodId: summary.period.id,
      actualCost: 14000,
      recordExpense: true
    });

    expect(result.transactionId).toBeTruthy();
    summary = await calculateBudgetSummary(db, today);
    expect(summary.availableOperationalCash).toBe(900000 - 14000);
    expect(summary.todayFoodExpense).toBe(14000);
  });

  it('labels runway predictions with Estimasi and preserves history across period changes & backup restore', async () => {
    const today = '2026-11-26';
    await completeOnboarding(
      db,
      {
        name: 'Eko',
        budgetPeriod: 'monthly',
        incomeDay: 1,
        wallets: [{ name: 'Tunai', walletType: 'cash', balance: 150000 }]
      },
      today
    );

    const summaryBefore = await calculateBudgetSummary(db, today);
    const [cash] = await listWallets(db);

    await createTransaction(db, {
      periodId: summaryBefore.period.id,
      type: 'expense',
      walletId: cash.id,
      categoryId: 'cat-exp-entertain',
      amount: 90000,
      transactionDate: `${today} 14:00:00`,
      description: 'Nonton & kopi'
    });

    const summaryAfter = await calculateBudgetSummary(db, today);
    const alerts = await generateSpendingAlerts(db, summaryAfter, today);
    const runway = alerts.find((a) => a.id === 'alert-runway');
    if (runway) {
      expect(runway.message).toMatch(/Estimasi/);
    }

    // Period rollover must preserve history (Rule #12)
    await ensureActivePeriod(db, '2026-12-05');
    await updateFinancialCycleSettings(db, { budgetPeriod: 'biweekly', incomeDay: 1 }, '2026-12-05');
    const txsAfterPeriodChange = await listTransactions(db);
    expect(txsAfterPeriodChange.length).toBe(1);

    // Backup & Restore integrity
    const backupJson = await exportBackupJson(db);
    await db.resetAllData();
    expect((await listWallets(db)).length).toBe(0);

    await restoreBackupJson(db, backupJson);
    const restoredWallets = await listWallets(db);
    expect(restoredWallets.length).toBe(1);
    expect(restoredWallets[0].balance).toBe(60000);

    // Tampered backup must fail checksum
    const tampered = backupJson.replace('"name": "Eko"', '"name": "Hacker"');
    await expect(restoreBackupJson(db, tampered)).rejects.toThrow(/Checksum/i);
  });

  it('tracks user-defined 300k monthly food budget, 3x/week Makan Enak split, manual food input, and weight-maintenance calories', async () => {
    const today = '2026-11-01';
    await completeOnboarding(
      db,
      {
        name: 'Fajar',
        budgetPeriod: 'monthly',
        incomeDay: 1,
        monthlyIncome: 1500000,
        monthlyFoodBudget: 300000,
        treatMealsPerWeek: 3,
        minDailyCalories: 1900,
        cookingEquipment: ['none', 'rice_cooker'],
        wallets: [{ name: 'Tunai', walletType: 'cash', balance: 1500000 }]
      },
      today
    );

    let summary = await calculateBudgetSummary(db, today);
    expect(summary.foodBudgetMode).toBe('fixed');
    expect(summary.monthlyFoodBudget).toBe(300000);
    expect(summary.remainingFoodPool).toBe(300000);
    expect(summary.flatDailyFoodTarget).toBe(10000); // 300k / 30 days
    expect(summary.regularDayFoodTarget).toBeLessThan(summary.treatDayFoodTarget);
    expect(summary.treatMealsPerWeek).toBe(3);
    expect(summary.healthStatus).toBe('Aman');
    expect(summary.calorieFeasibility.tone).toBe('waspada'); // ~10k/day warns to cook rice + dense protein

    // User manually logs what they bought & ate ("Nasi Padang Rendang" Rp 22.000, 750 kcal, Makan Enak)
    const [cash] = await listWallets(db);
    await createTransaction(db, {
      periodId: summary.period.id,
      type: 'expense',
      walletId: cash.id,
      categoryId: 'cat-exp-food',
      amount: 22000,
      transactionDate: `${today} 12:30:00`,
      description: 'Nasi Padang Rendang',
      mealSlot: 'lunch',
      calories: 750,
      protein: 28,
      isTreatMeal: true
    });

    summary = await calculateBudgetSummary(db, today);
    expect(summary.remainingFoodPool).toBe(278000);
    expect(summary.treatMealsUsedThisWeek).toBe(1);
    expect(summary.treatMealsRemainingThisWeek).toBe(2);
    expect(summary.isTodayTreatDay).toBe(true);
    expect(summary.todayCalories).toBe(750);
    expect(summary.todayProtein).toBe(28);
    expect(summary.caloriesRemainingToday).toBe(1150);
    // Remaining 278.000 across remaining 29 days = 9.586/day so 300k still lasts all month!
    expect(summary.nextDayFlatFoodTarget).toBe(Math.floor(278000 / 29));
  });

  it('maintains exact balance across Tanggungan + Sisa Makan + Uang Bebas even when onboarding mid-month or paying recurring bills', async () => {
    // User joins mid-month (Nov 26) with incomeDay = 1 (period Nov 1..Nov 30)
    const today = '2026-11-26';
    await completeOnboarding(
      db,
      {
        name: 'Gani',
        budgetPeriod: 'monthly',
        incomeDay: 1,
        monthlyIncome: 2000000,
        monthlyFoodBudget: 300000,
        wallets: [{ name: 'Dompet Utama', walletType: 'bank', balance: 2000000 }],
        recurringBills: [
          { name: 'Bayar Kos', amount: 750000, dueDay: 1, categoryId: 'cat-exp-kos' },
          { name: 'Listrik', amount: 100000, dueDay: 5, categoryId: 'cat-exp-kos' },
          { name: 'Kuota', amount: 100000, dueDay: 10, categoryId: 'cat-exp-internet' }
        ]
      },
      today
    );

    let summary = await calculateBudgetSummary(db, today);
    // 5 days left (Nov 26..Nov 30)
    expect(summary.remainingDays).toBe(5);
    expect(summary.unpaidObligations).toBe(950000);
    expect(summary.remainingFoodPool).toBe(300000);
    expect(summary.nonFoodSafeToSpend).toBe(750000);
    // Exact balance equation: 950k + 300k + 750k = 2.000.000
    expect(summary.unpaidObligations + summary.remainingFoodPool + summary.nonFoodSafeToSpend).toBe(2000000);
    expect(summary.baseDailyBudgetToday).toBe(210000); // 1.050.000 / 5

    // Paying Bayar Kos (Rp 750.000) must NOT inflate baseDailyBudgetToday or make remainingDailyToday negative!
    const [wallet] = await listWallets(db);
    const bills = await db.query('SELECT * FROM recurring_expenses WHERE deleted_at IS NULL');
    const kosBill = bills.find((b) => b.name === 'Bayar Kos');
    await payRecurringExpense(db, {
      recurringId: kosBill.id,
      walletId: wallet.id,
      periodId: summary.period.id,
      paidDate: `${today} 09:00:00`
    });

    summary = await calculateBudgetSummary(db, today);
    expect(summary.availableOperationalCash).toBe(1250000);
    expect(summary.unpaidObligations).toBe(200000);
    expect(summary.safeToSpend).toBe(1050000);
    expect(summary.nonFoodSafeToSpend).toBe(750000);
    expect(summary.baseDailyBudgetToday).toBe(210000);
    expect(summary.remainingDailyToday).toBe(210000);
    expect(summary.periodVariableExpense).toBe(0); // Paying recurring bill is NOT variable daily spending!
    expect(summary.healthStatus).toBe('Aman');

    // Spending Rp 20.000 on Food keeps Uang Bebas (750rb) untouched and lowers Sisa Makan to 280rb!
    await createTransaction(db, {
      periodId: summary.period.id,
      type: 'expense',
      walletId: wallet.id,
      categoryId: 'cat-exp-food',
      amount: 20000,
      transactionDate: `${today} 13:00:00`,
      description: 'Warteg'
    });

    summary = await calculateBudgetSummary(db, today);
    expect(summary.remainingFoodPool).toBe(280000);
    expect(summary.nonFoodSafeToSpend).toBe(750000);
    expect(summary.periodVariableExpense).toBe(20000);
    expect(summary.remainingDailyToday).toBe(190000);
  });
});
