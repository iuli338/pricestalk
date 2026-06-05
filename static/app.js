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
    : `<div class="price none">No price yet</div>`;
  el.innerHTML = `
    <h3>${esc(p.query)}</h3>
    ${price}
    <div class="meta">lowest of ${p.listing_count} link(s)</div>`;
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
    <h2>Scouting “${esc(q)}”…</h2>
    <p class="muted">Searching eMAG, Altex and Compari. This can take a moment.</p>
    <div class="spinner"></div>`, false);
}

function wizardSteps(){
  return STEPS.map((s,i) => {
    const cls = i===WZ.step ? 'active' : (i<WZ.step ? 'done' : '');
    return `<div class="wz-step ${cls}">${i+1}. ${s.label}</div>`;
  }).join('<span class="wz-sep">›</span>');
}

function renderWizard(){
  const isSummary = WZ.step >= STEPS.length;
  if(isSummary) return renderSummary();

  const step = STEPS[WZ.step];
  const items = WZ.draft.results[step.key] || [];
  const cards = items.length ? items.map(it => listingCard(it, step.pinnable)).join('')
    : `<p class="muted">No results from ${step.label}.</p>`;

  const note = step.pinnable
    ? `Pin the listings you want to track.`
    : `Compari shows the lowest market price — reference only, nothing to pin here.`;

  openModal(`
    <div class="wz-head">${wizardSteps()}</div>
    <h2>${step.label} <span class="muted">· ${items.length} found</span></h2>
    <p class="muted">${note}</p>
    <div class="wz-grid">${cards}</div>
    <div class="wz-nav">
      <button class="btn" onclick="cancelWizard()">Cancel</button>
      <div class="row">
        ${WZ.step>0 ? `<button class="btn" onclick="wizPrev()">Back</button>`:''}
        <button class="btn btn-primary" onclick="wizNext()">${WZ.step===STEPS.length-1?'Review':'Next'}</button>
      </div>
    </div>`);
}

function listingCard(it, pinnable){
  const pinned = it.url && WZ.pinned.has(it.url);
  const img = it.image
    ? `<div class="lc-img" style="background-image:url('${esc(it.image)}')"></div>`
    : `<div class="lc-img lc-noimg">no image</div>`;
  const pinBtn = pinnable
    ? `<button class="btn btn-sm ${pinned?'':'btn-primary'} lc-pin" ${pinned?'disabled':''}
         onclick='wizPin(${JSON.stringify(it).replace(/'/g,"&#39;")}, this)'>${pinned?'Pinned ✓':'Pin'}</button>`
    : `<span class="lc-ref">market price</span>`;
  return `
    <div class="lc">
      ${img}
      <div class="lc-title" title="${esc(it.title)}">${esc(it.title)}</div>
      <div class="lc-price">${fmt(it.price)||'—'}</div>
      ${pinBtn}
    </div>`;
}

async function wizPin(it, btn){
  btn.disabled = true; btn.textContent = '…';
  const res = await post(`/api/drafts/${WZ.draft.id}/pin`, it);
  if(res && res.url){ WZ.pinned.add(res.url); btn.textContent='Pinned ✓'; }
  else { btn.disabled=false; btn.textContent='Pin'; }
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
    ${ls.map(l => summaryRow(l)).join('')}`).join('') : '<p class="muted">No links pinned. Go back to pin some.</p>';

  openModal(`
    <div class="wz-head">${STEPS.map(s=>`<div class="wz-step done">${s.label}</div>`).join('<span class="wz-sep">›</span>')} <span class="wz-sep">›</span> <div class="wz-step active">Summary</div></div>
    <h2>Review</h2>
    <p class="muted">“${esc(draft.query)}” · ${pinned.length} link(s)${pinned.length?` · lowest ${fmt(minP)}`:''}</p>
    ${groups}
    <div class="wz-nav">
      <button class="btn" onclick="cancelWizard()">Cancel</button>
      <div class="row">
        <button class="btn" onclick="WZ.step=${STEPS.length-1};renderWizard()">Back</button>
        <button class="btn btn-primary" ${pinned.length?'':'disabled'} onclick="finalizeWizard()">Finalize</button>
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
  toast('Product saved.');
  load();
}

async function cancelWizard(){
  if(WZ){ await fetch('/api/drafts/'+WZ.draft.id, {method:'DELETE'}); WZ=null; }
  closeModal();
}

// ===================================================================
// Detail modal
// ===================================================================
async function openDetail(id){
  const p = await api('/api/products/'+id);
  const bySite = {};
  for(const l of p.listings){ (bySite[l.site]=bySite[l.site]||[]).push(l); }
  const groups = Object.entries(bySite).map(([site,ls]) => `
    <h3>${site} <span class="muted">· ${ls.length}</span></h3>
    ${ls.map(l => `
      <div class="listing">
        <a href="${l.url||'#'}" target="_blank">${esc(l.title||l.url)}</a>
        <span>
          <span class="lp">${fmt(l.price)||'—'}</span>
          ${l.available===false?'<span class="oos"> · out of stock</span>':''}
        </span>
      </div>`).join('')}`).join('') || '<p class="muted">No links.</p>';

  openModal(`
    <button class="btn btn-sm close" onclick="closeModal()">Close</button>
    <h2>${esc(p.query)}</h2>
    <div class="price ${p.min_price==null?'none':''}">${p.min_price!=null?fmt(p.min_price):'No price yet'}</div>
    <p class="muted">Lowest across ${p.listing_count} link(s)</p>
    <div class="row" style="margin:12px 0">
      <button class="btn btn-sm" id="refreshBtn" onclick="refreshDetail('${id}')">Refresh prices</button>
      <button class="btn btn-sm" onclick="delProduct('${id}')">Delete</button>
    </div>
    ${groups}`);
}

async function refreshDetail(id){
  const b = $('#refreshBtn'); if(b){ b.disabled=true; b.textContent='Refreshing…'; }
  await post('/api/products/'+id+'/refresh');
  openDetail(id);
  load();
}

async function delProduct(id){
  if(!confirm('Delete this product?')) return;
  await fetch('/api/products/'+id, {method:'DELETE'});
  closeModal();
  load();
}

// ===================================================================
async function checkNotifications(){
  const n = await api('/api/notifications?clear=1');
  if(!n.length){ toast('No price drops.'); return; }
  toast(`${n.length} price drop(s) detected. Open a product to see.`);
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
  $('#modalBg').addEventListener('click', e => {
    if(e.target === $('#modalBg') && $('#modalBg').dataset.dismissable === '1'){
      if(WZ) cancelWizard(); else closeModal();
    }
  });
  load();
});
