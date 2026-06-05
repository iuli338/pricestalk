// PriceStalk UI logic.
const $ = s => document.querySelector(s);
const api = (url, opt) => fetch(url, opt).then(r => r.json());
const post = (url, body) => api(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{})});
const fmt = p => p == null ? null : new Intl.NumberFormat('ro-RO',{style:'currency',currency:'RON'}).format(p);
const esc = s => (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// --- Theme ---
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3500); }

// ===================================================================
// Home: product entities grid
// ===================================================================
async function load(){
  const products = await api('/api/products');
  const grid = $('#grid');
  grid.innerHTML = '';
  $('#empty').style.display = products.length ? 'none' : 'block';
  for(const p of products) grid.appendChild(entityCard(p));
}

function entityCard(p){
  const el = document.createElement('div');
  el.className = 'card entity';
  el.onclick = () => openDetail(p.id);
  const price = p.min_price != null
    ? `<div class="price">${fmt(p.min_price)}</div>`
    : `<div class="price none">${t('card.no_price')}</div>`;
  const img = p.cover_image
    ? `<div class="card-img" style="background-image:url('${esc(p.cover_image)}')"></div>`
    : `<div class="card-img lc-noimg">${t('wizard.no_image')}</div>`;
  el.innerHTML = `
    ${img}
    <h3>${esc(p.title || p.query)}</h3>
    ${price}
    <div class="meta">${t('home.lowest_of', {n: p.listing_count})}</div>`;
  return el;
}

// ===================================================================
// Wizard
// ===================================================================
const STEPS = [
  {key:'emag',    label:'eMAG',    pinnable:true},
  {key:'altex',   label:'Altex',   pinnable:true},
  {key:'compari', label:'Compari', pinnable:false},
];
let WZ = null;  // {draft, step, pinnedUrls:Set}

async function addProduct(){
  const q = $('#q').value.trim();
  if(!q) return;
  $('#q').value = '';
  openWizardLoading(q);
  const draft = await post('/api/scout', {query:q});
  WZ = {draft, step:0, pinned:new Set()};
  renderWizard();
}

function openWizardLoading(q){
  openModal(`
    <h2>${t('wizard.scouting', {q: esc(q)})}</h2>
    <p class="muted">${t('wizard.scouting_note')}</p>
    <div class="spinner"></div>`, false);
}

function wizardSteps(){
  return STEPS.map((s,i) => {
    const cls = i===WZ.step ? 'active' : (i<WZ.step ? 'done' : '');
    return `<div class="wz-step ${cls}">${i+1}. ${s.label}</div>`;
  }).join('<span class="wz-sep">›</span>');
}

// sort: available + priced ascending first, no-price / out-of-stock last
function byPriceAsc(a, b){
  const rank = it => (it.available !== false && it.price > 0) ? 0 : 1;
  const ra = rank(a), rb = rank(b);
  if(ra !== rb) return ra - rb;
  return (a.price ?? Infinity) - (b.price ?? Infinity);
}

function renderWizard(){
  const isSummary = WZ.step >= STEPS.length;
  if(isSummary) return renderSummary();

  const step = STEPS[WZ.step];
  const items = [...(WZ.draft.results[step.key] || [])].sort(byPriceAsc);
  const cards = items.length ? items.map(it => listingCard(it, step.pinnable)).join('')
    : `<p class="muted">${t('wizard.no_results', {site: step.label})}</p>`;

  const note = step.pinnable ? t('wizard.pin_note') : t('wizard.compari_note');

  openModal(`
    <div class="wz-head">${wizardSteps()}</div>
    <h2>${step.label} <span class="muted">· ${t('wizard.found', {n: items.length})}</span></h2>
    <p class="muted">${note}</p>
    <div class="wz-grid">${cards}</div>
    <div class="wz-nav">
      <button class="btn" onclick="cancelWizard()">${t('wizard.cancel')}</button>
      <div class="row">
        ${WZ.step>0 ? `<button class="btn" onclick="wizPrev()">${t('wizard.back')}</button>`:''}
        <button class="btn btn-primary" onclick="wizNext()">${WZ.step===STEPS.length-1?t('wizard.review'):t('wizard.next')}</button>
      </div>
    </div>`);
}

