// Centralized API client. All backend calls go through here.

const doFetch = (url, method, body) => fetch(url, {
  method,
  headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
  body: body != null ? JSON.stringify(body) : undefined,
});

const req = (url, method, body) => doFetch(url, method, body).then(r => r.json());

// like req but exposes status (for endpoints that signal with codes, e.g. 409)
const reqStatus = (url, method, body) =>
  doFetch(url, method, body).then(async r => ({ ok: r.ok, status: r.status, data: await r.json() }));

export const api = {
  // products
  listProducts:   ()           => req('/api/products', 'GET'),
  getProduct:     (id)         => req(`/api/products/${id}`, 'GET'),
  createProduct:  (query, ls)  => req('/api/products', 'POST', { query, listings: ls }),
  addLinks:       (id, ls)     => req(`/api/products/${id}/links`, 'POST', { listings: ls }),
  updateProduct:  (id, f)      => req(`/api/products/${id}`, 'PATCH', f),
  deleteProduct:  (id)         => req(`/api/products/${id}`, 'DELETE'),
  refresh:        (id)         => reqStatus(`/api/products/${id}/refresh`, 'POST'),
  removeListing:  (id, url)    => req(`/api/products/${id}/listings`, 'DELETE', { url }),

  // wizard scout draft (results only; pinning is client-side)
  scout:          (query)      => req('/api/scout', 'POST', { query }),
  discardDraft:   (id)         => req(`/api/drafts/${id}`, 'DELETE'),

  // misc
  notifications:  ()           => req('/api/notifications?clear=1', 'GET'),
};
