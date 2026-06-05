// Shared client state + small pure helpers used across features.

// current product shown in the detail modal
export const detail = { product: null };

// product ids whose price refresh is in flight (started this session).
// Lets the UI keep showing loading across modal/home re-renders.
export const refreshing = new Set();

// active wizard session: { draft, step, pinned:Set<url>, mode, productId }
export let wizard = null;
export const setWizard = w => { wizard = w; };

// URL of the cheapest available, priced listing (gets the tag icon / outline)
export function cheapestLinkUrl(listings) {
  let best = null;
  for (const l of listings) {
    if (l.available !== false && l.price > 0 && (!best || l.price < best.price)) best = l;
  }
  return best ? best.url : null;
}
