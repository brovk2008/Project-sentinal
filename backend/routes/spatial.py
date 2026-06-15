import math
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import List, Dict, Any
from db import get_db, CatalystDBClient
from shapely.wkt import loads as loads_wkt
import shapely.wkb
from shapely.geometry import Point, shape, mapping

def load_geom(geom_str: str):
    if not geom_str:
        return None
    geom_str = geom_str.strip()
    if geom_str.startswith("01"): # Hex WKB
        try:
            return shapely.wkb.loads(bytes.fromhex(geom_str))
        except Exception:
            # Fallback to manual EWKB parsing
            try:
                from routes.heatmap import parse_ewkb_to_geojson
            except ImportError:
                from backend.routes.heatmap import parse_ewkb_to_geojson
            geojson = parse_ewkb_to_geojson(geom_str)
            if geojson:
                return shape(geojson)
    else: # WKT
        try:
            return loads_wkt(geom_str)
        except Exception:
            return None

router = APIRouter(tags=["Spatial Operations"])

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes distance between two coordinate pairs in kilometers."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

@router.get("/spatial/nearest")
def get_nearest_units(
    lat: float = Query(...),
    lng: float = Query(...),
    limit: int = Query(5, le=50),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Finds the nearest police units and districts to a given coordinate point.
    Calculates distances in Python using the Haversine formula.
    """
    sql = "SELECT unit_id, unit_name, district_name, latitude, longitude FROM dim_police_units;"
    rows = db.execute(sql).fetchall()
    
    results = []
    for r in rows:
        unit_id = int(r[0])
        unit_name = str(r[1])
        dist_name = str(r[2])
        r_lat = r[3]
        r_lng = r[4]
        
        if r_lat is None or r_lng is None:
            continue
            
        dist = haversine_distance(lat, lng, float(r_lat), float(r_lng))
        results.append({
            "unit_id": unit_id,
            "unit_name": unit_name,
            "district_name": dist_name,
            "latitude": float(r_lat),
            "longitude": float(r_lng),
            "distance_km": round(dist, 2)
        })
        
    results.sort(key=lambda x: x["distance_km"])
    return results[:limit]

@router.get("/spatial/point-in-polygon")
def point_in_polygon(
    lat: float = Query(...),
    lng: float = Query(...),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Performs point-in-polygon check to identify the district containing coordinates.
    Uses Shapely geometry operations over Catalyst-stored WKT strings.
    """
    # Fetch boundaries
    sql = "SELECT geo_id, district_name, sub_district_name, geom_wkt FROM dim_geography WHERE geom_wkt IS NOT NULL;"
    rows = db.execute(sql).fetchall()
    
    p = Point(lng, lat)  # Note: Shapely coordinates are (x, y) i.e. (longitude, latitude)
    
    for r in rows:
        geo_id = str(r[0])
        dist_name = str(r[1])
        sub_dist = r[2]
        wkt = str(r[3])
        
        try:
            geom = load_geom(wkt)
            if geom is None:
                continue
            if geom.contains(p):
                return {
                    "geo_id": geo_id,
                    "district": dist_name,
                    "sub_district": sub_dist,
                    "status": "match_found"
                }
        except Exception:
            continue
            
    # Centroid fallback if no polygon matches perfectly
    centroids_sql = "SELECT district_name, latitude, longitude FROM district_centroids;"
    centroids = db.execute(centroids_sql).fetchall()
    
    nearest_dist = None
    min_distance = float('inf')
    for c in centroids:
        d_name = str(c[0])
        c_lat = float(c[1])
        c_lng = float(c[2])
        dist = haversine_distance(lat, lng, c_lat, c_lng)
        if dist < min_distance:
            min_distance = dist
            nearest_dist = d_name
            
    return {
        "geo_id": f"DISTRICT_{nearest_dist.upper().replace(' ', '_')}" if nearest_dist else "UNKNOWN",
        "district": nearest_dist or "Unknown",
        "sub_district": None,
        "status": "centroid_fallback",
        "distance_km": round(min_distance, 2) if nearest_dist else None
    }

try:
    from cache import get as cache_get, set as cache_set
except ImportError:
    from backend.cache import get as cache_get, set as cache_set

@router.get("/spatial/boundary/{district}")
def get_district_boundary(
    district: str,
    db: CatalystDBClient = Depends(get_db)
):
    """
    Fetches the spatial boundary of a district and converts it to GeoJSON for map rendering.
    """
    cache_key = f"district_boundary_{district.upper()}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    sql = "SELECT geo_id, district_name, geom_wkt FROM dim_geography WHERE UPPER(district_name) = UPPER(:dist) AND geom_wkt IS NOT NULL;"
    rows = db.execute(sql, {"dist": district}).fetchall()
    
    if not rows:
        raise HTTPException(status_code=404, detail=f"No spatial boundaries found for district '{district}'.")
        
    row = rows[0]
    wkt = str(row[2])
    
    try:
        geom = load_geom(wkt)
        if geom is None:
            raise ValueError("Parsed geometry is None")
        geojson = mapping(geom)
        boundary_data = {
            "type": "Feature",
            "properties": {
                "geo_id": str(row[0]),
                "district_name": str(row[1])
            },
            "geometry": geojson
        }
        cache_set(cache_key, boundary_data)
        return boundary_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse spatial boundary WKT: {e}")

@router.get("/spatial/overlap")
def detect_hotspot_overlaps(
    db: CatalystDBClient = Depends(get_db)
):
    """
    Compares active police station hotspots with boundaries to identify
    spatial overlap vulnerabilities.
    """
    stations_sql = "SELECT station_name, district_name, latitude, longitude, fir_count FROM mv_station_profile WHERE latitude IS NOT NULL;"
    stations = db.execute(stations_sql).fetchall()
    
    boundaries_sql = "SELECT district_name, geom_wkt FROM dim_geography WHERE geom_wkt IS NOT NULL;"
    boundaries = db.execute(boundaries_sql).fetchall()
    
    overlap_results = []
    
    # Load boundary polygons
    polygons = {}
    for b in boundaries:
        d_name = str(b[0]).upper()
        wkt = str(b[1])
        try:
            geom = load_geom(wkt)
            if geom is not None:
                polygons[d_name] = geom
        except Exception:
            continue
            
    for st in stations:
        st_name = str(st[0])
        dist_name = str(st[1])
        lat = float(st[2])
        lng = float(st[3])
        firs = int(st[4] or 0)
        
        p = Point(lng, lat)
        
        # Determine actual containing polygon
        actual_polygon_district = "Unknown"
        for name, poly in polygons.items():
            if poly.contains(p):
                actual_polygon_district = name.title()
                break
                
        # If the station's catalogued district differs from its physical location, log it as an anomaly
        if actual_polygon_district != "Unknown" and actual_polygon_district.upper() != dist_name.upper():
            overlap_results.append({
                "station_name": st_name,
                "recorded_district": dist_name,
                "spatial_district": actual_polygon_district,
                "latitude": lat,
                "longitude": lng,
                "fir_count": firs,
                "vulnerability": "jurisdiction_boundary_anomaly"
            })
            
    return {
        "status": "success",
        "jurisdiction_anomalies_count": len(overlap_results),
        "anomalies": overlap_results
    }
