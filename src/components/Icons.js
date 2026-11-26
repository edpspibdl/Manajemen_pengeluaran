const ICONS = {
  menu: '<path d="M4 6h16M4 12h11M4 18h7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" fill="currentColor"/>',
  bellOutline: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  back: '<path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  home: '<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z" fill="currentColor"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zm13 4a1.5 1.5 0 1 0 0 3h5v-3h-5z" fill="currentColor"/>',
  utensils: '<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M15 3v7a2 2 0 0 0 2 2h1v9m0-18v9" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83V12h13.21z" fill="currentColor"/><path d="M22 12A10 10 0 0 0 12 2v10z" fill="currentColor" opacity="0.75"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.8" fill="none" stroke-linecap="round"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  piggy: '<path d="M19 10c0-3.3-3.1-6-7-6-2.5 0-4.7 1.1-5.9 2.8L4 6v3.5C3.4 10.3 3 11.4 3 12.5c0 1.4.6 2.6 1.5 3.5V19h3v-1.2c1.1.4 2.3.7 3.5.7s2.4-.3 3.5-.7V19h3v-2.4c1.3-1 2.5-2.7 2.5-4.6v-.5h1.5v-3H19z" fill="currentColor"/>',
  shield: '<path d="M12 2l8 4v6c0 5.2-3.4 9.9-8 11-4.6-1.1-8-5.8-8-11V6l8-4z" fill="currentColor"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/>',
  bank: '<path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 20h20M12 3l10 5H2l10-5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5" stroke="currentColor" stroke-width="2" fill="none"/><line x1="11" y1="18" x2="13" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  bus: '<rect x="4" y="3" width="16" height="14" rx="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 11h16M8 17v3m8-3v3M8 14h.01M16 14h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  bag: '<path d="M6 7h12l1 13H5L6 7zm3 0V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  gamepad: '<rect x="2" y="6" width="20" height="12" rx="4" stroke="currentColor" stroke-width="2" fill="none"/><path d="M6 12h4M8 10v4m7-2h.01M18 11h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  heart: '<path d="M12 21s-7-4.35-9.33-8.28C.92 9.76 2.57 5.5 6.5 5.5c2.1 0 3.7 1.15 4.5 2.4.8-1.25 2.4-2.4 4.5-2.4 3.93 0 5.58 4.26 3.83 7.22C19 16.65 12 21 12 21z" fill="currentColor"/>',
  dots: '<circle cx="6" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="18" cy="12" r="1.8" fill="currentColor"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="currentColor" stroke-width="2" fill="none"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="1" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 8v13M3 12h18" stroke="currentColor" stroke-width="2"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  swap: '<path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2m1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" stroke-width="2" fill="none"/>',
  user: '<circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" fill="currentColor"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" stroke="currentColor" stroke-width="2" fill="none"/>'
};

export function iconSvg(name, size = 20, className = '') {
  const path = ICONS[name] || ICONS.dots;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" class="${className}">${path}</svg>`;
}
