import os
import json
import xml.etree.ElementTree as ET
import shapefile
from shapely.geometry import shape, mapping
import numpy as np

try:
    from backend.db import db_client
    from backend.rag.embeddings import get_embeddings
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from db import db_client
    from rag.embeddings import get_embeddings

def ingest_geospatial():
    workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    print(f"[GIS Ingest] Workspace root: {workspace_root}", flush=True)
    
    # Get the next chunk_id sequence for RAG
    res_max = db_client.execute("SELECT MAX(chunk_id) FROM rag_document_embeddings;")
    max_row = res_max.fetchone()
    next_chunk_id = (max_row[0] or 0) + 1 if max_row else 1
    
    # 1. Ingest Shapefiles
    next_chunk_id = ingest_shapefiles(workspace_root, next_chunk_id)
    
    # 2. Ingest KML Files
    next_chunk_id = ingest_kml_files(workspace_root, next_chunk_id)
    
    # 3. Ingest GeoJSON (INDIA_POLICE_STATIONS)
    next_chunk_id = ingest_geojson_files(workspace_root, next_chunk_id)
    
    print("[GIS Ingest] Geospatial ingestion pipeline completed successfully.")

def ingest_shapefiles(workspace_root: str, start_chunk_id: int) -> int:
    next_chunk_id = start_chunk_id
    
    # List of shapefile layers to process
    layers = [
        {"path": "shrug-pc11state-poly-shp/state.shp", "level": "state"},
        {"path": "shrug-pc11dist-poly-shp/district.shp", "level": "district"},
        {"path": "shrug-pc11subdist-poly-shp/subdistrict.shp", "level": "subdistrict"}
    ]
    
    for layer in layers:
        shp_path = os.path.join(workspace_root, layer["path"])
        if not os.path.exists(shp_path):
            print(f"[GIS Ingest] Shapefile not found: {layer['path']}, skipping...", flush=True)
            continue
            
        print(f"[GIS Ingest] Processing Shapefile: {layer['path']}", flush=True)
        
        # Check if already ingested
        file_name = os.path.basename(layer["path"])
        res_check = db_client.execute("SELECT COUNT(*) FROM rag_document_embeddings WHERE document_name = :doc_name;", {"doc_name": file_name})
        if res_check.fetchone()[0] > 0:
            print(f"[GIS Ingest] Shapefile {file_name} already ingested. Skipping...", flush=True)
            continue
            
        try:
            sf = shapefile.Reader(shp_path)
            records = sf.records()
            shapes = sf.shapes()
            
            gis_chunks = []
            for idx, (rec, shp) in enumerate(zip(records, shapes)):
                rec_dict = rec.as_dict()
                geom = shape(shp)
                centroid = geom.centroid
                
                # Check for Karnataka filters to prevent row blowup
                state_name = rec_dict.get("state_name", rec_dict.get("pc11_state", "")).upper()
                dist_name = rec_dict.get("district_n", rec_dict.get("pc11_dist", "")).upper()
                
                is_karnataka = "KARNATAKA" in state_name or "29" in str(rec_dict.get("state_code", "")) or "29" in str(rec_dict.get("pc11_s_id", ""))
                
                if layer["level"] != "state" and not is_karnataka:
                    continue
                    
                # Format a descriptive text chunk
                name = rec_dict.get("state_name", rec_dict.get("district_n", rec_dict.get("subdist_na", "Unknown")))
                area = geom.area
                
                chunk_txt = f"Geospatial Layer: {layer['level'].capitalize()} Boundary, Name: {name}, State: Karnataka, Centroid Latitude: {centroid.y:.6f}, Centroid Longitude: {centroid.x:.6f}, Area: {area:.6f}"
                
                # Export GeoJSON geometry description to WKT
                wkt_str = geom.wkt
                
                gis_chunks.append({
                    "name": name,
                    "level": layer["level"],
                    "chunk_text": chunk_txt,
                    "wkt": wkt_str,
                    "centroid_lat": centroid.y,
                    "centroid_lon": centroid.x
                })
                
            print(f"  Found {len(gis_chunks)} matching Karnataka features in shapefile.", flush=True)
            
            # Batch generate embeddings and insert
            batch_size = 50
            for i in range(0, len(gis_chunks), batch_size):
                batch = gis_chunks[i:i+batch_size]
                texts = [b["chunk_text"] for b in batch]
                embeddings = get_embeddings(texts)
                
                for item, emb in zip(batch, embeddings):
                    emb_json = json.dumps(emb)
                    metadata = {
                        "source_type": "shapefile",
                        "source_file": file_name,
                        "centroid_lat": item["centroid_lat"],
                        "centroid_lon": item["centroid_lon"],
                        "name": item["name"],
                        "level": item["level"]
                    }
                    metadata_str = json.dumps(metadata)
                    
                    # Store in RAG index
                    db_client.execute(
                        """
                        INSERT INTO rag_document_embeddings (chunk_id, document_name, page_number, text_content, metadata_json, embedding)
                        VALUES (:chunk_id, :doc_name, :page_num, :text_content, :metadata_json, :embedding);
                        """,
                        {
                            "chunk_id": next_chunk_id,
                            "doc_name": file_name,
                            "page_num": i + batch.index(item) + 1,
                            "text_content": item["chunk_text"],
                            "metadata_json": metadata_str,
                            "embedding": emb_json
                        }
                    )
                    next_chunk_id += 1
                    
                    # Store in dim_geography if it represents a district/subdistrict
                    geo_id = f"{layer['level'].upper()}_{item['name'].upper().replace(' ', '_')}"
                    db_client.execute(
                        """
                        INSERT OR REPLACE INTO dim_geography (geo_id, district_name, sub_district_name, geom_wkt)
                        VALUES (:geo_id, :dist_name, :sub_dist_name, :wkt);
                        """,
                        {
                            "geo_id": geo_id,
                            "dist_name": item["name"] if layer["level"] == "district" else "KARNATAKA",
                            "sub_dist_name": item["name"] if layer["level"] == "subdistrict" else None,
                            "wkt": item["wkt"][:3990] # Safe truncate WKT to fit column size
                        }
                    )
                    
        except Exception as e:
            print(f"[GIS Ingest] Error reading Shapefile {layer['path']}: {e}", flush=True)
            
    return next_chunk_id

