// Centralized API client. All backend calls go through here.

const json = r => r.json();

const req = (url, method, body) => fetch(url, {
  method,
  headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
  body: body != null ? JSON.stringify(body) : undefined,
}).then(json);

export const api = {
  // products
  listProducts:   ()        => req('/api/products', 'GET'),
  getProduct:     (id)      => req(`/api/products/${id}`, 'GET'),
  updateProduct:  (id, f)   => req(`/api/products/${id}`, 'PATCH', f),
  deleteProduct:  (id)      => req(`/api/products/${id}`, 'DELETE'),
  refreshOne:     (id, url) => req(`/api/products/${id}/refresh-one`, 'POST', { url }),
  removeListing:  (id, url) => req(`/api/products/${id}/listings`, 'DELETE', { url }),

  // wizard drafts
  scout:          (query)   => req('/api/scout', 'POST', { query }),
  getDraft:       (id)      => req(`/api/drafts/${id}`, 'GET'),
  pinToDraft:     (id, l)   => req(`/api/drafts/${id}/pin`, 'POST', l),
  finalizeDraft:  (id)      => req(`/api/drafts/${id}/finalize`, 'POST'),
  appendDraft:    (pid, did) => req(`/api/products/${pid}/append`, 'POST', { draft_id: did }),
  discardDraft:   (id)      => req(`/api/drafts/${id}`, 'DELETE'),

  // misc
  notifications:  ()        => req('/api/notifications?clear=1', 'GET'),
};
