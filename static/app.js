// PriceStalk UI logic.
const $ = s => document.querySelector(s);
const api = (url, opt) => fetch(url, opt).then(r => r.json());
const fmt = p => p == null ? null : new Intl.NumberFormat('ro-RO',{style:'currency',currency:'RON'}).format(p);
let CURRENT = null;

// --- Theme ---
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }

async function load(){
  const products = await api('/api/products');
  const grid = $('#grid');
  grid.innerHTML = '';
  $('#empty').style.display = products.length ? 'none' : 'block';
  for(const p of products) grid.appendChild(card(p));
}

function card(p){
  const el = document.createElement('div');
  el.className = 'card';
  const price = p.min_price != null
    ? `<div class="price">${fmt(p.min_price)}</div>`
    : `<div class="price none">No price yet</div>`;
  const sugg = p.suggestion_count ? `<span class="badge">${p.suggestion_count} new</span>` : '';
  el.innerHTML = `
    <h3>${escapeHtml(p.query)} ${sugg}</h3>
    ${price}
    <div class="meta">min across ${p.listing_count} listing(s)</div>
    <div class="card-actions">
      <button class="btn btn-sm btn-primary" onclick="openDetail('${p.id}')">Open</button>
      <button class="btn btn-sm" onclick="scout('${p.id}')">Scout</button>
      <button class="btn btn-sm" onclick="refresh('${p.id}')">Refresh</button>
      <button class="btn btn-sm" onclick="delProduct('${p.id}')">Delete</button>
    </div>`;
  return el;
}

async function addProduct(){
  const q = $('#q').value.trim();
  if(!q) return;
  await api('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q})});
  $('#q').value='';
  await load();
}

async function delProduct(id){
  if(!confirm('Delete this product?')) return;
  await api('/api/products/'+id,{method:'DELETE'});
  load();
}

async function refresh(id){
  toast('Refreshing prices…');
  await api('/api/products/'+id+'/refresh',{method:'POST'});
  load();
  if(CURRENT===id) openDetail(id);
}

// ---- Scout modal: search + pin ----
async function scout(id){
  CURRENT = id;
  openModal(`<h2>Scouting…</h2><p class="muted">Searching market sites.</p>`);
  const found = await api('/api/products/'+id+'/search');
  renderScout(id, found);
}

function renderScout(id, found){
  let rows = found.length ? found.map(f => `
    <div class="result">
      <div>
        <div class="t">${escapeHtml(f.title)}</div>
        <div class="s">${f.site} · ${fmt(f.price)||'—'}</div>
      </div>
      <button class="btn btn-sm ${f.pinned?'':'btn-primary'}" ${f.pinned?'disabled':''}
        onclick='pin("${id}", ${JSON.stringify(f).replace(/'/g,"&#39;")}, this)'>
        ${f.pinned?'Pinned':'Pin'}</button>
    </div>`).join('') : '<p class="muted">No results found.</p>';
  openModal(`
    <button class="btn btn-sm close" onclick="closeModal()">Close</button>
    <h2>Pin findings</h2>
    <p class="muted">Pin the listings that match what you want.</p>
    ${rows}
    <h3>Or pin a URL directly</h3>
    <div class="search">
      <input id="manualUrl" class="input" type="text" placeholder="https://…">
      <button class="btn btn-primary" onclick="pinUrl('${id}')">Pin URL</button>
    </div>`);
}

async function pin(id, listing, btn){
  btn.disabled = true; btn.textContent = '…';
  await api('/api/products/'+id+'/listings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(listing)});
  btn.textContent = 'Pinned';
  load();
}

async function pinUrl(id){
  const url = $('#manualUrl').value.trim();
  if(!url) return;
  toast('Fetching price…');
  await api('/api/products/'+id+'/listings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
  $('#manualUrl').value='';
  load();
  openDetail(id);
}

// ---- Detail modal: listings + suggestions ----
async function openDetail(id){
  CURRENT = id;
  const p = await api('/api/products/'+id);
  const listings = p.listings.length ? p.listings.map(l => `
    <div class="listing">
      <a href="${l.url}" target="_blank">${escapeHtml(l.title||l.url)}</a>
      <div>
        <span class="lp">${fmt(l.price)||'—'}</span>
        ${l.available===false?'<span class="oos"> · out of stock</span>':''}
        <span class="s muted"> · ${l.site||''}</span>
        <button class="btn btn-sm" onclick='unpin("${id}","${l.url}")'>Unpin</button>
      </div>
    </div>`).join('') : '<p class="muted">No listings pinned yet. Use Scout to find some.</p>';

  const sugg = (p.suggestions||[]).length ? `
    <h3>New suggestions (${p.suggestions.length})</h3>
    ${p.suggestions.map(s => `
      <div class="result">
        <div><div class="t">${escapeHtml(s.title)}</div><div class="s">${s.site} · ${fmt(s.price)||'—'}</div></div>
        <div>
          <button class="btn btn-sm btn-primary" onclick='confirmSugg("${id}","${s.url}")'>Add</button>
          <button class="btn btn-sm" onclick='dismissSugg("${id}","${s.url}")'>Dismiss</button>
        </div>
      </div>`).join('')}` : '';

  openModal(`
    <button class="btn btn-sm close" onclick="closeModal()">Close</button>
    <h2>${escapeHtml(p.query)}</h2>
    <div class="price ${p.min_price==null?'none':''}">${p.min_price!=null?fmt(p.min_price):'No price yet'}</div>
    <p class="muted">Minimum across ${p.listing_count} listing(s)</p>
    <div class="row"><button class="btn btn-sm" onclick="scout('${id}')">Scout more</button>
      <button class="btn btn-sm" onclick="refresh('${id}')">Refresh prices</button></div>
    <h3>Pinned listings</h3>
    ${listings}
    ${sugg}`);
}

async function unpin(id,url){
  await api('/api/products/'+id+'/listings',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
  openDetail(id); load();
}
async function confirmSugg(id,url){
  await api('/api/products/'+id+'/suggestions/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
  openDetail(id); load();
}
async function dismissSugg(id,url){
  await api('/api/products/'+id+'/suggestions/dismiss',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
  openDetail(id);
}

async function checkNotifications(){
  const n = await api('/api/notifications?clear=1');
  if(!n.length){ toast('No new updates.'); return; }
  const total = n.reduce((a,b)=>a+b.count,0);
  toast(`${total} new listing(s) across ${n.length} product(s). Open a product to review.`);
  load();
}

function openModal(html){ $('#modal').innerHTML = html; $('#modalBg').classList.add('open'); }
function closeModal(){ $('#modalBg').classList.remove('open'); CURRENT=null; }
function escapeHtml(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

load();
