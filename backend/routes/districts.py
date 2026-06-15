from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
from db import get_db, CatalystDBClient

try:
    from cache import get as cache_get, set as cache_set
except ImportError:
    from backend.cache import get as cache_get, set as cache_set

router = APIRouter(tags=["Districts"])

@router.get("/")
def list_districts(db: CatalystDBClient = Depends(get_db)):
    """
    Lists all districts in Karnataka with aggregate counts, arrest efficiency, and rankings.
    """
    cache_key = "districts_list"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    sql = """
        SELECT 
            dp.district_name,
            dp.total_firs,
            dp.station_count,
            dp.unique_crime_types,
            dp.total_victims,
            dp.total_accused,
            dp.total_arrested,
            dp.earliest_fir,
            dp.latest_fir,
            dd.population_total,
            dd.literacy_rate,
            dd.facebook_wealth_index
        FROM mv_district_profile dp
        LEFT JOIN dim_geography dg ON dg.district_name = dp.district_name
        LEFT JOIN dim_demographics dd ON dg.geo_id = dd.geo_id;
    """
    
    result = db.execute(sql).fetchall()
    
    districts = []
    for row in result:
        total_firs = int(row[1] or 0)
        total_accused = int(row[5] or 0)
        total_arrested = int(row[6] or 0)
        
        arrest_rate = round(100.0 * total_arrested / total_accused, 2) if total_accused > 0 else 0.0
        
        pop = int(row[9] or 0) if row[9] is not None else None
        crime_rate = round(1e5 * total_firs / pop, 2) if pop and pop > 0 else 0.0
        
        districts.append({
            "name": row[0],
            "total_firs": total_firs,
            "station_count": int(row[2] or 0),
            "unique_crime_types": int(row[3] or 0),
            "total_victims": int(row[4] or 0),
            "total_accused": total_accused,
            "total_arrested": total_arrested,
            "arrest_rate": arrest_rate,
            "earliest_fir": str(row[7]) if row[7] is not None else None,
            "latest_fir": str(row[8]) if row[8] is not None else None,
            "population": pop,
            "literacy_rate": float(row[10] or 0.0) if row[10] is not None else None,
            "wealth_index": float(row[11] or 0.0) if row[11] is not None else None,
            "crime_rate_per_100k": crime_rate,
            "crime_rank": 1,
            "efficiency_rank": 1
        })
        
    # Calculate Dense Rank for crime_rank (total_firs DESC)
    districts.sort(key=lambda x: x["total_firs"], reverse=True)
    curr_rank = 0
    last_val = -1
    for idx, d in enumerate(districts):
        if d["total_firs"] != last_val:
            curr_rank = idx + 1
            last_val = d["total_firs"]
        d["crime_rank"] = curr_rank
        
    # Calculate Dense Rank for efficiency_rank (arrest_rate DESC)
    districts.sort(key=lambda x: x["arrest_rate"], reverse=True)
    curr_rank = 0
    last_val = -1.0
    for idx, d in enumerate(districts):
        if d["arrest_rate"] != last_val:
            curr_rank = idx + 1
            last_val = d["arrest_rate"]
        d["efficiency_rank"] = curr_rank
        
    # Sort back by total_firs DESC for response structure
    districts.sort(key=lambda x: x["total_firs"], reverse=True)
    
    cache_set(cache_key, districts)
    return districts

