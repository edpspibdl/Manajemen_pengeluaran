export const CURRENT_SCHEMA_VERSION = 2;

export const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_kosmate_schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'IDR',
        monthly_income INTEGER NOT NULL DEFAULT 0,
        income_day INTEGER NOT NULL DEFAULT 1,
        budget_period TEXT NOT NULL DEFAULT 'monthly',
        food_budget_ratio REAL NOT NULL DEFAULT 0.60,
        min_daily_food_warning INTEGER NOT NULL DEFAULT 20000,
        reserve_target_amount INTEGER NOT NULL DEFAULT 0,
        cooking_equipment TEXT NOT NULL DEFAULT '["none"]',
        onboarding_completed INTEGER NOT NULL DEFAULT 0,
        pin_hash TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS financial_periods (
        id TEXT PRIMARY KEY,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        opening_operational_balance INTEGER NOT NULL DEFAULT 0,
        expected_income INTEGER NOT NULL DEFAULT 0,
        reserve_target INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        wallet_type TEXT NOT NULL,
        balance INTEGER NOT NULL DEFAULT 0,
        include_in_daily_budget INTEGER NOT NULL DEFAULT 1,
        icon TEXT NOT NULL DEFAULT 'wallet',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS recurring_expenses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK(amount > 0),
        category_id TEXT NOT NULL REFERENCES categories(id),
        default_wallet_id TEXT NULL REFERENCES wallets(id),
        due_day INTEGER NOT NULL,
        frequency TEXT NOT NULL DEFAULT 'monthly',
        next_due_date TEXT NOT NULL,
        last_paid_period_id TEXT NULL REFERENCES financial_periods(id),
        last_paid_at TEXT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        period_id TEXT NOT NULL REFERENCES financial_periods(id),
        wallet_id TEXT NOT NULL REFERENCES wallets(id),
        to_wallet_id TEXT NULL REFERENCES wallets(id),
        category_id TEXT NULL REFERENCES categories(id),
        recurring_expense_id TEXT NULL REFERENCES recurring_expenses(id),
        type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
        amount INTEGER NOT NULL CHECK(amount > 0),
        transaction_date TEXT NOT NULL,
        description TEXT DEFAULT '',
        is_unexpected INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        period_id TEXT NULL REFERENCES financial_periods(id),
        category_id TEXT NOT NULL REFERENCES categories(id),
        amount INTEGER NOT NULL CHECK(amount >= 0),
        period_type TEXT NOT NULL DEFAULT 'monthly',
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS planned_expenses (
        id TEXT PRIMARY KEY,
        period_id TEXT NOT NULL REFERENCES financial_periods(id),
        name TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK(amount > 0),
        category_id TEXT NOT NULL REFERENCES categories(id),
        planned_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'cancelled')),
        transaction_id TEXT NULL REFERENCES transactions(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS savings_goals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        wallet_id TEXT NULL REFERENCES wallets(id),
        target_amount INTEGER NOT NULL CHECK(target_amount > 0),
        current_amount INTEGER NOT NULL DEFAULT 0,
        monthly_allocation INTEGER NOT NULL DEFAULT 0,
        target_date TEXT NULL,
        is_emergency INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS food_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        default_price INTEGER NOT NULL CHECK(default_price >= 0),
        estimated_price INTEGER NOT NULL CHECK(estimated_price >= 0),
        calories INTEGER NULL,
        protein REAL NULL,
        food_category TEXT NOT NULL CHECK(food_category IN ('super_hemat', 'hemat', 'normal', 'fleksibel')),
        preparation_type TEXT NOT NULL CHECK(preparation_type IN ('beli', 'masak', 'keduanya')),
        required_equipment TEXT NOT NULL DEFAULT 'none',
        suitable_meal_types TEXT NOT NULL,
        ingredients TEXT NOT NULL DEFAULT '[]',
        instructions TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        has_protein INTEGER NOT NULL DEFAULT 0,
        has_vegetable INTEGER NOT NULL DEFAULT 0,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        is_custom INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS meal_plans (
        id TEXT PRIMARY KEY,
        meal_date TEXT NOT NULL,
        meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
        food_item_id TEXT NOT NULL REFERENCES food_items(id),
        estimated_cost INTEGER NOT NULL DEFAULT 0,
        actual_cost INTEGER NULL,
        status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'consumed', 'skipped')),
        transaction_id TEXT NULL REFERENCES transactions(id),
        notes TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS food_preferences (
        id TEXT PRIMARY KEY,
        preference_type TEXT NOT NULL,
        preference_value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
      );`,

      `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date, deleted_at);`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_period_type ON transactions(period_id, type, deleted_at);`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_id, to_wallet_id);`,
      `CREATE INDEX IF NOT EXISTS idx_meal_plans_date ON meal_plans(meal_date, meal_type, deleted_at);`,
      `CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_expenses(is_active, next_due_date);`,
      `CREATE INDEX IF NOT EXISTS idx_planned_period ON planned_expenses(period_id, status);`
    ]
  },
  {
    version: 2,
    name: 'food_budget_pool_treat_and_calories',
    statements: [
      `ALTER TABLE users ADD COLUMN food_budget_mode TEXT NOT NULL DEFAULT 'fixed';`,
      `ALTER TABLE users ADD COLUMN monthly_food_budget INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE users ADD COLUMN treat_meals_per_week INTEGER NOT NULL DEFAULT 3;`,
      `ALTER TABLE users ADD COLUMN min_daily_calories INTEGER NOT NULL DEFAULT 1900;`,
      `ALTER TABLE users ADD COLUMN min_daily_protein INTEGER NOT NULL DEFAULT 50;`,
      `ALTER TABLE financial_periods ADD COLUMN food_budget_target INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE transactions ADD COLUMN meal_slot TEXT NULL;`,
      `ALTER TABLE transactions ADD COLUMN calories INTEGER NULL;`,
      `ALTER TABLE transactions ADD COLUMN protein REAL NULL;`,
      `ALTER TABLE transactions ADD COLUMN is_treat_meal INTEGER NOT NULL DEFAULT 0;`
    ]
  }
];