function listingCard(it, pinnable){
  const pinned = it.url && WZ.pinned.has(it.url);
  const oos = it.available === false;
  const img = it.image
    ? `<div class="lc-img" style="background-image:url('${esc(it.image)}')"></div>`
    : `<div class="lc-img lc-noimg">${t('wizard.no_image')}</div>`;
  const pinBtn = pinnable
    ? `<button class="btn btn-sm ${pinned?'':'btn-primary'} lc-pin" ${pinned?'disabled':''}
         onclick='wizPin(${JSON.stringify(it).replace(/'/g,"&#39;")}, this)'>${pinned?t('wizard.pinned'):t('wizard.pin')}</button>`
    : `<span class="lc-ref">${t('wizard.market_price')}</span>`;
  return `
    <div class="lc${oos?' lc-oos':''}">
      ${img}
      <div class="lc-title" title="${esc(it.title)}">${esc(it.title)}</div>
      <div class="lc-price">${fmt(it.price)||'—'}${oos?`<span class="oos"> · ${t('wizard.oos')}</span>`:''}</div>
      ${pinBtn}
    </div>`;
}

async function wizPin(it, btn){
  btn.disabled = true; btn.textContent = '…';
  const res = await post(`/api/drafts/${WZ.draft.id}/pin`, it);
  if(res && res.url){ WZ.pinned.add(res.url); btn.textContent=t('wizard.pinned'); }
  else { btn.disabled=false; btn.textContent=t('wizard.pin'); }
}

function wizNext(){ WZ.step++; renderWizard(); }
function wizPrev(){ WZ.step--; renderWizard(); }

async function renderSummary(){
  const draft = await api('/api/drafts/'+WZ.draft.id);
  const pinned = draft.pinned;
  const bySite = {};
  for(const l of pinned){ (bySite[l.site] = bySite[l.site]||[]).push(l); }
  const minP = Math.min(...pinned.filter(l=>l.price>0).map(l=>l.price));
  const groups = Object.keys(bySite).length ? Object.entries(bySite).map(([site,ls]) => `
    <h3>${site} <span class="muted">· ${ls.length}</span></h3>
    ${ls.map(l => summaryRow(l)).join('')}`).join('') : `<p class="muted">${t('wizard.no_pinned')}</p>`;

  openModal(`
    <div class="wz-head">${STEPS.map(s=>`<div class="wz-step done">${s.label}</div>`).join('<span class="wz-sep">›</span>')} <span class="wz-sep">›</span> <div class="wz-step active">${t('wizard.summary')}</div></div>
    <h2>${t('wizard.review')}</h2>
    <p class="muted">${t('wizard.summary_meta', {q: esc(draft.query), n: pinned.length})}${pinned.length?t('wizard.summary_lowest', {price: fmt(minP)}):''}</p>
    ${groups}
    <div class="wz-nav">
      <button class="btn" onclick="cancelWizard()">${t('wizard.cancel')}</button>
      <div class="row">
        <button class="btn" onclick="WZ.step=${STEPS.length-1};renderWizard()">${t('wizard.back')}</button>
        <button class="btn btn-primary" ${pinned.length?'':'disabled'} onclick="finalizeWizard()">${t('wizard.finalize')}</button>
      </div>
    </div>`);
}

function summaryRow(l){
  return `<div class="listing">
    <a href="${l.url}" target="_blank">${esc(l.title)}</a>
    <span class="lp">${fmt(l.price)||'—'}</span>
  </div>`;
}

async function finalizeWizard(){
  await post(`/api/drafts/${WZ.draft.id}/finalize`);
  WZ = null;
  closeModal();
  toast(t('wizard.saved'));
  load();
}

async function cancelWizard(){
  if(WZ){ await fetch('/api/drafts/'+WZ.draft.id, {method:'DELETE'}); WZ=null; }
  closeModal();
}

// ===================================================================
// Detail modal
// ===================================================================
// id-safe key for a link's price slot
const slotId = url => 'pr_' + btoa(unescape(encodeURIComponent(url||''))).replace(/[^a-z0-9]/gi,'');

let DETAIL = null;  // current product in the detail modal