def ingest_kml_files(workspace_root: str, start_chunk_id: int) -> int:
    next_chunk_id = start_chunk_id
    
    kml_files = [
        "9181e6ed-6164-430b-8b10-238ad7b8ab45.kml",
        "b634537c-da65-43fa-a92c-4b16f9fc0dac.kml",
        "c367208f-88ba-4392-b787-aaa449be5683.kml",
        "c3d841b0-eeec-49e9-a9cf-4f10c84e329b.kml",
        "fe3f24fc-6c17-4080-afea-d44f3867c834.kml"
    ]
    
    for file_name in kml_files:
        kml_path = os.path.join(workspace_root, file_name)
        if not os.path.exists(kml_path):
            print(f"[GIS Ingest] KML file not found: {file_name}, skipping...", flush=True)
            continue
            
        print(f"[GIS Ingest] Processing KML: {file_name}", flush=True)
        
        # Check if already ingested
        res_check = db_client.execute("SELECT COUNT(*) FROM rag_document_embeddings WHERE document_name = :doc_name;", {"doc_name": file_name})
        if res_check.fetchone()[0] > 0:
            print(f"[GIS Ingest] KML {file_name} already ingested. Skipping...", flush=True)
            continue
            
        try:
            tree = ET.parse(kml_path)
            root = tree.getroot()
            
            # Simple KML parsing namespaces helper
            namespaces = {'kml': 'http://www.opengis.net/kml/2.2'}
            
            placemarks = root.findall('.//kml:Placemark', namespaces)
            if not placemarks:
                # Fallback to no-namespace search
                placemarks = root.findall('.//Placemark')
                
            kml_chunks = []
            for idx, pm in enumerate(placemarks):
                # Parse Placemark ExtendedData/SimpleData
                data_dict = {}
                for simple_data in pm.findall('.//SimpleData'):
                    name = simple_data.attrib.get('name', '')
                    val = simple_data.text or ''
                    data_dict[name] = val
                    
                # Extract coordinates
                coord_elem = pm.find('.//coordinates')
                if coord_elem is not None and coord_elem.text:
                    coords_str = coord_elem.text.strip().replace('\n', ' ').replace('\t', ' ')
                    coords = coords_str.split(' ')
                    # We handle the first point coordinate
                    try:
                        pt_coords = coords[0].split(',')
                        lon = float(pt_coords[0])
                        lat = float(pt_coords[1])
                    except Exception:
                        lon, lat = 77.5946, 12.9716
                else:
                    lon, lat = 77.5946, 12.9716
                    
                name = data_dict.get('POL_OPSTName', data_dict.get('POL_STName', data_dict.get('NAME', f"Placemark {idx+1}")))
                
                chunk_txt = f"KML Layer: {file_name}, Name: {name}, Coordinates: Longitude {lon:.6f}, Latitude {lat:.6f}"
                for k, v in data_dict.items():
                    if k not in ['POL_OPSTName', 'POL_STName', 'NAME'] and v:
                        chunk_txt += f", {k}: {v}"
                        
                kml_chunks.append({
                    "name": name,
                    "chunk_text": chunk_txt,
                    "lat": lat,
                    "lon": lon
                })
                
            print(f"  Found {len(kml_chunks)} features in KML.", flush=True)
            
            # Batch generate embeddings and insert
            batch_size = 50
            for i in range(0, len(kml_chunks), batch_size):
                batch = kml_chunks[i:i+batch_size]
                texts = [b["chunk_text"] for b in batch]
                embeddings = get_embeddings(texts)
                
                for item, emb in zip(batch, embeddings):
                    emb_json = json.dumps(emb)
                    metadata = {
                        "source_type": "kml",
                        "source_file": file_name,
                        "centroid_lat": item["lat"],
                        "centroid_lon": item["lon"],
                        "name": item["name"]
                    }
                    metadata_str = json.dumps(metadata)
                    
                    db_client.execute(
                        """
                        INSERT INTO rag_document_embeddings (chunk_id, document_name, page_number, text_content, metadata_json, embedding)
                        VALUES (:chunk_id, :doc_name, :page_num, :text_content, :metadata_json, :embedding);
                        """,
                        {
                            "chunk_id": next_chunk_id,
                            "doc_name": file_name,
                            "page_num": i + batch.index(item) + 1,
                            "text_content": item["chunk_text"],
                            "metadata_json": metadata_str,
                            "embedding": emb_json
                        }
                    )
                    next_chunk_id += 1
                    
        except Exception as e:
            print(f"[GIS Ingest] Error reading KML {file_name}: {e}", flush=True)
            
    return next_chunk_id

