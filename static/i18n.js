// Minimal i18n: RO/EN dictionaries + t() helper. Language persisted in localStorage.
const I18N = {
  en: {
    "app.tag": "Romania · RON",
    "header.lang": "Language",

    "search.placeholder": 'Add a product, e.g. "rtx 5050 laptop"',
    "search.add": "Add",
    "home.empty": "No products yet. Add one above to start tracking.",
    "home.lowest_of": "lowest of {n} link(s)",
    "card.no_price": "No price yet",

    "wizard.scouting": "Scouting “{q}”…",
    "wizard.scouting_note": "Searching eMAG, Altex and Compari. This can take a moment.",
    "wizard.found": "{n} found",
    "wizard.pin_note": "Pin the listings you want to track.",
    "wizard.compari_note": "Compari shows the lowest market price — reference only, nothing to pin here.",
    "wizard.no_results": "No results from {site}.",
    "wizard.market_price": "market price",
    "wizard.pin": "Pin",
    "wizard.pinned": "Pinned ✓",
    "wizard.no_image": "no image",
    "wizard.oos": "out of stock",
    "wizard.cancel": "Cancel",
    "wizard.back": "Back",
    "wizard.next": "Next",
    "wizard.review": "Review",
    "wizard.summary": "Summary",
    "wizard.summary_meta": "“{q}” · {n} link(s)",
    "wizard.summary_lowest": " · lowest {price}",
    "wizard.no_pinned": "No links pinned. Go back to pin some.",
    "wizard.finalize": "Finalize",
    "wizard.saved": "Product saved.",

    "detail.close": "Close",
    "detail.change_image": "Change image",
    "detail.no_price": "No price yet",
    "detail.lowest_across": "Lowest across {n} link(s)",
    "detail.initial_search": "initial search text: {q}",
    "detail.refresh": "Refresh prices",
    "detail.refreshing": "Refreshing…",
    "detail.delete": "Delete",
    "detail.no_links": "No links.",
    "detail.lowest_price": "Lowest price",
    "detail.actions": "Actions",
    "detail.remove": "Remove",
    "detail.remove_confirm": "Remove this link?",
    "detail.delete_confirm": "Delete this product?",
    "detail.error": "error",

    "title.edit": "Edit title",
    "title.save": "Save",
    "title.cancel": "Cancel",

    "picker.back": "Back",
    "picker.choose": "Choose image",
    "picker.note": "Pick a cover image from the pinned links.",
    "picker.none": "No images available from the pinned links.",

    "notif.none": "No price drops.",
    "notif.some": "{n} price drop(s) detected. Open a product to see.",
  },

  ro: {
    "app.tag": "România · RON",
    "header.lang": "Limbă",

    "search.placeholder": 'Adaugă un produs, ex. "laptop rtx 5050"',
    "search.add": "Adaugă",
    "home.empty": "Niciun produs încă. Adaugă unul mai sus ca să începi urmărirea.",
    "home.lowest_of": "cel mai mic din {n} link(uri)",
    "card.no_price": "Fără preț încă",

    "wizard.scouting": "Caut „{q}”…",
    "wizard.scouting_note": "Caut pe eMAG, Altex și Compari. Poate dura un moment.",
    "wizard.found": "{n} găsite",
    "wizard.pin_note": "Pinează listările pe care vrei să le urmărești.",
    "wizard.compari_note": "Compari arată cel mai mic preț de pe piață — doar referință, nimic de pinat aici.",
    "wizard.no_results": "Niciun rezultat de pe {site}.",
    "wizard.market_price": "preț piață",
    "wizard.pin": "Pinează",
    "wizard.pinned": "Pinat ✓",
    "wizard.no_image": "fără imagine",
    "wizard.oos": "stoc epuizat",
    "wizard.cancel": "Anulează",
    "wizard.back": "Înapoi",
    "wizard.next": "Înainte",
    "wizard.review": "Rezumat",
    "wizard.summary": "Rezumat",
    "wizard.summary_meta": "„{q}” · {n} link(uri)",
    "wizard.summary_lowest": " · cel mai mic {price}",
    "wizard.no_pinned": "Niciun link pinat. Întoarce-te ca să pinezi.",
    "wizard.finalize": "Finalizează",
    "wizard.saved": "Produs salvat.",

    "detail.close": "Închide",
    "detail.change_image": "Schimbă imaginea",
    "detail.no_price": "Fără preț încă",
    "detail.lowest_across": "Cel mai mic din {n} link(uri)",
    "detail.initial_search": "text căutare inițial: {q}",
    "detail.refresh": "Reîmprospătează prețurile",
    "detail.refreshing": "Reîmprospătez…",
    "detail.delete": "Șterge",
    "detail.no_links": "Niciun link.",
    "detail.lowest_price": "Cel mai mic preț",
    "detail.actions": "Acțiuni",
    "detail.remove": "Elimină",
    "detail.remove_confirm": "Elimini acest link?",
    "detail.delete_confirm": "Ștergi acest produs?",
    "detail.error": "eroare",

    "title.edit": "Editează titlul",
    "title.save": "Salvează",
    "title.cancel": "Anulează",

    "picker.back": "Înapoi",
    "picker.choose": "Alege imaginea",
    "picker.note": "Alege o imagine de copertă din linkurile pinate.",
    "picker.none": "Nicio imagine disponibilă din linkurile pinate.",

    "notif.none": "Nicio scădere de preț.",
    "notif.some": "{n} scădere(i) de preț detectate. Deschide un produs ca să vezi.",
  },
};

let LANG = localStorage.getItem('lang') || (navigator.language || 'en').slice(0,2);
if(!I18N[LANG]) LANG = 'en';

// translate a key with optional {placeholders}
function t(key, vars){
  let s = (I18N[LANG] && I18N[LANG][key]) || (I18N.en[key]) || key;
  if(vars) for(const k in vars) s = s.replaceAll('{'+k+'}', vars[k]);
  return s;
}

function setLang(lang){
  if(!I18N[lang]) return;
  LANG = lang;
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;
  applyStaticI18n();
  if(typeof load === 'function') load();   // re-render home
}

// translate static [data-i18n] / [data-i18n-ph] elements in the DOM
function applyStaticI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  const sel = document.getElementById('langSelect');
  if(sel) sel.value = LANG;
}