async function openDetail(id){
  const p = await api('/api/products/'+id);
  DETAIL = p;
  const bySite = {};
  for(const l of p.listings){ (bySite[l.site]=bySite[l.site]||[]).push(l); }
  const thumb = l => l.image
    ? `<div class="ln-img" style="background-image:url('${esc(l.image)}')"></div>`
    : `<div class="ln-img ln-noimg"></div>`;
  // URL of the cheapest available, priced link (gets the tag icon)
  const cheapestUrl = cheapestLinkUrl(p.listings);
  const groups = Object.entries(bySite).map(([site,ls]) => `
    <h3>${site} <span class="muted">· ${ls.length}</span></h3>
    ${ls.map(l => `
      <div class="listing${l.url===cheapestUrl?' cheapest':''}">
        <div class="ln-menu">
          <button class="kebab" title="${t('detail.actions')}" onclick="toggleMenu(event)">${KEBAB}</button>
          <div class="menu">
            <button class="menu-item danger" onclick='removeLink("${id}", ${JSON.stringify(l.url)})'>${t('detail.remove')}</button>
          </div>
        </div>
        ${thumb(l)}
        <a class="ln-title" href="${l.url||'#'}" target="_blank">${esc(l.title||l.url)}</a>
        <span class="lp-slot" id="${slotId(l.url)}">
          ${linkPriceHtml(l, l.url===cheapestUrl)}
        </span>
      </div>`).join('')}`).join('') || `<p class="muted">${t('detail.no_links')}</p>`;

  const coverHtml = p.cover_image
    ? `<div class="dt-img" style="background-image:url('${esc(p.cover_image)}')"></div>`
    : `<div class="dt-img lc-noimg">${t('wizard.no_image')}</div>`;

  openModal(`
    <button class="btn btn-sm close" onclick="closeModal()">${t('detail.close')}</button>
    <div class="dt-head">
      <div class="dt-img-wrap" onclick="openImagePicker('${id}')" title="${t('detail.change_image')}">
        ${coverHtml}
        <span class="dt-img-edit">${PENCIL}</span>
      </div>
      <div class="dt-info">
        <div id="dtTitle">${titleView(p)}</div>
        <div class="price ${p.min_price==null?'none':''}" id="dtMin">${p.min_price!=null?fmt(p.min_price):t('detail.no_price')}</div>
        <p class="muted">${t('detail.lowest_across', {n: p.listing_count})}</p>
        <p class="muted">${t('detail.initial_search', {q: esc(p.query)})}</p>
        <div class="row" style="margin-top:8px">
          <button class="btn btn-sm" id="refreshBtn" onclick="refreshDetail('${id}')">${t('detail.refresh')}</button>
          <button class="btn btn-sm" onclick="delProduct('${id}')">${t('detail.delete')}</button>
        </div>
      </div>
    </div>
    ${groups}`);
}

const PENCIL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
// price tag icon, shown next to the lowest price
const TAG = '<svg class="tag-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4a2 2 0 0 1 2-2h8a2 2 0 0 1 1.4.6l6.4 6.4a2 2 0 0 1 0 2.4Z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/></svg>';
// vertical 3-dot (kebab) menu icon
const KEBAB = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';

// open one kebab menu at a time; close others
function toggleMenu(e){
  e.stopPropagation();
  const menu = e.currentTarget.parentElement;
  const open = menu.classList.contains('open');
  document.querySelectorAll('.ln-menu.open').forEach(m => m.classList.remove('open'));
  if(!open) menu.classList.add('open');
}
// close menus on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.ln-menu.open').forEach(m => m.classList.remove('open'));
});

async function removeLink(id, url){
  if(!confirm(t('detail.remove_confirm'))) return;
  await fetch('/api/products/'+id+'/listings', {method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url})});
  openDetail(id);
  load();
}

// URL of the cheapest available, priced listing
function cheapestLinkUrl(listings){
  let best = null;
  for(const l of listings){
    if(l.available !== false && l.price > 0 && (!best || l.price < best.price)) best = l;
  }
  return best ? best.url : null;
}

// price cell for a link; cheapest one shows the tag icon
function linkPriceHtml(l, isCheapest){
  const price = `<span class="lp">${fmt(l.price)||'—'}</span>`;
  const oos = l.available===false ? `<span class="oos"> · ${t('wizard.oos')}</span>` : '';
  const tag = isCheapest ? `<span class="cheapest-ico" title="${t('detail.lowest_price')}">${TAG}</span>` : '';
  return `${tag}${price}${oos}`;
}

function titleView(p){
  return `<h2 class="dt-title-text">${esc(p.title)}
    <button class="btn-edit" title="${t('title.edit')}" onclick="editTitle('${p.id}')">${PENCIL}</button></h2>`;
}

function editTitle(id){
  const cur = DETAIL.title || '';
  $('#dtTitle').innerHTML = `
    <div class="title-edit">
      <input id="titleInput" class="title-input" type="text" value="${esc(cur)}"
             onkeydown="if(event.key==='Enter')saveTitle('${id}');if(event.key==='Escape')cancelTitle()">
      <div class="row" style="margin-top:6px">
        <button class="btn btn-sm btn-primary" onclick="saveTitle('${id}')">${t('title.save')}</button>
        <button class="btn btn-sm" onclick="cancelTitle()">${t('title.cancel')}</button>
      </div>
    </div>`;
  const inp = $('#titleInput'); inp.focus(); inp.select();
}

