"""Regions anywhere Qloo has data: preset cities per market, Indian states, and any place found by Qloo search.

Scoring uses Qloo heatmaps. A heatmap is scored relative to the area it covers, so:
- regions in one country use that country's heatmap (fine, city-level detail);
- regions across countries use one world heatmap (coarser cells, wider radius) so scores stay comparable.
"""
import math

from . import qloo

# lat, lon, 18–34 audience in millions (rough public estimates; teams override with Meta's own reach)
PRESETS: dict[str, dict] = {
    # India
    "Delhi": {"lat": 28.6139, "lon": 77.2090, "audience": 9.1, "country": "India"},
    "Mumbai": {"lat": 19.0760, "lon": 72.8777, "audience": 8.2, "country": "India"},
    "Chennai": {"lat": 13.0827, "lon": 80.2707, "audience": 3.9, "country": "India"},
    "Bengaluru": {"lat": 12.9716, "lon": 77.5946, "audience": 4.8, "country": "India"},
    "Kolkata": {"lat": 22.5726, "lon": 88.3639, "audience": 4.6, "country": "India"},
    "Lucknow": {"lat": 26.8467, "lon": 80.9462, "audience": 1.4, "country": "India"},
    "Hyderabad": {"lat": 17.3850, "lon": 78.4867, "audience": 3.6, "country": "India"},
    "Pune": {"lat": 18.5204, "lon": 73.8567, "audience": 2.5, "country": "India"},
    "Ahmedabad": {"lat": 23.0225, "lon": 72.5714, "audience": 2.6, "country": "India"},
    "Jaipur": {"lat": 26.9124, "lon": 75.7873, "audience": 1.5, "country": "India"},
    "Patna": {"lat": 25.5941, "lon": 85.1376, "audience": 0.9, "country": "India"},
    "Kochi": {"lat": 9.9312, "lon": 76.2673, "audience": 0.8, "country": "India"},
    # United States (metro areas)
    "New York": {"lat": 40.7128, "lon": -74.0060, "audience": 4.6, "country": "United States"},
    "Los Angeles": {"lat": 34.0522, "lon": -118.2437, "audience": 3.1, "country": "United States"},
    "Chicago": {"lat": 41.8781, "lon": -87.6298, "audience": 2.1, "country": "United States"},
    "Houston": {"lat": 29.7604, "lon": -95.3698, "audience": 1.7, "country": "United States"},
    "Atlanta": {"lat": 33.7490, "lon": -84.3880, "audience": 1.4, "country": "United States"},
    "Miami": {"lat": 25.7617, "lon": -80.1918, "audience": 1.3, "country": "United States"},
    "San Francisco": {"lat": 37.7749, "lon": -122.4194, "audience": 1.8, "country": "United States"},
    "Austin": {"lat": 30.2672, "lon": -97.7431, "audience": 0.6, "country": "United States"},
    "Nashville": {"lat": 36.1627, "lon": -86.7816, "audience": 0.5, "country": "United States"},
    # United Kingdom
    "London": {"lat": 51.5074, "lon": -0.1278, "audience": 2.4, "country": "United Kingdom"},
    "Manchester": {"lat": 53.4808, "lon": -2.2426, "audience": 0.7, "country": "United Kingdom"},
    "Birmingham": {"lat": 52.4862, "lon": -1.8904, "audience": 0.7, "country": "United Kingdom"},
    "Glasgow": {"lat": 55.8642, "lon": -4.2518, "audience": 0.4, "country": "United Kingdom"},
    "Bristol": {"lat": 51.4545, "lon": -2.5879, "audience": 0.3, "country": "United Kingdom"},
}

MARKETS: dict[str, list[str]] = {
    "India": ["Delhi", "Mumbai", "Chennai", "Bengaluru", "Kolkata", "Lucknow"],
    "United States": ["New York", "Los Angeles", "Chicago", "Houston", "Atlanta", "Miami"],
    "United Kingdom": ["London", "Manchester", "Birmingham", "Glasgow", "Bristol"],
}

