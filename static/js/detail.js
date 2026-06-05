// Detail modal: link list, title edit, image picker, refresh, remove, add-links.
import { api } from './api.js';
import { $, esc, slotId } from './dom.js';
import { fmt } from './format.js';
import { t } from './i18n.js';
import { PENCIL, TAG, KEBAB } from './icons.js';
import { openModal, closeModal } from './modal.js';
import { detail, cheapestLinkUrl, refreshing } from './store.js';
import { startAppendWizard } from './wizard.js';
import { toast } from './toast.js';

// reload the home grid after changes (set by main.js to avoid a circular import)
let reloadHome = () => {};
export const onDetailReload = fn => { reloadHome = fn; };

const ACTIONS = {
  close:       () => closeModal(),
  editTitle:   () => editTitle(),
  saveTitle:   () => saveTitle(),
  cancelTitle: () => { $('#dtTitle').innerHTML = titleView(detail.product); },
  pickImage:   (el) => openImagePicker(),
  chooseImage: (el, ds) => pickImage(ds.src),
  backToDetail:() => openDetail(detail.product.id),
  refresh:     () => refreshDetail(),
  addLinks:    () => addLinks(),
  del:         () => delProduct(),
  toggleMenu:  (el) => toggleMenu(el),
  remove:      (el, ds) => removeLink(ds.url),
};

// a product is "busy" if the backend says so OR we started a refresh this session
function isBusy(p) {
  return !!p && (p.refreshing || refreshing.has(p.id));
}

export async function openDetail(id) {
  const p = await api.getProduct(id);
  detail.product = p;
  const busy = isBusy(p);

  // if it's refreshing but we have no local watcher, attach one (other tab / reopen)
  if (busy && !refreshing.has(id)) watchRefresh(id);

  const bySite = {};
  for (const l of p.listings) (bySite[l.site] = bySite[l.site] || []).push(l);
  const cheapestUrl = cheapestLinkUrl(p.listings);

  const groups = Object.entries(bySite).map(([site, ls]) => `
    <h3>${site} <span class="muted">· ${ls.length}</span></h3>
    ${ls.map(l => listingRow(l, l.url === cheapestUrl, busy)).join('')}`).join('')
    || `<p class="muted">${t('detail.no_links')}</p>`;

  const coverHtml = p.cover_image
    ? `<div class="dt-img" style="background-image:url('${esc(p.cover_image)}')"></div>`
    : `<div class="dt-img lc-noimg">${t('wizard.no_image')}</div>`;

  const dis = busy ? 'disabled' : '';
  openModal(`
    <div class="dt-fixed">
      <button class="btn btn-sm close" data-action="close">${t('detail.close')}</button>
      <div class="dt-head">
        <div class="dt-img-wrap ${busy ? 'is-busy' : ''}" ${busy ? '' : 'data-action="pickImage"'} title="${t('detail.change_image')}">
          ${coverHtml}
          ${busy ? '' : `<span class="dt-img-edit">${PENCIL}</span>`}
        </div>
        <div class="dt-info">
          <div id="dtTitle">${titleView(p, busy)}</div>
          <div class="price ${p.min_price == null ? 'none' : ''}" id="dtMin">${busy ? `<span class="mini-spinner"></span>` : (p.min_price != null ? fmt(p.min_price) : t('detail.no_price'))}</div>
          <p class="muted">${t('detail.lowest_across', { n: p.listing_count })}</p>
          <p class="muted">${t('detail.initial_search', { q: esc(p.query) })}</p>
          <div class="row" style="margin-top:8px">
            <button class="btn btn-sm btn-primary" data-action="addLinks" ${dis}>${t('detail.add_links')}</button>
            <button class="btn btn-sm" id="refreshBtn" data-action="refresh" ${dis}>${busy ? t('detail.refreshing') : t('detail.refresh')}</button>
            <button class="btn btn-sm" data-action="del" ${dis}>${t('detail.delete')}</button>
          </div>
        </div>
      </div>
    </div>
    <div class="dt-links">${groups}</div>`, { dismissable: true, actions: ACTIONS });
}

function listingRow(l, isCheapest, busy) {
  const thumb = l.image
    ? `<div class="ln-img" style="background-image:url('${esc(l.image)}')"></div>`
    : `<div class="ln-img ln-noimg"></div>`;
  const menu = busy ? '' : `
      <div class="ln-menu">
        <button class="kebab" title="${t('detail.actions')}" data-action="toggleMenu">${KEBAB}</button>
        <div class="menu">
          <button class="menu-item danger" data-action="remove" data-url="${esc(l.url)}">${t('detail.remove')}</button>
        </div>
      </div>`;
  const priceCell = busy ? '<span class="mini-spinner"></span>' : linkPriceHtml(l, isCheapest);
  return `
    <div class="listing${isCheapest && !busy ? ' cheapest' : ''}">
      ${menu}
      ${thumb}
      <a class="ln-title" href="${l.url || '#'}" target="_blank">${esc(l.title || l.url)}</a>
      <span class="lp-slot" id="${slotId(l.url)}">${priceCell}</span>
    </div>`;
}

