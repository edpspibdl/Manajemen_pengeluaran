import { esc } from '../utils/dom.js';
import { appStore } from '../store/appStore.js';
import { openOverlay } from './Modal.js';

export function openAlertsModal() {
  const { alerts = [] } = appStore.state;

  const html = `
    <div class="sheet">
      <div class="sheet__handle"></div>
      <div class="section-head">
        <div>
          <span class="section-head__eyebrow">Smart Spending Assistant</span>
          <h3 class="section-head__title">Asisten &amp; Peringatan</h3>
        </div>
        <button class="btn btn--soft btn--sm" data-close-alerts>Tutup</button>
      </div>

      ${alerts
        .map(
          (a) => `
          <div class="alert-card alert-card--${esc(a.severity)}">
            <div style="flex:1">
              <div style="font-weight:800;font-size:13.5px;margin-bottom:2px">${esc(a.title)}</div>
              <div style="font-size:12.5px;line-height:1.4">${esc(a.message)}</div>
              ${
                a.actionTab && a.actionTab !== 'home'
                  ? `<button class="link-emerald" style="margin-top:6px;font-size:12px" data-alert-nav="${esc(a.actionTab)}" ${a.recurringId ? 'data-go-bill="1"' : ''}>
                      Lihat Detail &raquo;
                     </button>`
                  : ''
              }
            </div>
          </div>`
        )
        .join('')}
    </div>
  `;

  openOverlay(html, {
    onMount: (backdrop, close) => {
      backdrop.querySelector('[data-close-alerts]').addEventListener('click', close);
      backdrop.querySelectorAll('[data-alert-nav]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tab = btn.getAttribute('data-alert-nav');
          const goBill = btn.hasAttribute('data-go-bill');
          close();
          appStore.setState({
            activeTab: tab,
            subView: null,
            ...(goBill ? { keuanganSegment: 'tagihan' } : {})
          });
        });
      });
    }
  });
}