# Indian state centroids (static geography) for rural or state-wide campaigns.
STATES: dict[str, tuple[float, float]] = {
    "Uttar Pradesh": (26.85, 80.91), "Bihar": (25.60, 85.10), "Punjab": (30.90, 75.85), "Haryana": (29.06, 76.08),
    "Rajasthan": (26.90, 75.79), "Madhya Pradesh": (23.25, 77.41), "Maharashtra": (19.75, 75.71), "Gujarat": (22.26, 71.19),
    "West Bengal": (22.99, 87.85), "Tamil Nadu": (11.13, 78.66), "Karnataka": (15.32, 75.71), "Kerala": (10.85, 76.27),
    "Telangana": (18.11, 79.02), "Andhra Pradesh": (15.91, 79.74), "Odisha": (20.95, 85.10), "Jharkhand": (23.61, 85.28),
    "Chhattisgarh": (21.28, 81.87), "Assam": (26.20, 92.94), "Uttarakhand": (30.07, 79.02), "Himachal Pradesh": (31.10, 77.17),
    "Jammu and Kashmir": (33.78, 76.58), "Goa": (15.30, 74.12),
}
ALIASES = {
    "bangalore": "Bengaluru", "bombay": "Mumbai", "calcutta": "Kolkata", "madras": "Chennai", "new delhi": "Delhi", "cochin": "Kochi",
    "nyc": "New York", "new york city": "New York", "la": "Los Angeles", "sf": "San Francisco", "bay area": "San Francisco",
}
COUNTRY_ALIASES = {"us": "United States", "usa": "United States", "united states of america": "United States", "america": "United States",
                   "uk": "United Kingdom", "britain": "United Kingdom", "great britain": "United Kingdom", "england": "United Kingdom"}

WORLD = {"filter.location": "POLYGON((-179 -60, 179 -60, 179 75, -179 75, -179 -60))"}

_resolved: dict[str, dict | None] = {}


def canonical(name: str) -> str:
    n = name.strip()
    low = n.lower()
    if low in ALIASES:
        return ALIASES[low]
    for p in list(PRESETS) + list(STATES):
        if p.lower() == low:
            return p
    return n[:1].upper() + n[1:]


def canonical_country(name: str | None) -> str | None:
    if not name:
        return None
    low = name.strip().lower()
    if low in COUNTRY_ALIASES:
        return COUNTRY_ALIASES[low]
    for m in MARKETS:
        if m.lower() == low:
            return m
    return name.strip()


def _country_from_latlon(lat: float, lon: float) -> str | None:
    """Fallback for places cached before we kept the country."""
    if 6 <= lat <= 36 and 68 <= lon <= 98:
        return "India"
    if 24 <= lat <= 50 and -125 <= lon <= -66:
        return "United States"
    if 49.8 <= lat <= 59 and -8.5 <= lon <= 2:
        return "United Kingdom"
    return None


async def resolve(name: str) -> dict | None:
    """{name, lat, lon, country, audience?, radius_km, kind}. Other places go through Qloo destination search."""
    name = canonical(name)
    if name in PRESETS:
        return {"name": name, **PRESETS[name], "radius_km": 40, "kind": "city"}
    if name in STATES:
        lat, lon = STATES[name]
        return {"name": name, "lat": lat, "lon": lon, "country": "India", "audience": None, "radius_km": 220, "kind": "state"}
    if name in _resolved:
        return _resolved[name]
    hits = await qloo.search(name, types="urn:entity:destination", take=3)
    hit = next((h for h in hits if h.get("lat") is not None), None)
    if not hit:  # towns Qloo only knows through places in them
        hits = await qloo.search(name, take=5)
        hit = next((h for h in hits if h.get("lat") is not None and name.lower() in (h.get("name", "") + " " + str(h.get("city", ""))).lower()), None)
    out = None
    if hit:
        country = canonical_country(hit.get("country")) or _country_from_latlon(hit["lat"], hit["lon"])
        out = {"name": name, "lat": hit["lat"], "lon": hit["lon"], "country": country, "audience": None, "radius_km": 60, "kind": "town", "qloo_id": hit["id"]}
    _resolved[name] = out
    return out


def location_params(region: dict) -> dict:
    """Qloo location signal: the name for cities and states, a point + radius for small towns."""
    if region.get("kind") == "town":
        return {"signal.location": f"POINT({region['lon']} {region['lat']})", "signal.location.radius": int(region["radius_km"] * 1000)}
    return {"signal.location.query": region["name"]}


def heat_scope(region_list: list[dict]) -> tuple[dict, float]:
    """Heatmap area for a set of regions, plus a radius multiplier (world cells are coarser)."""
    countries = {r.get("country") or _country_from_latlon(r["lat"], r["lon"]) for r in region_list}
    countries.discard(None)
    if len(countries) <= 1:
        return {"filter.location.query": (countries.pop() if countries else "India")}, 1.0
    return dict(WORLD), 3.5


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def score_in(cells: list[list[float]], region: dict, radius_mult: float = 1.0) -> int | None:
    """Mean heatmap affinity across the region's area, 0–100. Small towns fall back to the nearest cells."""
    if not cells:
        return None
    here = (region["lat"], region["lon"])
    dists = [(_km(here, (c[0], c[1])), c[2]) for c in cells]
    near = [a for d, a in dists if d <= region.get("radius_km", 40) * radius_mult]
    if not near:
        dists.sort()
        if dists[0][0] > 150 * radius_mult:
            return None
        near = [a for _, a in dists[:6]]
    return round(100 * sum(near) / len(near))
