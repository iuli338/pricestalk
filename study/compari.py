"""Probe Compari.ro CategorySearch result structure."""
import re
from urllib.parse import quote_plus
import requests
from bs4 import BeautifulSoup

H = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,*/*;q=0.8",
    "Accept-Language": "ro-RO,ro;q=0.9",
    "Accept-Encoding": "gzip, deflate",
}
rep = []
s = requests.Session(); s.headers.update(H)
s.get("https://www.compari.ro/", timeout=30)  # warm Cloudflare cookies
url = "https://www.compari.ro/CategorySearch.php?st=" + quote_plus("rtx 4060 laptop")
r = s.get(url, timeout=30)
rep.append(f"status={r.status_code} bytes={len(r.text)} final={r.url[:100]}")
soup = BeautifulSoup(r.text, "html.parser")
rep.append("title: " + repr(soup.title.get_text(strip=True)[:80] if soup.title else None))
rep.append("jsonld blocks: %d" % len(soup.find_all("script", type="application/ld+json")))

for sel in ['[class*=product]', '[class*=offer]', 'article', '[data-testid]',
            'a[href*="ProductDetails"]', 'a[href*="/d/"]', '[class*=price]', '[class*=pret]']:
    rep.append(f"  {sel}: {len(soup.select(sel))}")

prices = re.findall(r"(\d[\d.\s]*)\s*Lei", r.text)
rep.append(f"price-ish matches: {len(prices)} sample={prices[:6]}")

classes = set()
for el in soup.find_all(class_=True):
    for c in el.get("class", []):
        if any(k in c.lower() for k in ["product", "offer", "price", "pret", "name", "title", "box", "item", "card"]):
            classes.add(c)
rep.append("relevant classes: " + str(sorted(classes)[:50]))

with open("study/compari_search.html", "w", encoding="utf-8") as f:
    f.write(r.text)
with open("study/compari_search.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(rep))
print("done")
