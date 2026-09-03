import math
import requests
from app.database import get_db_connection

# Comprehensive Landmark Gazetteer for Katsina & Nigerian Metro Hubs
KATSINA_LANDMARKS = [
    {"name": "Katsina Central Commercial Market", "aliases": ["central market", "katsina market", "kasuwar tsakiya", "commercial market"], "lat": 12.9908, "lon": 7.6018},
    {"name": "GRA Residential Main Road, Katsina", "aliases": ["gra", "gra katsina", "government reserved area", "katsina gra"], "lat": 12.9820, "lon": 7.5950},
    {"name": "Katsina City Gate & Ring Road Hub", "aliases": ["city gate", "ring road", "kofar soro", "katsina gate", "ring road hub"], "lat": 13.0050, "lon": 7.6180},
    {"name": "Batagarawa Commercial Junction", "aliases": ["batagarawa", "batagarawa junction", "batagarawa road"], "lat": 12.9500, "lon": 7.5800},
    {"name": "Umaru Musa Yar'Adua University (UMYU)", "aliases": ["umyu", "yaradua university", "yar adua university", "umyu campus"], "lat": 12.8950, "lon": 7.6320},
    {"name": "Hassan Usman Katsina Polytechnic (HUK Poly)", "aliases": ["huk poly", "polytechnic", "katsina poly", "hassan usman poly"], "lat": 12.9700, "lon": 7.6100},
    {"name": "Katsina General Hospital & Specialist Center", "aliases": ["general hospital", "specialist hospital", "asibitin katsina"], "lat": 12.9880, "lon": 7.6000},
    {"name": "Federal Medical Centre (FMC) Katsina", "aliases": ["fmc", "fmc katsina", "federal medical centre"], "lat": 12.9750, "lon": 7.5900},
    {"name": "Kofar Kaura Roundabout & Trade Center", "aliases": ["kofar kaura", "kaura roundabout", "kaura gate"], "lat": 12.9860, "lon": 7.6250},
    {"name": "Kofar Durbi Commercial Axis", "aliases": ["kofar durbi", "durbi gate", "durbi"], "lat": 12.9950, "lon": 7.6120},
    {"name": "Kofar Guga Transit Station", "aliases": ["kofar guga", "guga gate", "guga"], "lat": 13.0010, "lon": 7.5980},
    {"name": "Kofar Sauri Residential District", "aliases": ["kofar sauri", "sauri gate", "sauri"], "lat": 12.9780, "lon": 7.6080},
    {"name": "Katsina Steel Rolling Mill & Industrial Layout", "aliases": ["steel rolling", "industrial layout", "steel mill"], "lat": 12.9600, "lon": 7.6400},
    {"name": "Mani Road Transport Depot", "aliases": ["mani road", "mani park", "tashar mani"], "lat": 13.0100, "lon": 7.6300},
    {"name": "Dutsinma Motor Park Station", "aliases": ["dutsinma park", "dutsinma road", "tashar dutsinma"], "lat": 12.9680, "lon": 7.5750},
    {"name": "Kano Motor Park Transport Terminal", "aliases": ["kano park", "tashar kano", "kano road"], "lat": 12.9550, "lon": 7.6150}
]

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two points in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def geocode_address(query: str) -> dict:
    """
    Geocodes a text address or landmark to exact GPS coordinates.
    Matches against internal gazetteer first, then OpenStreetMap Nominatim with Katsina bounds.
    """
    q_clean = query.strip().lower()
    
    # 1. Check local landmark gazetteer
    for lm in KATSINA_LANDMARKS:
        if q_clean == lm["name"].lower() or any(alias in q_clean for alias in lm["aliases"]):
            return {
                "latitude": lm["lat"],
                "longitude": lm["lon"],
                "formatted_address": lm["name"],
                "display_name": f"{lm['name']}, Katsina State, Nigeria",
                "source": "GAZETTEER_LOCAL"
            }
            
    # 2. Try Nominatim Geocoding API with Nigeria bias
    try:
        url = "https://nominatim.openstreetmap.org/search"
        headers = {"User-Agent": "RushPoint-Logistics/1.0 (logistics@rushingpoint.com)"}
        params = {
            "q": f"{query}, Nigeria",
            "format": "json",
            "limit": 1,
            "addressdetails": 1
        }
        res = requests.get(url, params=params, headers=headers, timeout=3.0)
        if res.status_code == 200:
            data = res.json()
            if data and len(data) > 0:
                first = data[0]
                return {
                    "latitude": float(first["lat"]),
                    "longitude": float(first["lon"]),
                    "formatted_address": first.get("display_name", query),
                    "display_name": first.get("display_name", query),
                    "source": "OPENSTREETMAP_NOMINATIM"
                }
    except Exception:
        pass
        
    # Default fallback to central Katsina coordinates
    return {
        "latitude": 12.9908,
        "longitude": 7.6018,
        "formatted_address": f"{query.title()}, Katsina, Nigeria",
        "display_name": f"{query.title()}, Katsina, Nigeria",
        "source": "FALLBACK_CITY_CENTER"
    }

