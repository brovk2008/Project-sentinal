import os
import logging
import xml.etree.ElementTree as ET
from pathlib import Path
import pandas as pd
from tqdm import tqdm
from db_conn import bulk_load_df, get_connection, get_engine

LOGGER = logging.getLogger("sentinel_etl")
DATA_DIR = Path(__file__).resolve().parents[1]

FIR_DISTRICT_CANONICAL = {
    "Bagalkot": "Bagalkot", "Ballari": "Bellary", "Vijayanagara": "Bellary",
    "Belagavi City": "Belgaum", "Belagavi Dist": "Belgaum",
    "Bengaluru City": "Bangalore", "Bengaluru Dist": "Bangalore Rural",
    "Bidar": "Bidar", "Chamarajanagar": "Chamarajanagar",
    "Chickballapura": "Chikkaballapura", "Chikkamagaluru": "Chikmagalur",
    "Chitradurga": "Chitradurga", "Dakshina Kannada": "Dakshina Kannada",
    "Mangaluru City": "Dakshina Kannada", "Davanagere": "Davanagere",
    "Dharwad": "Dharwad", "Hubballi Dharwad City": "Dharwad",
    "Gadag": "Gadag", "Hassan": "Hassan", "Haveri": "Haveri",
    "K.G.F": "Kolar", "Kalaburagi": "Gulbarga", "Kalaburagi City": "Gulbarga",
    "Kodagu": "Kodagu", "Kolar": "Kolar", "Koppal": "Koppal",
    "Mandya": "Mandya", "Mysuru City": "Mysore", "Mysuru Dist": "Mysore",
    "Raichur": "Raichur", "Ramanagara": "Ramanagara", "Shivamogga": "Shimoga",
    "Tumakuru": "Tumkur", "Udupi": "Udupi", "Uttara Kannada": "Uttara Kannada",
    "Vijayapur": "Bijapur", "Yadgir": "Yadgir",
    "CID": "Bangalore", "ISD Bengaluru": "Bangalore",
    "Karnataka Railways": "Bangalore", "Coastal Security Police": "Bangalore",
}

CHUNK_SIZE = 300_000


def load_station_coords_from_kml(kml_path: str) -> dict:
    coords = {}
    if not os.path.exists(kml_path):
        LOGGER.warning(f"KML file not found: {kml_path}")
        return coords
    tree = ET.parse(kml_path)
    root = tree.getroot()
    ns_raw = root.tag.split("}")[0].lstrip("{")
    ns = f"{{{ns_raw}}}" if ns_raw != root.tag else ""
    for pm in root.iter(f"{ns}Placemark"):
        coord_el = pm.find(f".//{ns}coordinates")
        if coord_el is None:
            continue
        parts = coord_el.text.strip().split(",")
        if len(parts) < 2:
            continue
        lon, lat = float(parts[0]), float(parts[1])
        ext_data = pm.find(f"{ns}ExtendedData")
        if ext_data is None:
            continue
        schema_data = ext_data.find(f"{ns}SchemaData")
        if schema_data is None:
            continue
        for field in ("POL_STAName", "RW_POL_STAName"):
            el = schema_data.find(f".//{ns}SimpleData[@name='" + field + "']")
            if el is not None and el.text:
                coords[el.text.strip().upper()] = (lat, lon)
                break
    return coords


def load_police_units(df_full: pd.DataFrame, station_coords: dict):
    LOGGER.info("Populating dim_police_units...")
    units = df_full[["Unit_ID", "UnitName", "District_Name"]].drop_duplicates(subset=["Unit_ID"])
    units = units.rename(columns={"Unit_ID": "unit_id", "UnitName": "unit_name", "District_Name": "district_name"})
    units["unit_id"] = pd.to_numeric(units["unit_id"], errors="coerce").fillna(0).astype(int)
    units["latitude"] = units["unit_name"].apply(
        lambda n: station_coords.get(str(n).strip().upper(), (None, None))[0]
    )
    units["longitude"] = units["unit_name"].apply(
        lambda n: station_coords.get(str(n).strip().upper(), (None, None))[1]
    )
    conn = get_connection()
    cursor = conn.cursor()
    try:
        for _, row in units.iterrows():
            cursor.execute(
                "INSERT INTO dim_police_units (unit_id, unit_name, district_name, latitude, longitude) "
                "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (unit_id) DO NOTHING;",
                (int(row["unit_id"]), str(row["unit_name"])[:149], str(row["district_name"])[:99],
                 None if pd.isna(row["latitude"]) else float(row["latitude"]),
                 None if pd.isna(row["longitude"]) else float(row["longitude"]))
            )
        conn.commit()
        LOGGER.info(f"Loaded {len(units)} police units.")
    except Exception as e:
        conn.rollback()
        LOGGER.error(f"Failed to load police units: {e}")
        raise
    finally:
        cursor.close()
        conn.close()


