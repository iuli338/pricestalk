"""Extract Compari product-box structure."""
import json
from bs4 import BeautifulSoup

soup = BeautifulSoup(open("study/compari_search.html", encoding="utf-8").read(), "html.parser")
boxes = soup.select(".product-box")
rep = [f"product-box count: {len(boxes)}"]
for box in boxes[:3]:
    name = box.select_one(".name")
    price = box.select_one(".price")
    link = box.select_one("a[href]")
    offer = box.select_one(".offer-num")
    rep.append("--- box ---")
    rep.append("  name: " + repr(name.get_text(" ", strip=True)[:70] if name else None))
    rep.append("  name_tag: " + (f"{name.name}.{'.'.join(name.get('class',[]))}" if name else "None"))
    rep.append("  price: " + repr(price.get_text(" ", strip=True)[:40] if price else None))
    rep.append("  link: " + repr(link.get("href")[:90] if link else None))
    rep.append("  offers: " + repr(offer.get_text(" ", strip=True)[:40] if offer else None))
    # all classes inside box for price/name discovery
    rep.append("  inner classes: " + str(sorted({c for el in box.find_all(class_=True) for c in el.get('class',[])})[:30]))

with open("study/compari_card.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(rep))
print("done")