def reverse_geocode_coordinates(lat: float, lon: float) -> dict:
    """
    Converts GPS coordinates into human-readable landmark and street address.
    """
    # 1. Find closest landmark in gazetteer (within 1.2 km)
    closest_lm = None
    min_dist = float("inf")
    for lm in KATSINA_LANDMARKS:
        d = haversine_distance_km(lat, lon, lm["lat"], lm["lon"])
        if d < min_dist:
            min_dist = d
            closest_lm = lm
            
    if closest_lm and min_dist <= 1.2:
        dist_str = f" (~{int(min_dist * 1000)}m away)" if min_dist > 0.15 else ""
        return {
            "formatted_address": f"{closest_lm['name']}{dist_str}",
            "city": "Katsina",
            "state": "Katsina State",
            "country": "Nigeria",
            "source": "GAZETTEER_MATCH"
        }
        
    # 2. Try Nominatim Reverse Geocoding
    try:
        url = "https://nominatim.openstreetmap.org/reverse"
        headers = {"User-Agent": "RushPoint-Logistics/1.0 (logistics@rushingpoint.com)"}
        params = {"lat": lat, "lon": lon, "format": "json"}
        res = requests.get(url, params=params, headers=headers, timeout=3.0)
        if res.status_code == 200:
            data = res.json()
            addr = data.get("address", {})
            road = addr.get("road") or addr.get("suburb") or addr.get("neighbourhood") or "Commercial Axis"
            city = addr.get("city") or addr.get("town") or addr.get("state_district") or "Katsina"
            return {
                "formatted_address": f"{road}, {city}",
                "city": city,
                "state": addr.get("state", "Katsina State"),
                "country": addr.get("country", "Nigeria"),
                "source": "NOMINATIM_REVERSE"
            }
    except Exception:
        pass
        
    return {
        "formatted_address": f"GPS Location ({lat:.4f}, {lon:.4f}), Katsina",
        "city": "Katsina",
        "state": "Katsina State",
        "country": "Nigeria",
        "source": "COORDINATE_FALLBACK"
    }

def calculate_road_distance_and_fee(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    cargo_weight_kg: float = 1.0,
    vehicle_type: str = "MOTORCYCLE"
) -> dict:
    price_per_metre = 0.12 # 120 NGN per KM
    base_fee = 1200.0
    rider_split_pct = 80.0
    
    try:
        conn = get_db_connection()
        pm_row = conn.execute("SELECT value FROM system_settings WHERE key = 'price_per_metre'").fetchone()
        if pm_row:
            price_per_metre = float(pm_row["value"])
        bf_row = conn.execute("SELECT value FROM system_settings WHERE key = 'base_delivery_fee'").fetchone()
        if bf_row:
            base_fee = float(bf_row["value"])
        rs_row = conn.execute("SELECT value FROM system_settings WHERE key = 'rider_delivery_split_pct'").fetchone()
        if rs_row:
            rider_split_pct = float(rs_row["value"])
        conn.close()
    except Exception:
        pass

    distance_metres = 0.0
    duration_seconds = 0.0
    engine_used = "OSRM_ROAD_ROUTER"
    routes_found = 1

    # 1. Query Free OSRM Live Driving API
    try:
        osrm_url = f"https://router.project-osrm.org/route/v1/driving/{origin_lon},{origin_lat};{dest_lon},{dest_lat}?overview=false&alternatives=true"
        resp = requests.get(osrm_url, timeout=3.5)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("code") == "Ok" and data.get("routes"):
                routes = data["routes"]
                routes_found = len(routes)
                if len(routes) > 1:
                    distance_metres = max(float(r.get("distance", 0.0)) for r in routes)
                    duration_seconds = max(float(r.get("duration", 0.0)) for r in routes)
                else:
                    distance_metres = float(routes[0].get("distance", 0.0))
                    duration_seconds = float(routes[0].get("duration", 0.0))
    except Exception:
        pass

    # 2. Geometric Haversine Fallback with Road Tortuosity Multiplier (1.35x)
    if distance_metres <= 0:
        engine_used = "HAVERSINE_ROAD_FACTOR"
        direct_km = haversine_distance_km(origin_lat, origin_lon, dest_lat, dest_lon)
        road_km = max(direct_km * 1.35, 0.5)
        distance_metres = road_km * 1000.0
        duration_seconds = (road_km / 35.0) * 3600.0

    distance_km = round(distance_metres / 1000.0, 2)
    duration_minutes = max(round(duration_seconds / 60.0), 5)

    # 3. Vehicle Multiplier
    v_type_clean = (vehicle_type or "MOTORCYCLE").upper()
    vehicle_multiplier = 1.6 if v_type_clean in ["TRICYCLE", "KEKE", "CARGO_KEKE", "VAN"] else 1.0

    # 4. Dynamic Pricing Calculation
    distance_fee = distance_metres * price_per_metre
    weight_fee = max((cargo_weight_kg - 2.0) * 150.0, 0.0)
    raw_subtotal_fee = base_fee + distance_fee + weight_fee
    total_delivery_fee = round(raw_subtotal_fee * vehicle_multiplier, 2)
    
    rider_commission = round(total_delivery_fee * (rider_split_pct / 100.0), 2)
    platform_fee = round(total_delivery_fee - rider_commission, 2)

    origin_name = reverse_geocode_coordinates(origin_lat, origin_lon)["formatted_address"]
    dest_name = reverse_geocode_coordinates(dest_lat, dest_lon)["formatted_address"]

    return {
        "distance_metres": round(distance_metres, 1),
        "distance_km": distance_km,
        "estimated_duration_minutes": duration_minutes,
        "engine": engine_used,
        "routes_evaluated": routes_found,
        "vehicle_type": v_type_clean,
        "vehicle_multiplier": vehicle_multiplier,
        "origin_location_name": origin_name,
        "destination_location_name": dest_name,
        "pricing": {
            "base_fee": base_fee,
            "price_per_metre": price_per_metre,
            "per_km_rate": round(price_per_metre * 1000.0, 2),
            "distance_fee": round(distance_fee * vehicle_multiplier, 2),
            "weight_fee": round(weight_fee * vehicle_multiplier, 2),
            "total_delivery_fee": total_delivery_fee,
            "rider_commission": rider_commission,
            "platform_fee": platform_fee
        }
    }
