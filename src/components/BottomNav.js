import { iconSvg } from './Icons.js';

export function renderBottomNav(activeTab) {
  const item = (id, label, icon) => {
    const activeClass = activeTab === id ? 'bottom-nav__item--active' : '';
    return `
      <button class="bottom-nav__item ${activeClass}" data-nav="${id}">
        ${iconSvg(icon, 21)}
        <span>${label}</span>
      </button>
    `;
  };

  return `
    <nav class="bottom-nav" aria-label="Navigasi utama">
      ${item('home', 'Home', 'home')}
      ${item('keuangan', 'Keuangan', 'wallet')}
      <div class="bottom-nav__fab-slot">
        <button class="bottom-nav__fab" data-action="open-quick-add" aria-label="Catat transaksi cepat">
          ${iconSvg('plus', 28)}
        </button>
      </div>
      ${item('makanan', 'Makanan', 'utensils')}
      ${item('analisis', 'Analisis', 'pie')}
    </nav>
  `;
}