def load_crime_classification(df_full: pd.DataFrame) -> dict:
    LOGGER.info("Populating dim_crime_classification...")
    classes = df_full[["CrimeGroup_Name", "CrimeHead_Name"]].drop_duplicates()
    classes["CrimeGroup_Name"] = classes["CrimeGroup_Name"].astype(str).str.strip()
    classes["CrimeHead_Name"] = classes["CrimeHead_Name"].astype(str).str.strip()
    conn = get_connection()
    cursor = conn.cursor()
    crime_map = {}
    try:
        for _, row in classes.iterrows():
            group = row["CrimeGroup_Name"][:149]
            head = row["CrimeHead_Name"][:149]
            cursor.execute(
                "INSERT INTO dim_crime_classification (crime_group_name, crime_head_name) "
                "VALUES (%s, %s) ON CONFLICT (crime_group_name, crime_head_name) "
                "DO UPDATE SET crime_group_name = EXCLUDED.crime_group_name RETURNING crime_class_id;",
                (group, head)
            )
            crime_map[(group, head)] = cursor.fetchone()[0]
        conn.commit()
        LOGGER.info(f"Loaded {len(crime_map)} crime classifications.")
    except Exception as e:
        conn.rollback()
        LOGGER.error(f"Failed to load crime classifications: {e}")
        raise
    finally:
        cursor.close()
        conn.close()
    return crime_map


def apply_coordinate_fallback(df: pd.DataFrame, station_coords: dict, centroid_map: dict) -> pd.DataFrame:
    df["Latitude"] = pd.to_numeric(df["Latitude"], errors="coerce")
    df["Longitude"] = pd.to_numeric(df["Longitude"], errors="coerce")
    missing = df["Latitude"].isna() | df["Longitude"].isna()
    # Tier 2: station coords
    for idx in df[missing].index:
        key = str(df.at[idx, "UnitName"]).strip().upper()
        if key in station_coords:
            df.at[idx, "Latitude"] = station_coords[key][0]
            df.at[idx, "Longitude"] = station_coords[key][1]
    # Tier 3: district centroid
    still_missing = df["Latitude"].isna() | df["Longitude"].isna()
    for idx in df[still_missing].index:
        raw = str(df.at[idx, "District_Name"]).strip()
        canon = FIR_DISTRICT_CANONICAL.get(raw, raw)
        if canon in centroid_map:
            df.at[idx, "Latitude"] = centroid_map[canon][0]
            df.at[idx, "Longitude"] = centroid_map[canon][1]
    return df


def get_centroid_map() -> dict:
    engine = get_engine()
    with engine.connect() as conn:
        df_cent = pd.read_sql("SELECT district_name, latitude, longitude FROM district_centroids", conn)
    return {r["district_name"]: (r["latitude"], r["longitude"]) for _, r in df_cent.iterrows()}


