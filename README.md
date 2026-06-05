# PriceStalk

Track the minimum price of product *ideas* across Romanian retail sites. Concept: [idea.md](idea.md).

A product is a search term (e.g. `rtx 5050 laptop`) holding pinned listings from different sites. Its card shows the lowest in-stock price. Every 24h the app re-scouts for new listings to confirm.

Stack: Python · Flask (app factory) · SQLAlchemy + SQLite · BeautifulSoup ·
APScheduler · vanilla JS (native ESM).

## Run (dev)

```bash
pip install -r requirements.txt
python app.py
```

http://localhost:5000 — creates `pricestalk.db` automatically.

## Run (production)

Set env vars (see `.env.example`), then serve with gunicorn:

```bash
export SECRET_KEY=<long-random-string>
export DEBUG=0
gunicorn app:app -b 0.0.0.0:8000
```

SQLite stores data in `pricestalk.db` — host on a box with a **persistent disk**
(VPS, or Fly.io/Render with a volume), not an ephemeral filesystem. To move to
Postgres later, set `DATABASE_URL=postgresql+psycopg://…`; models/queries are unchanged.

## Files

```
app.py                 Flask app factory + routes / REST API
config.py              settings from env vars
models.py              SQLAlchemy models (Product, Listing)
storage.py             data access (DB for products; memory for wizard drafts)
presenter.py           product -> UI shape (min price, counts, defaults)
scraper.py             search (eMAG/Altex/Compari) + price fetch
scheduler.py           periodic price-drop re-fetch
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

pricestalk.db          SQLite database (gitignored)
```

Frontend is a buildless native-ESM SPA: `index.html` is structure only, CSS is
split by concern, JS is ES modules wired in `main.js`. UI uses `data-action`
event delegation (no inline handlers); all API calls go through `js/api.js`.

Region: Romania · Currency: RON · Language: English + Romanian (switchable in the header). Scraping is best-effort; selectors may need updates over time.
