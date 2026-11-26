import { splitHeroIDR, formatIDR } from '../utils/currency.js';
import { esc } from '../utils/dom.js';

/**
 * Render the thick rounded-cap circular budget ring matching Reference Screens 1 & 2.
 */
export function renderCircularGauge({
  amount = 0,
  totalBase = 0,
  eyebrow = 'Budget Hari Ini',
  subPrefix = 'tersedia dari',
  healthStatus = 'Aman'
}) {
  const radius = 86;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Math.max(1, Number(totalBase) || 1);
  const ratio = Math.max(0, Math.min(1, Number(amount) / safeTotal));
  const dashOffset = circumference * (1 - ratio);

  const hero = splitHeroIDR(amount);
  const statusLower = String(healthStatus).toLowerCase();
  let progressModifier = '';
  if (statusLower === 'waspada') progressModifier = 'gauge-progress--warning';
  if (statusLower === 'kritis' || statusLower === 'defisit') progressModifier = 'gauge-progress--danger';

  return `
    <div class="gauge-wrap">
      <div class="gauge-box">
        <svg class="gauge-svg" viewBox="0 0 220 220">
          <circle class="gauge-track" cx="110" cy="110" r="${radius}"></circle>
          <circle
            class="gauge-progress ${progressModifier}"
            cx="110"
            cy="110"
            r="${radius}"
            stroke-dasharray="${circumference.toFixed(2)}"
            stroke-dashoffset="${dashOffset.toFixed(2)}"
          ></circle>
        </svg>
        <div class="gauge-center">
          <div class="gauge-label">${esc(eyebrow)}</div>
          <div class="gauge-amount tabular-nums">
            ${hero.sign}<span class="gauge-amount__prefix">${hero.prefix}</span>${hero.whole}
          </div>
          <div class="gauge-sub">${esc(subPrefix)} <strong>${formatIDR(totalBase)}</strong></div>
        </div>
      </div>
    </div>
  `;
}
