from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from datetime import date
import json
import struct
from db import get_db, CatalystDBClient

try:
    from cache import get as cache_get, set as cache_set
except ImportError:
    from backend.cache import get as cache_get, set as cache_set

router = APIRouter(tags=["Heatmap"])

def parse_ewkb_to_geojson(wkb_hex: str) -> Optional[dict]:
    """
    Parses EWKB (Extended Well-Known Binary) hex strings into GeoJSON geometry dictionaries.
    Supports Polygon and MultiPolygon types with SRID headers.
    """
    if not wkb_hex:
        return None
        
    try:
        data = bytes.fromhex(wkb_hex)
        byte_order = data[0]
        endian = "<" if byte_order == 1 else ">"
        
        # Read geometry type (4 bytes)
        geom_type_raw = struct.unpack(f"{endian}I", data[1:5])[0]
        # Check for SRID presence flag (0x20000000)
        has_srid = (geom_type_raw & 0x20000000) != 0
        geom_type = geom_type_raw & 0x0fffffff
        
        offset = 5
        if has_srid:
            offset += 4  # skip SRID doubleword
            
        if geom_type == 3:  # Polygon
            num_rings = struct.unpack(f"{endian}I", data[offset:offset+4])[0]
            offset += 4
            
            rings = []
            for _ in range(num_rings):
                num_points = struct.unpack(f"{endian}I", data[offset:offset+4])[0]
                offset += 4
                
                points = []
                for _ in range(num_points):
                    x, y = struct.unpack(f"{endian}dd", data[offset:offset+16])
                    offset += 16
                    points.append([x, y])
                rings.append(points)
                
            return {
                "type": "Polygon",
                "coordinates": rings
            }
            
        elif geom_type == 6:  # MultiPolygon
            num_polys = struct.unpack(f"{endian}I", data[offset:offset+4])[0]
            offset += 4
            
            polys = []
            for _ in range(num_polys):
                # Skip sub-geometry byte order (1) and type (4 bytes)
                sub_order = data[offset]
                sub_endian = "<" if sub_order == 1 else ">"
                offset += 5
                
                num_rings = struct.unpack(f"{sub_endian}I", data[offset:offset+4])[0]
                offset += 4
                
                rings = []
                for _ in range(num_rings):
                    num_points = struct.unpack(f"{sub_endian}I", data[offset:offset+4])[0]
                    offset += 4
                    
                    points = []
                    for _ in range(num_points):
                        x, y = struct.unpack(f"{sub_endian}dd", data[offset:offset+16])
                        offset += 16
                        points.append([x, y])
                    rings.append(points)
                polys.append(rings)
                
            return {
                "type": "MultiPolygon",
                "coordinates": polys
            }
            
    except Exception as e:
        print(f"[EWKB Parser Error] Failed to parse geometry: {e}")
        return None
    return None

