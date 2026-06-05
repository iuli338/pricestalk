// Detail modal: link list, title edit, image picker, refresh, remove, add-links.
import { api } from './api.js';
import { $, esc, slotId } from './dom.js';
import { fmt } from './format.js';
import { t } from './i18n.js';
import { PENCIL, TAG, KEBAB } from './icons.js';
import { openModal, closeModal } from './modal.js';
import { detail, cheapestLinkUrl } from './store.js';
import { startAppendWizard } from './wizard.js';

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

export async function openDetail(id) {
  const p = await api.getProduct(id);
  detail.product = p;

  const bySite = {};
  for (const l of p.listings) (bySite[l.site] = bySite[l.site] || []).push(l);
  const cheapestUrl = cheapestLinkUrl(p.listings);

  const groups = Object.entries(bySite).map(([site, ls]) => `
    <h3>${site} <span class="muted">· ${ls.length}</span></h3>
    ${ls.map(l => listingRow(l, l.url === cheapestUrl)).join('')}`).join('')
    || `<p class="muted">${t('detail.no_links')}</p>`;

  const coverHtml = p.cover_image
    ? `<div class="dt-img" style="background-image:url('${esc(p.cover_image)}')"></div>`
    : `<div class="dt-img lc-noimg">${t('wizard.no_image')}</div>`;

  openModal(`
    <div class="dt-fixed">
      <button class="btn btn-sm close" data-action="close">${t('detail.close')}</button>
      <div class="dt-head">
        <div class="dt-img-wrap" data-action="pickImage" title="${t('detail.change_image')}">
          ${coverHtml}
          <span class="dt-img-edit">${PENCIL}</span>
        </div>
        <div class="dt-info">
          <div id="dtTitle">${titleView(p)}</div>
          <div class="price ${p.min_price == null ? 'none' : ''}" id="dtMin">${p.min_price != null ? fmt(p.min_price) : t('detail.no_price')}</div>
          <p class="muted">${t('detail.lowest_across', { n: p.listing_count })}</p>
          <p class="muted">${t('detail.initial_search', { q: esc(p.query) })}</p>
          <div class="row" style="margin-top:8px">
            <button class="btn btn-sm btn-primary" data-action="addLinks">${t('detail.add_links')}</button>
            <button class="btn btn-sm" id="refreshBtn" data-action="refresh">${t('detail.refresh')}</button>
            <button class="btn btn-sm" data-action="del">${t('detail.delete')}</button>
          </div>
        </div>
      </div>
    </div>
    <div class="dt-links">${groups}</div>`, { dismissable: true, actions: ACTIONS });
}

function listingRow(l, isCheapest) {
  const thumb = l.image
    ? `<div class="ln-img" style="background-image:url('${esc(l.image)}')"></div>`
    : `<div class="ln-img ln-noimg"></div>`;
  return `
    <div class="listing${isCheapest ? ' cheapest' : ''}">
      <div class="ln-menu">
        <button class="kebab" title="${t('detail.actions')}" data-action="toggleMenu">${KEBAB}</button>
        <div class="menu">
          <button class="menu-item danger" data-action="remove" data-url="${esc(l.url)}">${t('detail.remove')}</button>
        </div>
      </div>
      ${thumb}
      <a class="ln-title" href="${l.url || '#'}" target="_blank">${esc(l.title || l.url)}</a>
      <span class="lp-slot" id="${slotId(l.url)}">${linkPriceHtml(l, isCheapest)}</span>
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
function titleView(p) {
  return `<h2 class="dt-title-text">${esc(p.title)}
    <button class="btn-edit" title="${t('title.edit')}" data-action="editTitle">${PENCIL}</button></h2>`;
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

// --- refresh link-by-link ---
async function refreshDetail() {
  const id = detail.product.id;
  const b = $('#refreshBtn');
  if (b) { b.disabled = true; b.textContent = t('detail.refreshing'); }
  const p = await api.getProduct(id);
  let lastMin = null;
  const fresh = [];
  for (const l of p.listings) {
    if (!l.url) continue;
    const slot = document.getElementById(slotId(l.url));
    if (slot) slot.innerHTML = '<span class="mini-spinner"></span>';
    const res = await api.refreshOne(id, l.url);
    lastMin = res.min_price;
    fresh.push({ url: l.url, price: res.price, available: res.available, dropped: res.dropped, error: res.error });
  }
  const cheapestUrl = cheapestLinkUrl(fresh);
  for (const f of fresh) {
    const slot = document.getElementById(slotId(f.url));
    if (!slot) continue;
    const isCheapest = f.url === cheapestUrl;
    const priceTxt = f.price != null ? fmt(f.price) : (f.error ? t('detail.error') : '—');
    const tag = isCheapest ? `<span class="cheapest-ico" title="${t('detail.lowest_price')}">${TAG}</span>` : '';
    slot.innerHTML = tag +
      `<span class="lp ${f.dropped ? 'drop' : ''}">${priceTxt}${f.dropped ? ' ↓' : ''}</span>` +
      (f.available === false ? `<span class="oos"> · ${t('wizard.oos')}</span>` : '');
    slot.closest('.listing').classList.toggle('cheapest', isCheapest);
  }
  const minEl = $('#dtMin');
  if (minEl) {
    minEl.textContent = lastMin != null ? fmt(lastMin) : t('detail.no_price');
    minEl.classList.toggle('none', lastMin == null);
  }
  if (b) { b.disabled = false; b.textContent = t('detail.refresh'); }
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
