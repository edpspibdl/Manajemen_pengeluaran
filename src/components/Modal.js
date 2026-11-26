import { esc } from '../utils/dom.js';
import { hashPin } from '../utils/hash.js';
import { appStore } from '../store/appStore.js';

let toastContainer = null;

export function showToast(message, type = 'success') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-stack';
    document.body.appendChild(toastContainer);
  }
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'toast--error' : ''}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3000);
}

export function openOverlay(html, { centered = false, onMount } = {}) {
  closeOverlay();
  const backdrop = document.createElement('div');
  backdrop.id = 'kosmate-overlay';
  backdrop.className = `overlay-backdrop ${centered ? 'overlay-backdrop--center' : ''}`;
  backdrop.innerHTML = html;

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeOverlay();
    }
  });

  document.body.appendChild(backdrop);
  if (onMount) onMount(backdrop, closeOverlay);
  return backdrop;
}

export function closeOverlay() {
  const existing = document.getElementById('kosmate-overlay');
  if (existing) existing.remove();
}

export function confirmDialog({ title, message, confirmLabel = 'Ya, Lanjutkan', danger = false }) {
  return new Promise((resolve) => {
    const html = `
      <div class="dialog-card">
        <h3 style="margin:0 0 8px;color:var(--forest-dark);font-size:17px">${esc(title)}</h3>
        <p style="margin:0 0 18px;color:var(--text-muted);font-size:13.5px">${esc(message)}</p>
        <div style="display:flex;gap:10px">
          <button class="btn btn--soft btn--full" data-confirm-no>Batal</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'} btn--full" data-confirm-yes>${esc(confirmLabel)}</button>
        </div>
      </div>
    `;
    const box = openOverlay(html, { centered: true });
    box.querySelector('[data-confirm-no]').addEventListener('click', () => {
      closeOverlay();
      resolve(false);
    });
    box.querySelector('[data-confirm-yes]').addEventListener('click', () => {
      closeOverlay();
      resolve(true);
    });
  });
}

export function renderPinLockScreen(user) {
  return `
    <div class="pin-screen">
      <div style="width:54px;height:54px;border-radius:16px;background:var(--forest-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;margin-bottom:14px">K</div>
      <h2 style="margin:0 0 6px;color:var(--forest-dark)">KosMate Terkunci</h2>
      <p style="margin:0;color:var(--text-muted);font-size:13px">Masukkan PIN keamanan untuk ${esc(user?.name || 'akunmu')}</p>
      <div class="pin-dots" id="pin-dots">
        <span class="pin-dot"></span><span class="pin-dot"></span><span class="pin-dot"></span><span class="pin-dot"></span>
      </div>
      <div class="pin-pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫']
          .map((k) => `<button class="pin-key" data-pin-key="${k}">${k}</button>`)
          .join('')}
      </div>
    </div>
  `;
}

export function bindPinLockHandlers(container, user) {
  let entered = '';
  const dots = container.querySelectorAll('#pin-dots .pin-dot');

  const syncDots = () => {
    dots.forEach((d, idx) => {
      d.classList.toggle('pin-dot--filled', idx < entered.length);
    });
  };

  container.querySelectorAll('[data-pin-key]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const k = btn.getAttribute('data-pin-key');
      if (k === 'C') entered = '';
      else if (k === '⌫') entered = entered.slice(0, -1);
      else if (entered.length < 4) entered += k;
      syncDots();

      if (entered.length === 4) {
        const hashed = await hashPin(entered);
        if (hashed === user.pin_hash) {
          appStore.setState({ lockedByPin: false });
        } else {
          entered = '';
          syncDots();
          showToast('PIN salah, coba lagi.', 'error');
        }
      }
    });
  });
}
