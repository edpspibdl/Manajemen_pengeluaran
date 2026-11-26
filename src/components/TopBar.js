import { iconSvg } from './Icons.js';
import { formatDayMonthID } from '../utils/date.js';
import { esc } from '../utils/dom.js';

export function renderTopBar({ user, summary, alerts = [] }) {
  const hasDanger = alerts.some((a) => a.severity === 'danger');
  const hasWarning = alerts.some((a) => a.severity === 'warning');
  const dotHtml = hasDanger
    ? '<span class="topbar__badge-dot"></span>'
    : hasWarning
      ? '<span class="topbar__badge-dot topbar__badge-dot--warning"></span>'
      : '';

  const periodText = summary?.period
    ? `${formatDayMonthID(summary.period.start_date)} – ${formatDayMonthID(summary.period.end_date)} • Sisa ${summary.remainingDays} hr`
    : 'Atur siklus keuangan';

  return `
    <header class="topbar">
      <button class="topbar__icon-btn" data-action="open-drawer" aria-label="Menu KosMate">
        ${iconSvg('menu', 24)}
      </button>
      <div class="topbar__center-meta">
        <div class="topbar__greeting">Halo, ${esc(user?.name || 'Anak Kos')}</div>
        <div class="topbar__period">${esc(periodText)}</div>
      </div>
      <button class="topbar__icon-btn" data-action="open-alerts" aria-label="Notifikasi Asisten Pintar">
        ${iconSvg('bell', 22)}
        ${dotHtml}
      </button>
    </header>
  `;
}

export function renderSubHeader({ eyebrow, title, backAction = 'close-subview' }) {
  return `
    <div class="sub-header">
      <button class="back-circle-btn" data-action="${esc(backAction)}" aria-label="Kembali">
        ${iconSvg('back', 18)}
      </button>
      <div>
        <div class="sub-header__eyebrow">${esc(eyebrow)}</div>
        <div class="sub-header__title">${esc(title)}</div>
      </div>
    </div>
  `;
}