def load_fir(csv_path: str):
    if not os.path.exists(csv_path):
        LOGGER.error(f"FIR CSV not found: {csv_path}")
        return
    LOGGER.info("=== Starting FIR ETL Pipeline ===")
    kml_main = str(DATA_DIR / "9181e6ed-6164-430b-8b10-238ad7b8ab45.kml")
    kml_rail = str(DATA_DIR / "fe3f24fc-6c17-4080-afea-d44f3867c834.kml")
    station_coords = {}
    station_coords.update(load_station_coords_from_kml(kml_main))
    station_coords.update(load_station_coords_from_kml(kml_rail))
    LOGGER.info(f"Loaded {len(station_coords)} station coords from KML.")
    LOGGER.info("Clearing old FIR-related tables...")
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("TRUNCATE dim_police_units, dim_crime_classification, fact_fir_events CASCADE;")
        conn.commit()
    except Exception as e:
        conn.rollback()
        LOGGER.error(f"Failed to truncate FIR tables: {e}")
        raise e
    finally:
        cursor.close()
        conn.close()

    LOGGER.info("Reading FIR CSV for dimensions...")
    df_full = pd.read_csv(csv_path,
        usecols=["Unit_ID","UnitName","District_Name","CrimeGroup_Name","CrimeHead_Name"],
        dtype=str, low_memory=False).fillna("")
    load_police_units(df_full, station_coords)
    crime_map = load_crime_classification(df_full)
    del df_full
    centroid_map = get_centroid_map()
    LOGGER.info(f"Loaded {len(centroid_map)} centroids for fallback.")
    
    engine = get_engine()
    with engine.connect() as eng_conn:
        valid_unit_ids = set(pd.read_sql("SELECT unit_id FROM dim_police_units", eng_conn)["unit_id"].tolist())
    total_loaded = 0
    total_skipped = 0
    for chunk in tqdm(pd.read_csv(csv_path, chunksize=CHUNK_SIZE, dtype=str, low_memory=False), desc="FIR facts"):
        chunk.columns = chunk.columns.str.strip()
        for col, default in [("FIR_YEAR", 2020), ("FIR_MONTH", 1), ("FIR_Day", 1)]:
            chunk[col] = pd.to_numeric(chunk.get(col, default), errors="coerce").fillna(default).astype(int)
        chunk["FIR_MONTH"] = chunk["FIR_MONTH"].clip(1, 12)
        chunk["FIR_Day"] = chunk["FIR_Day"].clip(1, 28)
        chunk["fir_date"] = pd.to_datetime(
            chunk[["FIR_YEAR","FIR_MONTH","FIR_Day"]].rename(
                columns={"FIR_YEAR":"year","FIR_MONTH":"month","FIR_Day":"day"}),
            errors="coerce").fillna(pd.Timestamp("2000-01-01"))
        chunk = apply_coordinate_fallback(chunk, station_coords, centroid_map)
        chunk["Unit_ID"] = pd.to_numeric(chunk.get("Unit_ID", 0), errors="coerce").fillna(0).astype(int)
        chunk["CrimeGroup_Name"] = chunk["CrimeGroup_Name"].astype(str).str.strip().str[:149]
        chunk["CrimeHead_Name"] = chunk["CrimeHead_Name"].astype(str).str.strip().str[:149]
        chunk["crime_class_id"] = chunk.apply(
            lambda r: crime_map.get((r["CrimeGroup_Name"], r["CrimeHead_Name"]), None), axis=1)
        chunk["fir_id"] = (chunk["District_Name"].astype(str).str.strip() + "_"
            + chunk["Unit_ID"].astype(str) + "_" + chunk["FIR_YEAR"].astype(str)
            + "_" + chunk.index.astype(str))
        chunk["geo_id"] = chunk["District_Name"].apply(
            lambda n: "DISTRICT_" + FIR_DISTRICT_CANONICAL.get(str(n).strip(), str(n).strip()).upper())
        before = len(chunk)
        chunk = chunk.dropna(subset=["crime_class_id"])
        chunk = chunk[chunk["Unit_ID"].isin(valid_unit_ids)]
        total_skipped += before - len(chunk)
        for col in ["Offence_Duration","VICTIM COUNT","Accused Count","Conviction Count"]:
            chunk[col] = pd.to_numeric(chunk.get(col, 0), errors="coerce").fillna(0).astype(int)
        arr_col = "Arrested Count\tNo."
        chunk["arrested_count"] = pd.to_numeric(chunk.get(arr_col, 0), errors="coerce").fillna(0).astype(int)
        fir_num_col = "FIR_" if "FIR_" in chunk.columns else ("FIR_number" if "FIR_number" in chunk.columns else None)
        fir_number = chunk[fir_num_col] if fir_num_col else chunk.index.astype(str)
        load_df = pd.DataFrame({
            "fir_id": chunk["fir_id"],
            "fir_number": fir_number,
            "unit_id": chunk["Unit_ID"],
            "geo_id": chunk["geo_id"],
            "crime_class_id": chunk["crime_class_id"].astype(int),
            "fir_date": chunk["fir_date"],
            "offence_duration_minutes": chunk["Offence_Duration"],
            "fir_type": chunk.get("FIR Type", pd.Series("", index=chunk.index)).astype(str).str.strip().str[:49],
            "fir_stage": chunk.get("FIR_Stage", pd.Series("", index=chunk.index)).astype(str).str.strip().str[:99],
            "complaint_mode": chunk.get("Complaint_Mode", pd.Series("", index=chunk.index)).astype(str).str.strip().str[:99],
            "io_name": chunk.get("IOName", pd.Series("", index=chunk.index)).astype(str).str.strip().str[:149],
            "io_kgid": chunk.get("KGID", pd.Series("", index=chunk.index)).astype(str).str.strip().str[:29],
            "victim_count": chunk["VICTIM COUNT"],
            "accused_count": chunk["Accused Count"],
            "arrested_count": chunk["arrested_count"],
            "conviction_count": chunk["Conviction Count"],
            "latitude": chunk["Latitude"],
            "longitude": chunk["Longitude"],
        })
        fact_cols = ["fir_id","fir_number","unit_id","geo_id","crime_class_id","fir_date",
            "offence_duration_minutes","fir_type","fir_stage","complaint_mode","io_name",
            "io_kgid","victim_count","accused_count","arrested_count","conviction_count",
            "latitude","longitude"]
        bulk_load_df(load_df, "fact_fir_events", columns=fact_cols)
        total_loaded += len(load_df)
    LOGGER.info(f"FIR ETL complete. Loaded={total_loaded}, Skipped={total_skipped}.")


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    csv_path = str(DATA_DIR / "fir-details-karnataka-police" / "FIR_Details_Data.csv")
    if len(sys.argv) > 1:
        csv_path = sys.argv[1]
    load_fir(csv_path)
