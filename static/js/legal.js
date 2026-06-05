// Disclaimer page: i18n + language switch.
import { $ } from './dom.js';
import { LANG, setLang, applyStaticI18n } from './i18n.js';

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.lang = LANG;
  applyStaticI18n();
  $('#langSelect').addEventListener('change', e => setLang(e.target.value));
});
