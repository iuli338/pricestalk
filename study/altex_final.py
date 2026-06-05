"""Final Altex search via JSON API: full reusable function + URL + availability check."""
import json
from urllib.parse import quote
from curl_cffi import requests as creq

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def altex_search(query, size=48):
    s = creq.Session(impersonate="chrome")
    s.headers.update({
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ro-RO,ro;q=0.9",
        "Referer": "https://altex.ro/",
    })
    url = f"https://fenrir.altex.ro/v2/catalog/search/{quote(query)}?size={size}"
    r = s.get(url, timeout=30)
    r.raise_for_status()
    j = r.json()
    out = []
    for p in j.get("products", []):
        out.append({
            "title": p.get("name"),
            "price": p.get("price"),
            "currency": "RON",
            "site": "altex.ro",
            "url": f"https://altex.ro/{p['url_key']}/cpd/{p['sku']}/",
            "available": bool(p.get("stock_status") == 1 or p.get("pickup_is_in_stock")),
            "sku": p.get("sku"),
            "brand": p.get("brand_name"),
        })
    return j.get("meta", {}), out


rep = []
for q in ["rtx 4060 laptop", "iphone 15", "monitor 4k 27"]:
    meta, items = altex_search(q)
    rep.append(f"\n=== {q!r}  items={meta.get('items')} pages={meta.get('total_pages')} ===")
    for it in items[:4]:
        rep.append(f"  {it['price']!s:>9} RON {'OK ' if it['available'] else 'OOS'} | "
                   f"{it['title'][:46]} | {it['url'][:60]}")

with open("study/altex_final.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(rep))
print("done")
