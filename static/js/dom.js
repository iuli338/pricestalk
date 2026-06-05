// DOM helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// escape text for safe interpolation into HTML
export const esc = s => (s || '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// id-safe key derived from a URL (used for per-link price slots)
export const slotId = url =>
  'pr_' + btoa(unescape(encodeURIComponent(url || ''))).replace(/[^a-z0-9]/gi, '');