@router.get("/{district_name}")
def get_district_profile(district_name: str, db: CatalystDBClient = Depends(get_db)):
    """
    Returns a comprehensive profile for a single district.
    """
    cache_key = f"district_profile_{district_name.upper()}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    sql = """
        SELECT 
            dp.district_name,
            dp.total_firs,
            dp.station_count,
            dp.unique_crime_types,
            dp.total_victims,
            dp.total_accused,
            dp.total_arrested,
            dp.earliest_fir,
            dp.latest_fir,
            dd.population_total,
            dd.population_urban,
            dd.literacy_rate,
            dd.consumption_index,
            dd.facebook_wealth_index
        FROM mv_district_profile dp
        LEFT JOIN dim_geography dg ON dg.district_name = dp.district_name
        LEFT JOIN dim_demographics dd ON dg.geo_id = dd.geo_id
        WHERE UPPER(dp.district_name) = UPPER(:district_name);
    """
    
    result = db.execute(sql, {"district_name": district_name})
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"District '{district_name}' not found")
        
    total_firs = int(row[1] or 0)
    total_accused = int(row[5] or 0)
    total_arrested = int(row[6] or 0)
    
    arrest_rate = round(100.0 * total_arrested / total_accused, 2) if total_accused > 0 else 0.0
    pop = int(row[9] or 0) if row[9] is not None else None
    crime_rate = round(1e5 * total_firs / pop, 2) if pop and pop > 0 else 0.0
    
    profile = {
        "name": row[0],
        "total_firs": total_firs,
        "station_count": int(row[2] or 0),
        "unique_crime_types": int(row[3] or 0),
        "total_victims": int(row[4] or 0),
        "total_accused": total_accused,
        "total_arrested": total_arrested,
        "arrest_rate": arrest_rate,
        "earliest_fir": str(row[7]) if row[7] is not None else None,
        "latest_fir": str(row[8]) if row[8] is not None else None,
        "population": pop,
        "population_urban": int(row[10] or 0) if row[10] is not None else None,
        "literacy_rate": float(row[11] or 0.0) if row[11] is not None else None,
        "consumption_index": float(row[12] or 0.0) if row[12] is not None else None,
        "wealth_index": float(row[13] or 0.0) if row[13] is not None else None,
        "crime_rate_per_100k": crime_rate
    }
    
    cache_set(cache_key, profile)
    return profile

@router.get("/{district_name}/stations")
def get_district_stations(
    district_name: str,
    limit: int = Query(20, le=100),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns top police stations in a district by FIR count.
    """
    cache_key = f"district_stations_{district_name.upper()}_{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    sql = """
        SELECT station_name, latitude, longitude, fir_count, victims, accused, arrests, convictions, top_crime_group
        FROM mv_station_profile
        WHERE UPPER(district_name) = UPPER(:district_name)
        ORDER BY fir_count DESC;
    """
    result = db.execute(sql, {"district_name": district_name}).fetchall()
    
    # Apply limit in Python to ensure compatibility across ZCQL/SQLite parameters
    stations = []
    for row in result[:limit]:
        accused = int(row[5] or 0)
        arrested = int(row[6] or 0)
        convicted = int(row[7] or 0)
        
        stations.append({
            "name": row[0],
            "lat": float(row[1]) if row[1] is not None else None,
            "lng": float(row[2]) if row[2] is not None else None,
            "fir_count": int(row[3] or 0),
            "victims": int(row[4] or 0),
            "accused": accused,
            "arrested": arrested,
            "convicted": convicted,
            "arrest_rate": round(100.0 * arrested / accused, 2) if accused > 0 else 0.0,
            "conviction_rate": round(100.0 * convicted / arrested, 2) if arrested > 0 else 0.0,
            "top_crime": row[8]
        })
        
    cache_set(cache_key, stations)
    return stations

@router.get("/{district_name}/trend")
def get_district_trend(
    district_name: str,
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns monthly crime trend for a specific district.
    """
    cache_key = f"district_trend_{district_name.upper()}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    sql = """
        SELECT month, SUM(fir_count) AS count
        FROM mv_monthly_trends
        WHERE UPPER(district_name) = UPPER(:district_name)
        GROUP BY month
        ORDER BY month ASC;
    """
    result = db.execute(sql, {"district_name": district_name}).fetchall()
    trend = [{"period": str(row[0]), "count": int(row[1] or 0)} for row in result]
    
    cache_set(cache_key, trend)
    return trend
