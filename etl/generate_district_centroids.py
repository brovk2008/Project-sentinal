import os
import logging
import shapefile
from shapely.geometry import shape

from db_conn import get_connection

LOGGER = logging.getLogger("sentinel_etl")

# Canonical spelling map from shapefile DISTRICT name to standardized canonical name
# (Just to align names perfectly with any literacy/census variations)
DISTRICT_NAME_CLEANUP = {
    "Chikkaballapura": "Chikkaballapura",
    "Chikmagalur": "Chikmagalur",
    "Chitradurga": "Chitradurga",
    "Dakshina Kannada": "Dakshina Kannada",
    "Davanagere": "Davanagere",
    "Dharwad": "Dharwad",
    "Gadag": "Gadag",
    "Gulbarga": "Gulbarga",
    "Hassan": "Hassan",
    "Haveri": "Haveri",
    "Kodagu": "Kodagu",
    "Kolar": "Kolar",
    "Koppal": "Koppal",
    "Mandya": "Mandya",
    "Mysore": "Mysore",
    "Raichur": "Raichur",
    "Ramanagara": "Ramanagara",
    "Shimoga": "Shimoga",
    "Tumkur": "Tumkur",
    "Udupi": "Udupi",
    "Uttara Kannada": "Uttara Kannada",
    "Yadgir": "Yadgir",
    "Bagalkot": "Bagalkot",
    "Bangalore": "Bangalore",
    "Bangalore Rural": "Bangalore Rural",
    "Belgaum": "Belgaum",
    "Bellary": "Bellary",
    "Bidar": "Bidar",
    "Bijapur": "Bijapur",
    "Chamrajnagar": "Chamarajanagar",  # Standardize spelling
}

def generate_centroids(shp_path: str):
    """
    Parses Karnataka districts from the shapefile, computes their centroids,
    and populates `district_centroids` and `dim_geography`.
    """
    if not os.path.exists(shp_path):
        LOGGER.error(f"Shapefile not found at: {shp_path}")
        raise FileNotFoundError(f"Missing shapefile: {shp_path}")

    LOGGER.info(f"Processing shapefile: {shp_path}")
    karnataka_records = []

    with shapefile.Reader(shp_path) as sf:
        for shape_rec in sf.iterShapeRecords():
            record = shape_rec.record.as_dict()
            # Filter for Karnataka state
            if record.get("ST_NM") == "Karnataka" or record.get("ST_CEN_CD") == 29:
                geom = shape(shape_rec.shape)
                centroid = geom.centroid
                
                raw_name = record.get("DISTRICT")
                canonical_name = DISTRICT_NAME_CLEANUP.get(raw_name, raw_name)
                
                karnataka_records.append({
                    "name": canonical_name,
                    "lat": centroid.y,
                    "lon": centroid.x,
                    "wkt": geom.wkt
                })

    LOGGER.info(f"Found {len(karnataka_records)} districts for Karnataka.")
    
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # 1. Populates district_centroids
        centroid_sql = """
            INSERT INTO district_centroids (district_name, latitude, longitude)
            VALUES (%s, %s, %s)
            ON CONFLICT (district_name) 
            DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude;
        """
        for rec in karnataka_records:
            cursor.execute(centroid_sql, (rec["name"], rec["lat"], rec["lon"]))
        
        # 2. Populates dim_geography (Base districts for demographics)
        geography_sql = """
            INSERT INTO dim_geography (geo_id, district_name, geom)
            VALUES (%s, %s, ST_GeomFromText(%s, 4326))
            ON CONFLICT (geo_id) 
            DO UPDATE SET geom = EXCLUDED.geom;
        """
        for rec in karnataka_records:
            geo_id = f"DISTRICT_{rec['name'].upper()}"
            cursor.execute(geography_sql, (geo_id, rec["name"], rec["wkt"]))

        conn.commit()
        LOGGER.info("Successfully populated district centroids and geography boundaries.")
    except Exception as e:
        conn.rollback()
        LOGGER.error(f"Failed to populate centroids: {e}")
        raise e
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    import sys
    shp = r"c:\Users\techp\Downloads\more projects\Project Sentinel\india-geodata\data\administrative\districts\census-2011\2011_Dist.shp"
    if len(sys.argv) > 1:
        shp = sys.argv[1]
    logging.basicConfig(level=logging.INFO)
    generate_centroids(shp)
