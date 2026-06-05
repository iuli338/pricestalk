"""Shape a product (dict) for the client: min price, counts, title/cover defaults."""
import scheduler


def min_price(product):
    prices = [l["price"] for l in product["listings"]
              if l.get("price") and l["price"] > 0 and l.get("available", True)]
    return min(prices) if prices else None


def decorate(product):
    """Full product for the detail modal (includes all listings)."""
    p = dict(product)
    p["min_price"] = min_price(product)
    p["listing_count"] = len(product["listings"])
    p["refreshing"] = scheduler.is_refreshing(product["id"])
    # title defaults to the initial search query; cover defaults to first image
    p["title"] = product.get("title") or product.get("query")
    p["cover_image"] = product.get("cover_image") or next(
        (l["image"] for l in product["listings"] if l.get("image")), None)
    return p


def summarize(summary):
    """Card data for the home grid. `summary` already has min_price/count/cover
    computed by storage; just attach the live refreshing flag."""
    s = dict(summary)
    s["refreshing"] = scheduler.is_refreshing(summary["id"])
    return s