def ingest_geojson_files(workspace_root: str, start_chunk_id: int) -> int:
    next_chunk_id = start_chunk_id
    
    geojson_path = os.path.join(workspace_root, "india-geodata", "data", "police", "stations", "INDIA_POLICE_STATIONS.geojson")
    if not os.path.exists(geojson_path):
        print(f"[GIS Ingest] GeoJSON not found: {geojson_path}, skipping...", flush=True)
        return next_chunk_id
        
    file_name = "INDIA_POLICE_STATIONS.geojson"
    print(f"[GIS Ingest] Processing GeoJSON: {file_name}", flush=True)
    
    # Check if already ingested
    res_check = db_client.execute("SELECT COUNT(*) FROM rag_document_embeddings WHERE document_name = :doc_name;", {"doc_name": file_name})
    if res_check.fetchone()[0] > 0:
        print(f"[GIS Ingest] GeoJSON {file_name} already ingested. Skipping...", flush=True)
        return next_chunk_id
        
    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        features = data.get("features", [])
        print(f"  Total police stations in raw GeoJSON: {len(features)}", flush=True)
        
        geojson_chunks = []
        for feat in features:
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            
            # Filter for Karnataka stations only
            state = props.get("state", props.get("STATE", "")).upper()
            if "KARNATAKA" not in state:
                continue
                
            coords = geom.get("coordinates", [77.5946, 12.9716])
            lon = coords[0]
            lat = coords[1]
            
            name = props.get("name", props.get("police_sta", f"Police Station ({lon}, {lat})"))
            district = props.get("district", props.get("DISTRICT", "Unknown"))
            
            chunk_txt = f"GeoJSON Layer: INDIA_POLICE_STATIONS, Name: {name}, District: {district}, State: Karnataka, Longitude: {lon:.6f}, Latitude: {lat:.6f}"
            for k, v in props.items():
                if k not in ["name", "police_sta", "state", "STATE", "district", "DISTRICT"] and v:
                    chunk_txt += f", {k}: {v}"
                    
            geojson_chunks.append({
                "name": name,
                "district": district,
                "chunk_text": chunk_txt,
                "lat": lat,
                "lon": lon
            })
            
            # Limit GeoJSON police stations to 200 to stay within bounds
            if len(geojson_chunks) >= 200:
                break
                
        print(f"  Filtered down to {len(geojson_chunks)} Karnataka police stations.", flush=True)
        
        # Batch generate embeddings and insert
        batch_size = 50
        for i in range(0, len(geojson_chunks), batch_size):
            batch = geojson_chunks[i:i+batch_size]
            texts = [b["chunk_text"] for b in batch]
            embeddings = get_embeddings(texts)
            
            for item, emb in zip(batch, embeddings):
                emb_json = json.dumps(emb)
                metadata = {
                    "source_type": "geojson",
                    "source_file": file_name,
                    "centroid_lat": item["lat"],
                    "centroid_lon": item["lon"],
                    "name": item["name"],
                    "district": item["district"]
                }
                metadata_str = json.dumps(metadata)
                
                db_client.execute(
                    """
                    INSERT INTO rag_document_embeddings (chunk_id, document_name, page_number, text_content, metadata_json, embedding)
                    VALUES (:chunk_id, :doc_name, :page_num, :text_content, :metadata_json, :embedding);
                    """,
                    {
                        "chunk_id": next_chunk_id,
                        "doc_name": file_name,
                        "page_num": i + batch.index(item) + 1,
                        "text_content": item["chunk_text"],
                        "metadata_json": metadata_str,
                        "embedding": emb_json
                    }
                )
                next_chunk_id += 1
                
    except Exception as e:
        print(f"[GIS Ingest] Error reading GeoJSON {file_name}: {e}", flush=True)
        
    return next_chunk_id

if __name__ == "__main__":
    ingest_geospatial()
