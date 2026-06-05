// Bootstrap: wire modules together and attach top-level listeners.
import { $ } from './dom.js';
import { LANG, setLang, applyStaticI18n, onLangChange } from './i18n.js';
import { toggleTheme } from './theme.js';
import { initModal } from './modal.js';
import { load } from './home.js';
import { openDetail, onDetailReload } from './detail.js';
import { startCreateWizard, onWizardDone } from './wizard.js';
import { initProfile } from './profile.js';

// cross-module callbacks (avoid circular imports)
onDetailReload(load);
onLangChange(load);
onWizardDone(productId => {
  load();
  if (productId) openDetail(productId);   // append mode -> reopen the product
});

function addProduct() {
  const input = $('#q');
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  startCreateWizard(q);
}

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.lang = LANG;
  applyStaticI18n();
  initModal();

  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') addProduct(); });
  $('#addBtn').addEventListener('click', addProduct);
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#langSelect').addEventListener('change', e => setLang(e.target.value));

  initProfile();
  load();
});
