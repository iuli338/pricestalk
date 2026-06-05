// Scout wizard: search 3 sites, pin/unpin LOCALLY, then send the final list once.
//
// Two modes:
//   create -> POST /api/products with the pinned listings (new entity)
//   append -> POST /api/products/<id>/links with the pinned listings
//
// Pinning is entirely client-side (wizard.pinned: Map<url, listing>). The draft
// on the server only holds scout results; it is discarded at the end.
import { api } from './api.js';
import { $, esc } from './dom.js';
import { fmt } from './format.js';
import { t } from './i18n.js';
import { openModal, closeModal } from './modal.js';
import { toast } from './toast.js';
import { wizard, setWizard } from './store.js';

const STEPS = [
  { key: 'emag',    label: 'eMAG',    pinnable: true },
  { key: 'altex',   label: 'Altex',   pinnable: true },
  { key: 'compari', label: 'Compari', pinnable: false },
];

// callbacks invoked when a wizard finishes/cancels (set by main.js)
let afterFinalize = () => {};
export const onWizardDone = fn => { afterFinalize = fn; };

// start a brand-new product wizard from the search box
export async function startCreateWizard(query) {
  openWizardLoading(query);
  const draft = await api.scout(query);
  setWizard({ draft, step: 0, mode: 'create', pinned: new Map(), preexisting: new Set() });
  renderWizard();
}

// start an "add links" wizard for an existing product.
// existingUrls = links already on the product (shown as 'Already added').
export async function startAppendWizard(query, productId, existingUrls = []) {
  openWizardLoading(query);
  const draft = await api.scout(query);
  setWizard({
    draft, step: 0, mode: 'append', productId,
    pinned: new Map(),                     // newly pinned this session
    preexisting: new Set(existingUrls),    // already on the product
  });
  renderWizard();
}

function openWizardLoading(q) {
  openModal(`
    <h2>${t('wizard.scouting', { q: esc(q) })}</h2>
    <p class="muted">${t('wizard.scouting_note')}</p>
    <div class="spinner"></div>`, { dismissable: false });
}

function stepsHeader(activeLabel) {
  const parts = STEPS.map((s, i) => {
    const cls = i === wizard.step ? 'active' : (i < wizard.step ? 'done' : '');
    return `<div class="wz-step ${cls}">${i + 1}. ${s.label}</div>`;
  });
  if (activeLabel) parts.push(`<div class="wz-step active">${activeLabel}</div>`);
  return parts.join('<span class="wz-sep">›</span>');
}

// available + priced ascending first; no-price / out-of-stock last
function byPriceAsc(a, b) {
  const rank = it => (it.available !== false && it.price > 0) ? 0 : 1;
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  return (a.price ?? Infinity) - (b.price ?? Infinity);
}

const ACTIONS = {
  cancel: () => cancelWizard(),
  back:   () => { wizard.step--; renderWizard(); },
  next:   () => { wizard.step++; renderWizard(); },
  pin:    (el) => wizPin(wizard.current[+el.dataset.idx]),
  unpin:  (el) => wizUnpin(wizard.current[+el.dataset.idx]),
  finalize: () => finalizeWizard(),
};

function renderWizard() {
  if (wizard.step >= STEPS.length) return renderSummary();

  const step = STEPS[wizard.step];
  const items = [...(wizard.draft.results[step.key] || [])].sort(byPriceAsc);
  wizard.current = items;   // index referenced by data-idx (avoids JSON in attrs)
  const cards = items.length
    ? items.map((it, i) => listingCard(it, i, step.pinnable)).join('')
    : `<p class="muted">${t('wizard.no_results', { site: step.label })}</p>`;
  const note = step.pinnable ? t('wizard.pin_note') : t('wizard.compari_note');
  const last = wizard.step === STEPS.length - 1;

  openModal(`
    <div class="wz-head">${stepsHeader()}</div>
    <h2>${step.label} <span class="muted">· ${t('wizard.found', { n: items.length })}</span></h2>
    <p class="muted">${note}</p>
    <div class="wz-grid">${cards}</div>
    <div class="wz-nav">
      <button class="btn" data-action="cancel">${t('wizard.cancel')}</button>
      <div class="row">
        ${wizard.step > 0 ? `<button class="btn" data-action="back">${t('wizard.back')}</button>` : ''}
        <button class="btn btn-primary" data-action="next">${last ? t('wizard.review') : t('wizard.next')}</button>
      </div>
    </div>`, { dismissable: true, onDismiss: cancelWizard, actions: ACTIONS });
}