@router.get("/points")
def get_heatmap_points(
    crime_group: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    limit: int = Query(50000, le=200000),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns latitude, longitude, and metadata for crime points.
    """
    cache_key = f"heatmap_points_{crime_group}_{district}_{date_from}_{date_to}_{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    conditions = []
    params = {}
    
    if crime_group:
        conditions.append("UPPER(crime_group_name) = UPPER(:crime_group)")
        params["crime_group"] = crime_group
    if district:
        conditions.append("UPPER(district_name) = UPPER(:district)")
        params["district"] = district
    if date_from:
        conditions.append("fir_date >= :date_from")
        params["date_from"] = str(date_from)
    if date_to:
        conditions.append("fir_date <= :date_to")
        params["date_to"] = str(date_to)
        
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT latitude, longitude, crime_group_name, crime_head_name, fir_date, fir_type
        FROM mv_crime_points
        {where_clause};
    """
    
    result = db.execute(sql, params).fetchall()
    
    points = []
    # Slice the results in Python using the limit constraint
    for row in result[:limit]:
        points.append({
            "lat": float(row[0] or 0.0),
            "lng": float(row[1] or 0.0),
            "crime_group": row[2],
            "crime_head": row[3],
            "date": str(row[4]) if row[4] is not None else None,
            "type": row[5]
        })
        
    cache_set(cache_key, points)
    return points

@router.get("/grid")
def get_grid_density(
    crime_group: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns pre-aggregated grid cells with crime density counts for the hexbin-style heatmap.
    """
    cache_key = f"grid_density_{crime_group}_{year}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    conditions = []
    params = {}
    
    if crime_group:
        conditions.append("UPPER(crime_group_name) = UPPER(:crime_group)")
        params["crime_group"] = crime_group
    if year:
        conditions.append("year = :year")
        params["year"] = year
        
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT lat_bucket, lon_bucket, SUM(intensity) as intensity
        FROM mv_grid_density
        {where_clause}
        GROUP BY lat_bucket, lon_bucket
        ORDER BY intensity DESC;
    """
    
    result = db.execute(sql, params).fetchall()
    
    grid = []
    # Slice first 20,000 dense cells in Python
    for row in result[:20000]:
        grid.append({
            "lat": float(row[0]),
            "lng": float(row[1]),
            "intensity": int(row[2])
        })
        
    cache_set(cache_key, grid)
    return grid

@router.get("/choropleth")
def get_district_choropleth(
    crime_group: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns a GeoJSON FeatureCollection of districts styled by crime stats.
    """
    cache_key = f"district_choropleth_{crime_group}_{year}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    sql = """
        SELECT 
            dg.district_name,
            dg.geom_wkt,
            c.crime_group_name,
            c.year,
            c.crime_count,
            c.violent_count,
            c.financial_count
        FROM dim_geography dg
        LEFT JOIN mv_district_choropleth c ON dg.district_name = c.district_name;
    """
    
    result = db.execute(sql).fetchall()
    
    # Process grouping and dynamic aggregation in Python
    districts_data = {}
    for row in result:
        name = row[0]
        wkt = row[1]
        c_group = row[2]
        c_year = int(row[3]) if row[3] is not None else None
        crime_count = int(row[4] or 0)
        violent_count = int(row[5] or 0)
        financial_count = int(row[6] or 0)
        
        # Apply filters
        if crime_group and c_group and crime_group.upper() != c_group.upper():
            continue
        if year and c_year and c_year != year:
            continue
            
        if name not in districts_data:
            districts_data[name] = {
                "geom_wkt": wkt,
                "crime_count": 0,
                "violent_count": 0,
                "financial_count": 0
            }
            
        districts_data[name]["crime_count"] += crime_count
        districts_data[name]["violent_count"] += violent_count
        districts_data[name]["financial_count"] += financial_count
        
    features = []
    for name, data in districts_data.items():
        properties = {
            "name": name,
            "crime_count": data["crime_count"],
            "violent_count": data["violent_count"],
            "financial_count": data["financial_count"]
        }
        
        # Parse EWKB hex string to Python GeoJSON dictionary
        geometry = parse_ewkb_to_geojson(data["geom_wkt"])
        
        features.append({
            "type": "Feature",
            "properties": properties,
            "geometry": geometry
        })
        
    choropleth_data = {
        "type": "FeatureCollection",
        "features": features
    }
    
    cache_set(cache_key, choropleth_data)
    return choropleth_data

@router.get("/stations")
def get_hotspot_stations(
    district: Optional[str] = Query(None),
    limit: int = Query(100),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns top hotspot stations with coordinates.
    """
    cache_key = f"hotspot_stations_{district}_{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    sql = """
        SELECT station_name, district_name, latitude, longitude, fir_count, top_crime_group
        FROM mv_station_profile
        WHERE latitude IS NOT NULL
        ORDER BY fir_count DESC;
    """
    result = db.execute(sql).fetchall()
    
    stations = []
    for row in result:
        # Filter by district name in Python if requested
        if district and district.upper() != str(row[1]).upper():
            continue
            
        stations.append({
            "name": row[0],
            "district": row[1],
            "lat": float(row[2]),
            "lng": float(row[3]),
            "fir_count": int(row[4]),
            "top_crime": row[5]
        })
        
        if len(stations) >= limit:
            break
            
    cache_set(cache_key, stations)
    return stations

@router.get("/crime-groups")
def get_crime_groups(db: CatalystDBClient = Depends(get_db)):
    """
    List of distinct crime groups for dropdown filtering.
    """
    cache_key = "crime_groups"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    sql = "SELECT DISTINCT crime_group_name FROM dim_crime_classification ORDER BY crime_group_name;"
    result = db.execute(sql).fetchall()
    crime_groups = [row[0] for row in result]
    
    cache_set(cache_key, crime_groups)
    return crime_groups
