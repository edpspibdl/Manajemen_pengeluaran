import { addDays, toDateString } from '../utils/date.js';
import { getUserProfile } from '../repositories/userRepo.js';
import { listWallets } from '../repositories/walletRepo.js';
import { listCategories } from '../repositories/categoryRepo.js';
import { listTransactions } from '../repositories/transactionRepo.js';
import {
  listBudgets,
  listPlannedExpenses,
  listRecurringExpenses,
  listSavingsGoals
} from '../repositories/financeExtrasRepo.js';
import { listFoodItems, listFoodPreferences, listMealPlans } from '../repositories/foodRepo.js';
import { calculateBudgetSummary } from '../services/BudgetEngine.js';
import { generateSpendingAlerts } from '../services/SpendingAssistant.js';
import { getCategoryBreakdown, getMealAnalytics, getMonthlySpendingSeries } from '../services/ReportService.js';
import { syncBillNotifications } from '../services/NotificationService.js';

/**
 * Centralized reactive store keeping all views synchronized with SQLite.
 */
class AppStore {
  constructor() {
    this.db = null;
    this.listeners = new Set();
    this.state = {
      ready: false,
      loading: false,
      activeTab: 'home', // 'home' | 'keuangan' | 'makanan' | 'analisis' | 'profil'
      subView: null, // e.g. { type: 'category-budget', categoryId } or { type: 'wallet-detail', walletId }
      todayTreatMode: false,
      lockedByPin: false,
      user: null,
      summary: null,
      alerts: [],
      wallets: [],
      categories: [],
      transactions: [],
      budgets: [],
      recurringExpenses: [],
      plannedExpenses: [],
      savingsGoals: [],
      foodItems: [],
      mealPlansToday: [],
      mealPlansWeek: [],
      foodPreferences: [],
      monthlySeries: [],
      categoryBreakdown: { grandTotal: 0, items: [] },
      mealAnalytics: null
    };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) {
      fn(this.state);
    }
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  async init(db) {
    this.db = db;
    await db.init();
    const user = await getUserProfile(db);
    const lockedByPin = Boolean(user?.pin_hash);
    await this.refresh({ setReady: true, lockedByPin });
  }

  async refresh(extra = {}) {
    if (!this.db) return;
    const todayStr = toDateString();
    const user = await getUserProfile(this.db);
    const todayTreatMode = extra.todayTreatMode !== undefined ? extra.todayTreatMode : this.state.todayTreatMode;
    const summary = await calculateBudgetSummary(this.db, todayStr, { isTodayTreatDay: todayTreatMode });
    const alerts = await generateSpendingAlerts(this.db, summary, todayStr);

    const periodId = summary.period?.id || null;
    const startDate = summary.period?.start_date || todayStr;
    const endDate = summary.period?.end_date || todayStr;
    const weekEnd = addDays(todayStr, 6);

    const [
      wallets,
      categories,
      transactions,
      budgets,
      recurringExpenses,
      plannedExpenses,
      savingsGoals,
      foodItems,
      mealPlansToday,
      mealPlansWeek,
      foodPreferences,
      monthlySeries,
      categoryBreakdown,
      mealAnalytics
    ] = await Promise.all([
      listWallets(this.db),
      listCategories(this.db),
      listTransactions(this.db, { limit: 200 }),
      listBudgets(this.db, periodId),
      listRecurringExpenses(this.db),
      listPlannedExpenses(this.db, periodId),
      listSavingsGoals(this.db),
      listFoodItems(this.db),
      listMealPlans(this.db, { startDate: todayStr, endDate: todayStr }),
      listMealPlans(this.db, { startDate: todayStr, endDate: weekEnd }),
      listFoodPreferences(this.db),
      getMonthlySpendingSeries(this.db, todayStr, 6),
      getCategoryBreakdown(this.db, startDate, endDate),
      getMealAnalytics(this.db, startDate, endDate)
    ]);

    const unpaidBills = recurringExpenses.filter((r) => !periodId || r.last_paid_period_id !== periodId);
    syncBillNotifications(unpaidBills);

    this.setState({
      ...extra,
      ready: extra.setReady !== undefined ? extra.setReady : this.state.ready,
      user,
      summary,
      alerts,
      wallets,
      categories,
      transactions,
      budgets,
      recurringExpenses,
      plannedExpenses,
      savingsGoals,
      foodItems,
      mealPlansToday,
      mealPlansWeek,
      foodPreferences,
      monthlySeries,
      categoryBreakdown,
      mealAnalytics
    });
  }
}

export const appStore = new AppStore();
