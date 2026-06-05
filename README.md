# PriceStalk

Track the minimum price of product *ideas* across Romanian retail sites. See [idea.md](idea.md) for the concept.

A product is a search term (e.g. `rtx 5050 laptop`) holding a set of pinned listings from different sites. Its card shows the lowest price across all pinned, in-stock listings. Every 24h the app re-scouts for new listings and surfaces them for confirmation.

## Stack

- Python · Flask · BeautifulSoup + requests
- JSON storage (`data.json`)
- APScheduler for 24h re-scouting
- Vanilla JS single-page UI

## Run

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000

## Layout

| File | Role |
|------|------|
| `app.py` | Flask routes / REST API |
| `scraper.py` | Search (eMAG) + generic price fetch for pinned URLs |
| `storage.py` | JSON persistence: products, listings, suggestions |
| `scheduler.py` | 24h re-scout: refresh prices + find new listings |
| `templates/index.html` | UI |

## Notes

- Region: Romania · Currency: RON · Language: English.
- Scraping is best-effort and depends on retailer markup; selectors may need updates over time.
