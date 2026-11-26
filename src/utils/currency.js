/**
 * Format integer Rupiah value (e.g. 42000 -> "Rp 42.000").
 * @param {number} amount
 * @param {{ showSign?: boolean }} [opts]
 * @returns {string}
 */
export function formatIDR(amount, { showSign = false } = {}) {
  const num = Math.round(Number(amount) || 0);
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('id-ID');
  if (num < 0) return `-Rp ${formatted}`;
  if (showSign && num > 0) return `+Rp ${formatted}`;
  return `Rp ${formatted}`;
}

/**
 * Compact Rupiah label for chart axes and tight badges (e.g. 1200000 -> "1,2jt", 600000 -> "600rb").
 * @param {number} amount
 * @returns {string}
 */
export function formatCompactIDR(amount) {
  const num = Math.round(Number(amount) || 0);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const val = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return `${sign}${val}jt`;
  }
  if (abs >= 1_000) {
    const val = Math.round(abs / 1_000);
    return `${sign}${val}rb`;
  }
  return `${sign}${abs}`;
}

/**
 * Split integer Rupiah for hero display matching the reference mockup style.
 * E.g. 215000 -> { sign: '', prefix: 'Rp', whole: '215.000' }
 * @param {number} amount
 * @returns {{ sign: string, prefix: string, whole: string }}
 */
export function splitHeroIDR(amount) {
  const num = Math.round(Number(amount) || 0);
  return {
    sign: num < 0 ? '-' : '',
    prefix: 'Rp',
    whole: Math.abs(num).toLocaleString('id-ID')
  };
}

/**
 * Parse raw user text input into a non-negative integer Rupiah amount.
 * @param {string|number} raw
 * @returns {number}
 */
export function parseAmountInput(raw) {
  if (typeof raw === 'number') return Math.max(0, Math.round(raw));
  const digits = String(raw || '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}