async function saveTitle(id){
  const val = $('#titleInput').value.trim();
  const p = await api('/api/products/'+id, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({title: val})});
  DETAIL.title = p.title;
  $('#dtTitle').innerHTML = titleView(p);
  load();
}
function cancelTitle(){ $('#dtTitle').innerHTML = titleView(DETAIL); }

// --- Image picker: choose cover from pinned links' images ---
function openImagePicker(id){
  const imgs = [...new Set(DETAIL.listings.map(l => l.image).filter(Boolean))];
  const tiles = imgs.length ? imgs.map(src => `
    <div class="pick-tile ${src===DETAIL.cover_image?'sel':''}"
         style="background-image:url('${esc(src)}')"
         onclick="pickImage('${id}', '${esc(src)}')"></div>`).join('')
    : `<p class="muted">${t('picker.none')}</p>`;
  openModal(`
    <button class="btn btn-sm close" onclick="openDetail('${id}')">${t('picker.back')}</button>
    <h2>${t('picker.choose')}</h2>
    <p class="muted">${t('picker.note')}</p>
    <div class="pick-grid">${tiles}</div>`);
}

async function pickImage(id, src){
  await api('/api/products/'+id, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({cover_image: src})});
  openDetail(id);
  load();
}

// Refresh link-by-link: spinner on each price slot, then show the new price.
async function refreshDetail(id){
  const b = $('#refreshBtn');
  if(b){ b.disabled = true; b.textContent = t('detail.refreshing'); }
  const p = await api('/api/products/'+id);
  let lastMin = null;
  const fresh = [];  // updated listing state, to recompute cheapest after
  for(const l of p.listings){
    if(!l.url) continue;
    const slot = document.getElementById(slotId(l.url));
    if(slot) slot.innerHTML = '<span class="mini-spinner"></span>';
    const res = await post('/api/products/'+id+'/refresh-one', {url: l.url});
    lastMin = res.min_price;
    fresh.push({url: l.url, price: res.price, available: res.available, dropped: res.dropped, error: res.error});
  }
  // re-render every slot now that prices are final; tag the cheapest
  const cheapestUrl = cheapestLinkUrl(fresh);
  for(const f of fresh){
    const slot = document.getElementById(slotId(f.url));
    if(!slot) continue;
    const isCheapest = f.url===cheapestUrl;
    const priceTxt = f.price!=null ? fmt(f.price) : (f.error ? t('detail.error') : '—');
    const tag = isCheapest ? `<span class="cheapest-ico" title="${t('detail.lowest_price')}">${TAG}</span>` : '';
    slot.innerHTML = tag +
      `<span class="lp ${f.dropped?'drop':''}">${priceTxt}${f.dropped?' ↓':''}</span>` +
      (f.available===false?`<span class="oos"> · ${t('wizard.oos')}</span>`:'');
    slot.closest('.listing').classList.toggle('cheapest', isCheapest);
  }
  const minEl = $('#dtMin');
  if(minEl){
    minEl.textContent = lastMin!=null ? fmt(lastMin) : t('detail.no_price');
    minEl.classList.toggle('none', lastMin==null);
  }
  if(b){ b.disabled = false; b.textContent = t('detail.refresh'); }
  load();
}

async function delProduct(id){
  if(!confirm(t('detail.delete_confirm'))) return;
  await fetch('/api/products/'+id, {method:'DELETE'});
  closeModal();
  load();
}

// ===================================================================
async function checkNotifications(){
  const n = await api('/api/notifications?clear=1');
  if(!n.length){ toast(t('notif.none')); return; }
  toast(t('notif.some', {n: n.length}));
  load();
}

// --- Modal helpers ---
function openModal(html, dismissable=true){
  $('#modal').innerHTML = html;
  const bg = $('#modalBg');
  bg.classList.add('open');
  bg.dataset.dismissable = dismissable ? '1' : '0';
}
function closeModal(){ $('#modalBg').classList.remove('open'); }

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.lang = LANG;
  applyStaticI18n();   // translate static DOM + set dropdown value
  $('#modalBg').addEventListener('click', e => {
    if(e.target === $('#modalBg') && $('#modalBg').dataset.dismissable === '1'){
      if(WZ) cancelWizard(); else closeModal();
    }
  });
  load();
});
