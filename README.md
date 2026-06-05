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
scraper.py             search (eMAG) + generic price fetch
storage.py             JSON persistence (products, listings, suggestions)
scheduler.py           24h re-scout: refresh prices + find new listings
templates/index.html   page markup
static/style.css       styling
static/app.js          UI logic (fetch API, render, modals)
data.json              storage (gitignored)
```

UI split: `index.html` is structure only, `style.css` all styling, `app.js` all logic.

Region: Romania · Currency: RON · Language: English. Scraping is best-effort; selectors may need updates over time.
