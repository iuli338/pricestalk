# PriceStalk

Track the minimum price of product *ideas* across Romanian retail sites. Concept: [idea.md](idea.md).

A product is a search term (e.g. `rtx 5050 laptop`) holding pinned listings from different sites. Its card shows the lowest in-stock price. Every 24h the app re-scouts for new listings to confirm.

Stack: Python · Flask · BeautifulSoup · JSON storage · APScheduler · vanilla JS.

## Run

```bash
pip install -r requirements.txt
python app.py
```

http://localhost:5000

## Files

```
app.py                 Flask routes / REST API
scraper.py             search (eMAG/Altex/Compari) + price fetch
storage.py             JSON persistence (drafts + product entities)
scheduler.py           24h price-drop re-fetch
templates/index.html   page markup (module entry: static/js/main.js)
tokens.css             design tokens (light/dark themes)

static/css/
  base.css             reset, header, buttons, search
  components.css       grid/cards, modal, toast, listings, menu, detail head
  wizard.css           wizard steps + listing cards

static/js/             ES modules (native, no build step)
  main.js              bootstrap: wires modules + top-level listeners
  api.js               centralized fetch client (all endpoints)
  dom.js               $, esc, slotId helpers
  format.js            fmt(price)
  icons.js             inline SVG icons
  modal.js             modal + data-action event delegation
  toast.js             transient toast
  theme.js             light/dark toggle
  i18n.js              EN/RO dictionaries + t()
  store.js             shared client state + cheapest-link helper
  home.js              product entities grid
  wizard.js            scout wizard (create + append modes)
  detail.js            detail modal (edit, picker, refresh, remove, add-links)

data.json              storage (gitignored)
```

Frontend is a buildless native-ESM SPA: `index.html` is structure only, CSS is
split by concern, JS is ES modules wired in `main.js`. UI uses `data-action`
event delegation (no inline handlers); all API calls go through `js/api.js`.

Region: Romania · Currency: RON · Language: English + Romanian (switchable in the header). Scraping is best-effort; selectors may need updates over time.
