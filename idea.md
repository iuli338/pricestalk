# PriceStalk

Track the minimum price of "products" (component/spec ideas) across multiple Romanian retail sites.

## Core Concept

A product entry is not a single listing — it's a spec/idea (e.g. "rtx 5050 laptop") with a collection of pinned URLs from different sites. The entry's card shows the **minimum price** found across all its URLs.

## Why

- We often know the components/specs we want but not which manufacturer to choose.
- A pinned listing's link can be forgotten, or the site hides it once stock runs out — without notifying us.

## Workflow

1. **Add product** — type a search term (e.g. "rtx 5050 laptop").
2. **Initial scout** — an automatic search/scrape runs across market sites.
3. **Pin findings** — user pins relevant listings from different sites.
4. **Result** — the entry now holds a set of URLs; its card displays the minimum price fetched from all of them.

## Re-scouting

- Every 24 hours, re-scout market sites for the product type.
- If a new listing of that type is found, **notify** the user.
- On confirmation, the new URL is added to the entry's list.

## Specs

- **Region:** Romania
- **Currency:** Lei (RON)
- **App language:** English + Romanian (UI language switch)
- **Stack:** Python, web scraping, Flask backend, JSON storage, simple web UI.