function listingCard(it, idx, pinnable) {
  const pinned = it.url && wizard.pinned.has(it.url);
  const already = it.url && wizard.preexisting && wizard.preexisting.has(it.url);
  const oos = it.available === false;
  const img = it.image
    ? `<div class="lc-img" style="background-image:url('${esc(it.image)}')"></div>`
    : `<div class="lc-img lc-noimg">${t('wizard.no_image')}</div>`;
  let pinBtn;
  if (!pinnable) {
    pinBtn = `<span class="lc-ref">${t('wizard.market_price')}</span>`;
  } else if (already) {
    pinBtn = `<button class="btn btn-sm lc-pin" disabled>${t('wizard.already_added')}</button>`;
  } else if (pinned) {
    // pinned this session -> allow unpin
    pinBtn = `<button class="btn btn-sm lc-pin" data-action="unpin" data-idx="${idx}">${t('wizard.pinned')}</button>`;
  } else {
    pinBtn = `<button class="btn btn-sm btn-primary lc-pin" data-action="pin" data-idx="${idx}">${t('wizard.pin')}</button>`;
  }
  return `
    <div class="lc${oos ? ' lc-oos' : ''}${already ? ' lc-added' : ''}">
      ${img}
      <div class="lc-title" title="${esc(it.title)}">${esc(it.title)}</div>
      <div class="lc-price">${fmt(it.price) || '—'}${oos ? `<span class="oos"> · ${t('wizard.oos')}</span>` : ''}</div>
      ${pinBtn}
    </div>`;
}

// pin/unpin are local-only: mutate the Map and re-render the step.
function wizPin(it) {
  if (it.url) wizard.pinned.set(it.url, it);
  renderWizard();
}

function wizUnpin(it) {
  if (it.url) wizard.pinned.delete(it.url);
  renderWizard();
}

function renderSummary() {
  const pinned = [...wizard.pinned.values()];   // local Map -> array
  const bySite = {};
  for (const l of pinned) (bySite[l.site] = bySite[l.site] || []).push(l);
  const minP = Math.min(...pinned.filter(l => l.price > 0).map(l => l.price));
  const groups = Object.keys(bySite).length
    ? Object.entries(bySite).map(([site, ls]) => `
        <h3>${site} <span class="muted">· ${ls.length}</span></h3>
        ${ls.map(summaryRow).join('')}`).join('')
    : `<p class="muted">${t('wizard.no_pinned')}</p>`;
  const finishLabel = wizard.mode === 'append' ? t('wizard.add_links') : t('wizard.finalize');

  openModal(`
    <div class="wz-head">${STEPS.map(s => `<div class="wz-step done">${s.label}</div>`).join('<span class="wz-sep">›</span>')}
      <span class="wz-sep">›</span> <div class="wz-step active">${t('wizard.summary')}</div></div>
    <h2>${t('wizard.review')}</h2>
    <p class="muted">${t('wizard.summary_meta', { q: esc(wizard.draft.query), n: pinned.length })}${pinned.length ? t('wizard.summary_lowest', { price: fmt(minP) }) : ''}</p>
    ${groups}
    <div class="wz-nav">
      <button class="btn" data-action="cancel">${t('wizard.cancel')}</button>
      <div class="row">
        <button class="btn" data-action="back">${t('wizard.back')}</button>
        <button class="btn btn-primary" ${pinned.length ? '' : 'disabled'} data-action="finalize">${finishLabel}</button>
      </div>
    </div>`, { dismissable: true, onDismiss: cancelWizard, actions: { ...ACTIONS, back: () => { wizard.step = STEPS.length - 1; renderWizard(); } } });
}

function summaryRow(l) {
  return `<div class="listing">
    <a href="${l.url}" target="_blank">${esc(l.title)}</a>
    <span class="lp">${fmt(l.price) || '—'}</span>
  </div>`;
}

// send the locally-pinned listings in one call, then discard the scout draft
async function finalizeWizard() {
  const { mode, productId, draft } = wizard;
  const listings = [...wizard.pinned.values()];
  if (mode === 'append') {
    await api.addLinks(productId, listings);
  } else {
    await api.createProduct(draft.query, listings);
  }
  api.discardDraft(draft.id);   // fire-and-forget cleanup
  setWizard(null);
  closeModal();
  toast(mode === 'append' ? t('wizard.links_added') : t('wizard.saved'));
  afterFinalize(mode === 'append' ? productId : null);
}

function cancelWizard() {
  if (wizard) { api.discardDraft(wizard.draft.id); setWizard(null); }
  closeModal();
  afterFinalize(null);
}
