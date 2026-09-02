import math
import requests
from app.database import get_db_connection

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two points in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def calculate_road_distance_and_fee(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    cargo_weight_kg: float = 1.0
) -> dict:
    price_per_metre = 0.12
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

    # 1. Try Free OSRM Live Driving API with Alternatives
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

    # 3. Dynamic Pricing Calculation
    distance_fee = distance_metres * price_per_metre
    weight_fee = max((cargo_weight_kg - 2.0) * 150.0, 0.0)
    total_delivery_fee = round(base_fee + distance_fee + weight_fee, 2)
    rider_commission = round(total_delivery_fee * (rider_split_pct / 100.0), 2)
    platform_fee = round(total_delivery_fee - rider_commission, 2)

    return {
        "distance_metres": round(distance_metres, 1),
        "distance_km": distance_km,
        "estimated_duration_minutes": duration_minutes,
        "engine": engine_used,
        "routes_evaluated": routes_found,
        "pricing": {
            "base_fee": base_fee,
            "price_per_metre": price_per_metre,
            "distance_fee": round(distance_fee, 2),
            "weight_fee": round(weight_fee, 2),
            "total_delivery_fee": total_delivery_fee,
            "rider_commission": rider_commission,
            "platform_fee": platform_fee
        }
    }
