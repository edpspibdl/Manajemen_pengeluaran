/**
 * Hash a 4-6 digit PIN locally using SHA-256 (WebCrypto or deterministic fallback).
 * @param {string} pin
 * @returns {Promise<string>}
 */
export async function hashPin(pin) {
  const input = `kosmate-pin:${String(pin)}`;
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const enc = new TextEncoder().encode(input);
    const buf = await globalThis.crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback FNV-1a 64-bit style multi-round hash when subtle crypto is unavailable in insecure contexts
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}
