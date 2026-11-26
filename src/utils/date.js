const MONTHS_ID_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_ID_FULL = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Format a Date object as local YYYY-MM-DD.
 * @param {Date} [date]
 * @returns {string}
 */
export function toDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a Date object as local YYYY-MM-DD HH:mm:ss.
 * @param {Date} [date]
 * @returns {string}
 */
export function toDateTimeString(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${toDateString(date)} ${hh}:${mm}:${ss}`;
}

/**
 * ISO-8601 UTC timestamp for created_at / updated_at / deleted_at.
 * @param {Date} [date]
 * @returns {string}
 */
export function toIsoUtc(date = new Date()) {
  return date.toISOString();
}

/**
 * Parse YYYY-MM-DD (or datetime string) into a local midnight Date.
 * @param {string} dateStr
 * @returns {Date}
 */
export function parseLocalDate(dateStr) {
  const clean = String(dateStr).slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/**
 * Return YYYY-MM-DD shifted by delta days.
 * @param {string} dateStr
 * @param {number} days
 * @returns {string}
 */
export function addDays(dateStr, days) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/**
 * Number of calendar days from fromStr to toStr (to - from).
 * @param {string} fromStr
 * @param {string} toStr
 * @returns {number}
 */
export function diffDays(fromStr, toStr) {
  const a = parseLocalDate(fromStr);
  const b = parseLocalDate(toStr);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Last day number of a given year/month (1-based month).
 * @param {number} year
 * @param {number} month
 * @returns {number}
 */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Build a clamped YYYY-MM-DD date in a year/month for a preferred day of month.
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day 1-31
 * @returns {string}
 */
export function makeClampedDate(year, month, day) {
  const d = Math.max(1, Math.min(day, daysInMonth(year, month)));
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Compute active financial period [startDate, endDate] inclusive.
 * @param {string} todayStr
 * @param {'monthly'|'biweekly'|'weekly'} budgetPeriod
 * @param {number} incomeDay 1-31 (or 1-7 Monday..Sunday for weekly)
 * @returns {{ startDate: string, endDate: string }}
 */
export function computePeriodBounds(todayStr, budgetPeriod = 'monthly', incomeDay = 1) {
  const today = parseLocalDate(todayStr);

  if (budgetPeriod === 'weekly') {
    const preferredDow = Math.max(1, Math.min(7, Number(incomeDay) || 1)) % 7; // 7->0 (Sun), 1->1 (Mon)
    const currentDow = today.getDay();
    const diffBack = (currentDow - preferredDow + 7) % 7;
    const startDate = addDays(todayStr, -diffBack);
    const endDate = addDays(startDate, 6);
    return { startDate, endDate };
  }

  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const clampedDay = Math.max(1, Math.min(31, Number(incomeDay) || 1));
  const thisMonthAnchor = makeClampedDate(year, month, clampedDay);

  let monthStart;
  let nextMonthStart;
  if (todayStr.slice(0, 10) >= thisMonthAnchor) {
    monthStart = thisMonthAnchor;
    const nextM = month === 12 ? 1 : month + 1;
    const nextY = month === 12 ? year + 1 : year;
    nextMonthStart = makeClampedDate(nextY, nextM, clampedDay);
  } else {
    const prevM = month === 1 ? 12 : month - 1;
    const prevY = month === 1 ? year - 1 : year;
    monthStart = makeClampedDate(prevY, prevM, clampedDay);
    nextMonthStart = thisMonthAnchor;
  }

  if (budgetPeriod === 'biweekly') {
    const midStart = addDays(monthStart, 14);
    if (todayStr.slice(0, 10) < midStart) {
      return { startDate: monthStart, endDate: addDays(midStart, -1) };
    }
    return { startDate: midStart, endDate: addDays(nextMonthStart, -1) };
  }

  return { startDate: monthStart, endDate: addDays(nextMonthStart, -1) };
}

/**
 * Advance a recurring expense due date to the next cycle after paying.
 * @param {string} dueDateStr
 * @param {'weekly'|'monthly'|'yearly'} frequency
 * @param {number} dueDay
 * @returns {string}
 */
export function advanceDueDate(dueDateStr, frequency = 'monthly', dueDay = 1) {
  if (frequency === 'weekly') {
    return addDays(dueDateStr, 7);
  }
  const d = parseLocalDate(dueDateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  if (frequency === 'yearly') {
    return makeClampedDate(year + 1, month, dueDay || d.getDate());
  }
  const nextM = month === 12 ? 1 : month + 1;
  const nextY = month === 12 ? year + 1 : year;
  return makeClampedDate(nextY, nextM, dueDay || d.getDate());
}

/**
 * Rewind a recurring expense due date back one cycle (used when deleting a bill payment).
 * @param {string} dueDateStr
 * @param {'weekly'|'monthly'|'yearly'} frequency
 * @param {number} dueDay
 * @returns {string}
 */
export function rewindDueDate(dueDateStr, frequency = 'monthly', dueDay = 1) {
  if (frequency === 'weekly') {
    return addDays(dueDateStr, -7);
  }
  const d = parseLocalDate(dueDateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  if (frequency === 'yearly') {
    return makeClampedDate(year - 1, month, dueDay || d.getDate());
  }
  const prevM = month === 1 ? 12 : month - 1;
  const prevY = month === 1 ? year - 1 : year;
  return makeClampedDate(prevY, prevM, dueDay || d.getDate());
}

/**
 * Compute initial next_due_date for a recurring item created today.
 * @param {string} todayStr
 * @param {number} dueDay
 * @param {'weekly'|'monthly'|'yearly'} frequency
 * @returns {string}
 */
export function computeInitialDueDate(todayStr, dueDay, frequency = 'monthly') {
  if (frequency === 'weekly') {
    const today = parseLocalDate(todayStr);
    const preferredDow = Math.max(1, Math.min(7, Number(dueDay) || 1)) % 7;
    const delta = (preferredDow - today.getDay() + 7) % 7;
    return addDays(todayStr, delta);
  }
  const d = parseLocalDate(todayStr);
  const candidate = makeClampedDate(d.getFullYear(), d.getMonth() + 1, dueDay || 1);
  if (candidate >= todayStr.slice(0, 10)) {
    return candidate;
  }
  const nextM = d.getMonth() + 2 > 12 ? 1 : d.getMonth() + 2;
  const nextY = d.getMonth() + 2 > 12 ? d.getFullYear() + 1 : d.getFullYear();
  return makeClampedDate(nextY, nextM, dueDay || 1);
}

/**
 * Format YYYY-MM-DD to compact Indonesian date (e.g. "26 Nov 2026").
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDateID(dateStr) {
  if (!dateStr) return '-';
  const d = parseLocalDate(dateStr);
  return `${d.getDate()} ${MONTHS_ID_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Format YYYY-MM-DD to day-month label (e.g. "26 Nov").
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDayMonthID(dateStr) {
  if (!dateStr) return '-';
  const d = parseLocalDate(dateStr);
  return `${d.getDate()} ${MONTHS_ID_SHORT[d.getMonth()]}`;
}

/**
 * Format YYYY-MM to full month name (e.g. "November 2026").
 * @param {string} dateStr
 * @returns {string}
 */
export function formatMonthYearID(dateStr) {
  const d = parseLocalDate(dateStr);
  return `${MONTHS_ID_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Uppercase 3-letter month abbreviation for bar chart axis (e.g. "NOV").
 * @param {number} monthIndex 0-11
 * @returns {string}
 */
export function getShortMonthUpper(monthIndex) {
  return (MONTHS_ID_SHORT[monthIndex] || '').toUpperCase();
}

/**
 * Indonesian day name for date string.
 * @param {string} dateStr
 * @returns {string}
 */
export function getDayNameID(dateStr) {
  const d = parseLocalDate(dateStr);
  return DAYS_ID[d.getDay()] || '';
}
