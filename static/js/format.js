// Formatting helpers.

const RON = new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' });

// format a RON price; null/undefined -> null
export const fmt = p => p == null ? null : RON.format(p);
