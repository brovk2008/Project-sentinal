from fastapi import APIRouter, Depends, Query
from typing import Optional, Dict, Any
from db import get_db, CatalystDBClient

router = APIRouter(tags=["Trends"])

@router.get("/timeseries")
def get_timeseries(
    granularity: str = Query("month", enum=["month", "year"]),
    crime_group: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns monthly or yearly crime trends (counts, victims, accused, arrested, convicted).
    """
    params = {}
    conditions = []
    if crime_group:
        conditions.append("UPPER(crime_group_name) = UPPER(:crime_group)")
        params["crime_group"] = crime_group
    if district:
        conditions.append("UPPER(district_name) = UPPER(:district)")
        params["district"] = district
        
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    
    # We query the monthly aggregates and sum up by period in Python to stay database-independent
    sql = f"""
        SELECT 
            month,
            SUM(fir_count) AS count,
            SUM(total_victims) AS victims,
            SUM(total_accused) AS accused,
            SUM(total_arrested) AS arrested,
            SUM(total_convicted) AS convicted
        FROM mv_monthly_trends
        {where_clause}
        GROUP BY month
        ORDER BY month ASC;
    """
    
    result = db.execute(sql, params).fetchall()
    
    if granularity == "year":
        # Group by year in Python
        yearly_data = {}
        for row in result:
            date_str = str(row[0])
            year = date_str[:4] # Extract YYYY
            if year not in yearly_data:
                yearly_data[year] = {
                    "count": 0, "victims": 0, "accused": 0, "arrested": 0, "convicted": 0
                }
            yearly_data[year]["count"] += int(row[1] or 0)
            yearly_data[year]["victims"] += int(row[2] or 0)
            yearly_data[year]["accused"] += int(row[3] or 0)
            yearly_data[year]["arrested"] += int(row[4] or 0)
            yearly_data[year]["convicted"] += int(row[5] or 0)
            
        series = []
        for y in sorted(yearly_data.keys()):
            series.append({
                "period": y,
                "count": yearly_data[y]["count"],
                "victims": yearly_data[y]["victims"],
                "accused": yearly_data[y]["accused"],
                "arrested": yearly_data[y]["arrested"],
                "convicted": yearly_data[y]["convicted"]
            })
        return series
    else:
        series = []
        for row in result:
            series.append({
                "period": str(row[0]),
                "count": int(row[1] or 0),
                "victims": int(row[2] or 0),
                "accused": int(row[3] or 0),
                "arrested": int(row[4] or 0),
                "convicted": int(row[5] or 0)
            })
        return series

@router.get("/by-crime-group")
def get_by_crime_group(
    year: Optional[int] = Query(None),
    district: Optional[str] = Query(None),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns total crime counts per crime group. Used for pie charts / treemaps.
    """
    conditions = []
    params = {}
    
    if district:
        conditions.append("UPPER(district_name) = UPPER(:district)")
        params["district"] = district
        
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT crime_group_name, month, SUM(fir_count) AS count
        FROM mv_monthly_trends
        {where_clause}
        GROUP BY crime_group_name, month;
    """
    
    result = db.execute(sql, params).fetchall()
    
    # Process aggregation and year filtering in Python
    group_counts = {}
    for row in result:
        month_str = str(row[1])
        row_year = int(month_str[:4])
        if year and row_year != year:
            continue
            
        group = row[0]
        count = int(row[2] or 0)
        group_counts[group] = group_counts.get(group, 0) + count
        
    sorted_groups = sorted(group_counts.items(), key=lambda x: x[1], reverse=True)
    return [{"group": g, "count": c} for g, c in sorted_groups]

@router.get("/top-crimes")
def get_top_crimes(
    limit: int = Query(20, le=100),
    year: Optional[int] = Query(None),
    district: Optional[str] = Query(None),
    crime_group: Optional[str] = Query(None),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns top specific crime heads with their details.
    """
    conditions = []
    params = {}
    
    if year:
        conditions.append("year = :year")
        params["year"] = year
    if district:
        conditions.append("UPPER(district_name) = UPPER(:district)")
        params["district"] = district
    if crime_group:
        conditions.append("UPPER(crime_group_name) = UPPER(:crime_group)")
        params["crime_group"] = crime_group
        
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT crime_head_name, crime_group_name, SUM(fir_count) AS count,
               SUM(victims) AS total_victims, SUM(accused) AS total_accused, 
               SUM(arrests) AS total_arrests, SUM(convictions) AS total_convictions
        FROM mv_top_crimes
        {where_clause}
        GROUP BY crime_head_name, crime_group_name
        ORDER BY count DESC;
    """
    
    result = db.execute(sql, params).fetchall()
    
    top_list = []
    # Slice the result using limit parameter in Python
    for row in result[:limit]:
        accused = int(row[4] or 0)
        arrested = int(row[5] or 0)
        convicted = int(row[6] or 0)
        
        arrest_rate = round(100.0 * arrested / accused, 2) if accused > 0 else 0.0
        conviction_rate = round(100.0 * convicted / arrested, 2) if arrested > 0 else 0.0
        
        top_list.append({
            "head": row[0],
            "group": row[1],
            "count": int(row[2] or 0),
            "victims": int(row[3] or 0),
            "accused": accused,
            "arrested": arrested,
            "convicted": convicted,
            "arrest_rate": arrest_rate,
            "conviction_rate": conviction_rate
        })
    return top_list

@router.get("/day-of-week")
def get_day_of_week_pattern(
    district: Optional[str] = Query(None),
    crime_group: Optional[str] = Query(None),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns day-of-week crime distribution. 0 = Sunday, 6 = Saturday.
    """
    conditions = []
    params = {}
    
    if district:
        conditions.append("UPPER(district_name) = UPPER(:district)")
        params["district"] = district
    if crime_group:
        conditions.append("UPPER(crime_group_name) = UPPER(:crime_group)")
        params["crime_group"] = crime_group
        
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT day_of_week, SUM(crime_count) AS count, SUM(total_victims) AS victims
        FROM mv_day_of_week_trends
        {where_clause}
        GROUP BY day_of_week
        ORDER BY day_of_week;
    """
    
    result = db.execute(sql, params).fetchall()
    
    days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    return [
        {
            "day_num": int(row[0]),
            "day_name": days[int(row[0])],
            "count": int(row[1] or 0),
            "victims": int(row[2] or 0)
        } for row in result
    ]

@router.get("/yoy")
def get_yoy_comparison(
    district: Optional[str] = Query(None),
    crime_group: Optional[str] = Query(None),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns yearly count comparison to calculate YoY growth.
    """
    conditions = []
    params = {}
    
    if district:
        conditions.append("UPPER(district_name) = UPPER(:district)")
        params["district"] = district
    if crime_group:
        conditions.append("UPPER(crime_group_name) = UPPER(:crime_group)")
        params["crime_group"] = crime_group
        
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT year, SUM(fir_count) AS count
        FROM mv_top_crimes
        {where_clause}
        GROUP BY year
        ORDER BY year ASC;
    """
    
    result = db.execute(sql, params).fetchall()
    
    yoy_list = []
    for i, row in enumerate(result):
        curr_year = int(row[0])
        curr_count = int(row[1] or 0)
        prev_count = 0
        yoy_growth = 0.0
        
        if i > 0:
            prev_count = int(result[i-1][1] or 0)
            if prev_count > 0:
                yoy_growth = round(100.0 * (curr_count - prev_count) / prev_count, 2)
                
        yoy_list.append({
            "year": curr_year,
            "count": curr_count,
            "prev_count": prev_count,
            "growth_pct": yoy_growth
        })
    return yoy_list

@router.get("/funnel")
def get_conviction_funnel(
    district: Optional[str] = Query(None),
    crime_group: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns funnel stats: Accused -> Arrested -> Convicted.
    """
    conditions = []
    params = {}
    
    if district:
        conditions.append("UPPER(district_name) = UPPER(:district)")
        params["district"] = district
    if crime_group:
        conditions.append("UPPER(crime_group_name) = UPPER(:crime_group)")
        params["crime_group"] = crime_group
    if year:
        conditions.append("year = :year")
        params["year"] = year
        
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT 
            SUM(accused) AS accused,
            SUM(arrests) AS arrested,
            SUM(convictions) AS convicted
        FROM mv_top_crimes
        {where_clause};
    """
    result = db.execute(sql, params)
    row = result.fetchone()
    
    accused = int(row[0] or 0) if row else 0
    arrested = int(row[1] or 0) if row else 0
    convicted = int(row[2] or 0) if row else 0
    
    return [
        {"stage": "Accused", "value": accused, "pct": 100.0},
        {"stage": "Arrested", "value": arrested, "pct": round(100.0 * arrested / accused, 2) if accused > 0 else 0.0},
        {"stage": "Convicted", "value": convicted, "pct": round(100.0 * convicted / accused, 2) if accused > 0 else 0.0}
    ]
