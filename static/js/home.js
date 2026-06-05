// Home: product entities grid.
import { api } from './api.js';
import { $, esc } from './dom.js';
import { fmt } from './format.js';
import { t } from './i18n.js';
import { openDetail } from './detail.js';

export async function load() {
  const products = await api.listProducts();
  const grid = $('#grid');
  grid.innerHTML = '';
  $('#empty').style.display = products.length ? 'none' : 'block';
  for (const p of products) grid.appendChild(entityCard(p));
}

function entityCard(p) {
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
    <div class="meta">${t('home.lowest_of', { n: p.listing_count })}</div>`;
  return el;
}