// price cell for a link; cheapest one shows the tag icon
export function linkPriceHtml(l, isCheapest) {
  const price = `<span class="lp">${fmt(l.price) || '—'}</span>`;
  const oos = l.available === false ? `<span class="oos"> · ${t('wizard.oos')}</span>` : '';
  const tag = isCheapest ? `<span class="cheapest-ico" title="${t('detail.lowest_price')}">${TAG}</span>` : '';
  return `${tag}${price}${oos}`;
}

// --- kebab menu (delegated; closes others) ---
function toggleMenu(btn) {
  const menu = btn.parentElement;
  const open = menu.classList.contains('open');
  document.querySelectorAll('.ln-menu.open').forEach(m => m.classList.remove('open'));
  if (!open) menu.classList.add('open');
}

async function removeLink(url) {
  if (!confirm(t('detail.remove_confirm'))) return;
  await api.removeListing(detail.product.id, url);
  openDetail(detail.product.id);
  reloadHome();
}

// --- title edit ---
function titleView(p, busy) {
  const edit = busy ? '' : `<button class="btn-edit" title="${t('title.edit')}" data-action="editTitle">${PENCIL}</button>`;
  return `<h2 class="dt-title-text">${esc(p.title)} ${edit}</h2>`;
}

function editTitle() {
  const cur = detail.product.title || '';
  $('#dtTitle').innerHTML = `
    <div class="title-edit">
      <input id="titleInput" class="title-input" type="text" value="${esc(cur)}"
             onkeydown="if(event.key==='Enter')this.nextElementSibling.querySelector('[data-action=saveTitle]').click();if(event.key==='Escape')this.nextElementSibling.querySelector('[data-action=cancelTitle]').click()">
      <div class="row" style="margin-top:6px">
        <button class="btn btn-sm btn-primary" data-action="saveTitle">${t('title.save')}</button>
        <button class="btn btn-sm" data-action="cancelTitle">${t('title.cancel')}</button>
      </div>
    </div>`;
  const inp = $('#titleInput'); inp.focus(); inp.select();
}

async function saveTitle() {
  const val = $('#titleInput').value.trim();
  const p = await api.updateProduct(detail.product.id, { title: val });
  detail.product.title = p.title;
  $('#dtTitle').innerHTML = titleView(p);
  reloadHome();
}

// --- image picker ---
function openImagePicker() {
  const id = detail.product.id;
  const imgs = [...new Set(detail.product.listings.map(l => l.image).filter(Boolean))];
  const tiles = imgs.length
    ? imgs.map(src => `
        <div class="pick-tile ${src === detail.product.cover_image ? 'sel' : ''}"
             style="background-image:url('${esc(src)}')"
             data-action="chooseImage" data-src="${esc(src)}"></div>`).join('')
    : `<p class="muted">${t('picker.none')}</p>`;
  openModal(`
    <button class="btn btn-sm close" data-action="backToDetail">${t('picker.back')}</button>
    <h2>${t('picker.choose')}</h2>
    <p class="muted">${t('picker.note')}</p>
    <div class="pick-grid">${tiles}</div>`, { dismissable: true, actions: ACTIONS });
}

async function pickImage(src) {
  await api.updateProduct(detail.product.id, { cover_image: src });
  openDetail(detail.product.id);
  reloadHome();
}

// --- add links (reuse wizard in append mode) ---
function addLinks() {
  const p = detail.product;
  const existing = p.listings.map(l => l.url).filter(Boolean);
  startAppendWizard(p.query, p.id, existing);
}

// --- refresh: one backend call, all prices loading, toast at the end ---
async function refreshDetail() {
  const id = detail.product.id;
  if (refreshing.has(id)) return;          // already in flight
  refreshing.add(id);
  if (detail.product && detail.product.id === id) openDetail(id);  // re-render as busy
  reloadHome();                            // card shows loading too

  let res;
  try {
    res = await api.refresh(id);
  } finally {
    refreshing.delete(id);
  }

  if (res && res.status === 409) {         // someone else was already refreshing
    toast(t('detail.refresh_busy'));
  } else if (res && res.ok) {
    toast(t('detail.refresh_done'));
  } else {
    toast(t('detail.refresh_error'));
  }
  if (detail.product && detail.product.id === id) openDetail(id);  // show fresh prices
  reloadHome();
}

// attach to a refresh already running (modal reopened / another tab); poll to finish
async function watchRefresh(id) {
  refreshing.add(id);
  try {
    while (true) {
      await new Promise(r => setTimeout(r, 1500));
      const p = await api.getProduct(id);
      if (!p || !p.refreshing) break;
    }
  } finally {
    refreshing.delete(id);
  }
  if (detail.product && detail.product.id === id) openDetail(id);
  reloadHome();
}

async function delProduct() {
  if (!confirm(t('detail.delete_confirm'))) return;
  await api.deleteProduct(detail.product.id);
  closeModal();
  reloadHome();
}

// close any open kebab menu on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.ln-menu')) {
    document.querySelectorAll('.ln-menu.open').forEach(m => m.classList.remove('open'));
  }
});
