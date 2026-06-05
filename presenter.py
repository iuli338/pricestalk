"""Shape a product (dict) for the client: min price, counts, title/cover defaults."""
import scheduler


def min_price(product):
    prices = [l["price"] for l in product["listings"]
              if l.get("price") and l["price"] > 0 and l.get("available", True)]
    return min(prices) if prices else None


def decorate(product):
    p = dict(product)
    p["min_price"] = min_price(product)
    p["listing_count"] = len(product["listings"])
    p["refreshing"] = scheduler.is_refreshing(product["id"])
    # title defaults to the initial search query; cover defaults to first image
    p["title"] = product.get("title") or product.get("query")
    p["cover_image"] = product.get("cover_image") or next(
        (l["image"] for l in product["listings"] if l.get("image")), None)
    return p
