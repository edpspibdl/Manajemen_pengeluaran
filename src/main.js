import './styles/tokens.css';
import './styles/main.css';

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { getDatabase } from './db/database.js';
import { appStore } from './store/appStore.js';
import { renderTopBar } from './components/TopBar.js';
import { renderBottomNav } from './components/BottomNav.js';
import { openQuickAddSheet } from './components/QuickAddSheet.js';
import { openDrawerMenu } from './components/DrawerMenu.js';
import { openAlertsModal } from './components/AlertsModal.js';
import { bindPinLockHandlers, renderPinLockScreen, showToast } from './components/Modal.js';
import { bindOnboardingHandlers, renderOnboardingPage } from './pages/OnboardingPage.js';
import { bindHomeHandlers, renderHomePage } from './pages/HomePage.js';
import { bindKeuanganHandlers, renderKeuanganPage } from './pages/KeuanganPage.js';
import { bindMakananHandlers, renderMakananPage } from './pages/MakananPage.js';
import { bindAnalisisHandlers, renderAnalisisPage } from './pages/AnalisisPage.js';
import { bindProfilHandlers, renderProfilPage } from './pages/ProfilPage.js';

const rootEl = document.getElementById('app');

async function configureNativeUi() {
  if (typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: '#F6F8F5' });
    } catch {
      // Ignore if plugin unavailable
    }
  }
}

function renderApp() {
  const state = appStore.state;
  if (!state.ready) {
    rootEl.innerHTML = `
      <div class="app-shell">
        <div class="pin-screen">
          <div style="font-size:22px;font-weight:800;color:var(--forest-dark)">KosMate</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:6px">Menyiapkan database lokal...</div>
        </div>
      </div>`;
    return;
  }

  if (state.lockedByPin && state.user?.pin_hash) {
    rootEl.innerHTML = `<div class="app-shell">${renderPinLockScreen(state.user)}</div>`;
    bindPinLockHandlers(rootEl, state.user);
    return;
  }

  if (!state.user || !state.user.onboarding_completed) {
    rootEl.innerHTML = `<div class="app-shell">${renderOnboardingPage()}</div>`;
    bindOnboardingHandlers(rootEl, renderApp);
    return;
  }

  let pageHtml = '';
  switch (state.activeTab) {
    case 'keuangan':
      pageHtml = renderKeuanganPage(state);
      break;
    case 'makanan':
      pageHtml = renderMakananPage(state);
      break;
    case 'analisis':
      pageHtml = renderAnalisisPage(state);
      break;
    case 'profil':
      pageHtml = renderProfilPage(state);
      break;
    default:
      pageHtml = renderHomePage(state);
      break;
  }

  rootEl.innerHTML = `
    <div class="app-shell">
      ${renderTopBar({ user: state.user, summary: state.summary, alerts: state.alerts })}
      ${pageHtml}
      ${renderBottomNav(state.activeTab)}
    </div>
  `;

  // Global header & nav bindings
  rootEl.querySelector('[data-action="open-drawer"]')?.addEventListener('click', openDrawerMenu);
  rootEl.querySelector('[data-action="open-alerts"]')?.addEventListener('click', openAlertsModal);
  rootEl.querySelector('[data-action="open-quick-add"]')?.addEventListener('click', () => openQuickAddSheet());

  rootEl.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      appStore.setState({ activeTab: btn.getAttribute('data-nav'), subView: null });
    });
  });

  // Page-specific bindings
  if (state.activeTab === 'keuangan') bindKeuanganHandlers(rootEl, renderApp);
  else if (state.activeTab === 'makanan') bindMakananHandlers(rootEl, renderApp);
  else if (state.activeTab === 'analisis') bindAnalisisHandlers(rootEl, renderApp);
  else if (state.activeTab === 'profil') bindProfilHandlers(rootEl, renderApp);
  else bindHomeHandlers(rootEl, renderApp);
}

async function bootstrap() {
  renderApp();
  appStore.subscribe(() => renderApp());
  await configureNativeUi();

  try {
    const db = getDatabase();
    await appStore.init(db);
  } catch (err) {
    console.error('Failed to initialize KosMate:', err);
    rootEl.innerHTML = `
      <div class="app-shell">
        <div class="pin-screen">
          <h3 style="color:var(--danger)">Gagal Membuka Database Lokal</h3>
          <p style="font-size:13px;color:var(--text-muted)">${err.message || 'Terjadi kesalahan saat inisialisasi SQLite.'}</p>
        </div>
      </div>`;
    showToast('Gagal memuat database lokal.', 'error');
  }
}

bootstrap();
