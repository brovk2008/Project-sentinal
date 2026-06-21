import os
import json
import re
import math
import zipfile
import xml.etree.ElementTree as ET
import numpy as np
from typing import List, Dict, Any, Optional
import fitz # PyMuPDF
import urllib.request
from db import db_client
from services.ai_router import ai_router

# In-memory dictionary mapping case_id -> list of chunk dictionaries
_case_vector_caches: Dict[str, List[Dict[str, Any]]] = {}

# BM25 searcher cache mapping case_id -> BM25Searcher instance
_case_bm25_searchers: Dict[str, Any] = {}

class CaseBM25Searcher:
    def __init__(self, corpus: List[str]):
        self.k1 = 1.5
        self.b = 0.75
        self.corpus_size = len(corpus)
        self.doc_lens = [len(self._tokenize(doc)) for doc in corpus]
        self.avg_doc_len = sum(self.doc_lens) / self.corpus_size if self.corpus_size > 0 else 1.0
        
        self.doc_term_freqs = []
        self.doc_frequencies = {}
        
        for doc in corpus:
            tokens = self._tokenize(doc)
            freqs = {}
            for token in tokens:
                freqs[token] = freqs.get(token, 0) + 1
            self.doc_term_freqs.append(freqs)
            
            for token in freqs.keys():
                self.doc_frequencies[token] = self.doc_frequencies.get(token, 0) + 1
                
    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r'\w+', text.lower())
        
    def _idf(self, word: str) -> float:
        n = self.doc_frequencies.get(word, 0)
        return math.log((self.corpus_size - n + 0.5) / (n + 0.5) + 1.0)
        
    def get_score(self, doc_idx: int, query_tokens: List[str]) -> float:
        score = 0.0
        doc_len = self.doc_lens[doc_idx]
        freqs = self.doc_term_freqs[doc_idx]
        
        for token in query_tokens:
            if token in freqs:
                tf = freqs[token]
                idf = self._idf(token)
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / self.avg_doc_len))
                score += idf * (numerator / denominator)
        return score

def load_case_embeddings_cache(case_id: str, force_reload: bool = False):
    global _case_vector_caches, _case_bm25_searchers
    if case_id in _case_vector_caches and not force_reload:
        return
        
    print(f"[Case RAG] Initializing in-memory cache for case: {case_id}...", flush=True)
    try:
        sql = "SELECT chunk_id, document_name, page_number, text_content, metadata_json, embedding FROM v2_rag_embeddings WHERE case_id = :case_id;"
        result = db_client.execute(sql, {"case_id": case_id})
        rows = result.fetchall()
        
        cache = []
        corpus_texts = []
        for r in rows:
            chunk_id = r[0]
            document_name = r[1]
            page_number = r[2]
            text_content = r[3]
            metadata_json = r[4]
            embedding_str = r[5]
            
            if isinstance(embedding_str, str):
                try:
                    embedding = json.loads(embedding_str)
                except Exception:
                    continue
            else:
                embedding = embedding_str
                
            if isinstance(metadata_json, str):
                try:
                    metadata = json.loads(metadata_json)
                except Exception:
                    metadata = {}
            else:
                metadata = metadata_json or {}
                
            cache.append({
                "chunk_id": chunk_id,
                "document_name": document_name,
                "page_number": page_number,
                "text_content": text_content,
                "metadata_json": metadata,
                "embedding": np.array(embedding, dtype=np.float32)
            })
            corpus_texts.append(text_content)
            
        _case_vector_caches[case_id] = cache
        if corpus_texts:
            _case_bm25_searchers[case_id] = CaseBM25Searcher(corpus_texts)
        else:
            _case_bm25_searchers[case_id] = None
        print(f"[Case RAG] Loaded {len(cache)} chunks into memory for case {case_id}.", flush=True)
    except Exception as e:
        print(f"[Case RAG] Error loading embeddings from DB for case {case_id}: {e}", flush=True)
        _case_vector_caches[case_id] = []
        _case_bm25_searchers[case_id] = None

def search_case_rag(case_id: str, query_text: str, top_k: int = 3) -> List[Dict[str, Any]]:
    load_case_embeddings_cache(case_id)
    cache = _case_vector_caches.get(case_id, [])
    bm25 = _case_bm25_searchers.get(case_id)
    
    if not cache:
        print(f"[Case RAG] No indexed chunks for case {case_id}.", flush=True)
        return []
        
    query_vector = ai_router.embed(query_text)
    if not query_vector:
        return []
        
    query_arr = np.array(query_vector, dtype=np.float32)
    query_norm = np.linalg.norm(query_arr)
    
    # Calculate BM25 scores if searcher exists
    query_tokens = re.findall(r'\w+', query_text.lower())
    bm25_scores = []
    if bm25:
        bm25_scores = [bm25.get_score(idx, query_tokens) for idx in range(len(cache))]
        max_bm25 = max(bm25_scores) if bm25_scores else 0.0
    else:
        max_bm25 = 0.0
        
    results = []
    for idx, chunk in enumerate(cache):
        emb_arr = chunk["embedding"]
        emb_norm = np.linalg.norm(emb_arr)
        
        # 1. Cosine similarity
        if emb_norm == 0 or query_norm == 0:
            similarity = 0.0
        else:
            similarity = np.dot(query_arr, emb_arr) / (query_norm * emb_norm)
            
        # 2. BM25 score
        k_score = (bm25_scores[idx] / max_bm25) if max_bm25 > 0.0 else 0.0
        
        # 3. Hybrid combining (70/30 weight)
        combined_score = 0.7 * similarity + 0.3 * k_score
        
        results.append({
            "chunk_id": chunk["chunk_id"],
            "source_file": chunk["document_name"],
            "page_number": chunk["page_number"],
            "text_content": chunk["text_content"],
            "metadata": chunk["metadata_json"],
            "score": float(combined_score)
        })
        
    results.sort(key=lambda x: x["score"], reverse=True)
    
    # Deduplicate matching texts
    deduplicated = []
    seen = set()
    for r in results:
        text_norm = re.sub(r'\s+', ' ', r["text_content"].strip().lower())
        if text_norm in seen:
            continue
        seen.add(text_norm)
        deduplicated.append(r)
        
    return deduplicated[:top_k]

# Helper to insert Location entities automatically from geo files
def insert_location_entity_if_not_exists(case_id: str, name: str, address: str, lat_lon: str, properties: Optional[Dict[str, Any]] = None):
    import uuid
    import time
    if not name or not lat_lon:
        return
    loc_key = f"upload_location_{case_id}_{name.lower().strip()}_{lat_lon.strip()}"
    entity_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, loc_key))
    
    try:
        exist_sql = "SELECT id FROM entities WHERE id = :id;"
        exist_res = db_client.execute(exist_sql, {"id": entity_id})
        if exist_res.fetchone():
            return
    except Exception as e:
        print(f"[rag_processor] Error checking entity existence: {e}", flush=True)
        return
        
    try:
        case_sql = "SELECT ontology_version FROM cases WHERE id = :case_id;"
        case_res = db_client.execute(case_sql, {"case_id": case_id})
        case_row = case_res.fetchone()
        ontology_version = case_row[0] if case_row else "crime-analysis-v1"
    except Exception as e:
        print(f"[rag_processor] Error fetching case ontology: {e}", flush=True)
        ontology_version = "crime-analysis-v1"
    
    entity_properties = {
        "name": name,
        "address": address or "Extracted from file",
        "coordinates": lat_lon
    }
    
    if properties:
        from services.ontology import ONTOLOGIES
        allowed_props = ONTOLOGIES.get(ontology_version, {}).get("allowed_entities", {}).get("Location", [])
        for k, v in properties.items():
            if k in allowed_props and k not in entity_properties:
                entity_properties[k] = v
                
    from services.ontology import validate_entity
    if not validate_entity(ontology_version, "Location", entity_properties):
        print(f"[rag_processor] Location entity validation failed for {name}", flush=True)
        return
        
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    initial_history = [{
        "timestamp": now,
        "action": "create",
        "properties": entity_properties,
        "confidence": 1.0,
        "modified_by": "ingestion_pipeline"
    }]
    
    location_json = None
    try:
        coords = [float(c.strip()) for c in lat_lon.split(',')]
        if len(coords) >= 2:
            location_json = {"type": "Point", "coordinates": coords}
    except Exception:
        pass
        
    try:
        sql = """
        INSERT INTO entities (id, case_id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, version_history)
        VALUES (:id, :case_id, 'Location', :properties, 1.0, 'file_ingestion', 'system', :created_at, :updated_at, NULL, '[]', :location, :version_history);
        """
        db_client.execute(sql, {
            "id": entity_id,
            "case_id": case_id,
            "properties": json.dumps(entity_properties),
            "created_at": now,
            "updated_at": now,
            "location": json.dumps(location_json) if location_json else None,
            "version_history": json.dumps(initial_history)
        })
        print(f"[rag_processor] Ingested Location entity: {name} ({lat_lon})", flush=True)
    except Exception as e:
        print(f"[rag_processor] Failed to insert Location entity: {e}", flush=True)

# Document parsing utilities
def extract_text_from_file(file_path: str, file_ext: str, case_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Parses different file formats into layout/structure-aware text pieces.
    Returns: List of {"text": str, "page_number": int, "metadata": dict}
    """
    results = []
    if file_ext == ".pdf":
        doc = fitz.open(file_path)
        for page_idx, page in enumerate(doc):
            text = page.get_text()
            if text.strip():
                results.append({
                    "text": text,
                    "page_number": page_idx + 1,
                    "metadata": {"source_type": "pdf"}
                })
        doc.close()
        
    elif file_ext == ".docx":
        # Extract text from docx via raw XML parsing to avoid python-docx dependency conflicts
        try:
            with zipfile.ZipFile(file_path) as docx_zip:
                xml_content = docx_zip.read('word/document.xml')
                root = ET.fromstring(xml_content)
                namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                
                paragraphs = []
                for p in root.findall('.//w:p', namespaces):
                    p_text = "".join([node.text for node in p.findall('.//w:t', namespaces) if node.text])
                    if p_text.strip():
                        paragraphs.append(p_text)
                
                full_text = "\n\n".join(paragraphs)
                if full_text.strip():
                    results.append({
                        "text": full_text,
                        "page_number": 1,
                        "metadata": {"source_type": "docx"}
                    })
        except Exception as e:
            print(f"[rag_processor] docx parsing error: {e}")
            
    elif file_ext in [".txt", ".md"]:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
            if content.strip():
                results.append({
                    "text": content,
                    "page_number": 1,
                    "metadata": {"source_type": "text"}
                })
                
    elif file_ext == ".csv":
        import pandas as pd
        df = pd.read_csv(file_path)
        # Convert each row into a readable chunk representation
        for idx, row in df.iterrows():
            row_dict = row.to_dict()
            row_str = " | ".join([f"{k}: {v}" for k, v in row_dict.items()])
            results.append({
                "text": f"Row {idx+1}: {row_str}",
                "page_number": 1,
                "metadata": {"source_type": "csv", "row_number": idx + 1}
            })
            
    elif file_ext in [".json", ".geojson"]:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            try:
                data = json.load(f)
                # Check if GeoJSON FeatureCollection
                if isinstance(data, dict) and data.get("type") == "FeatureCollection" and "features" in data:
                    for idx, feature in enumerate(data.get("features", [])):
                        properties = feature.get("properties", {})
                        geometry = feature.get("geometry", {})
                        geom_type = geometry.get("type", "Unknown")
                        coords = geometry.get("coordinates", [])
                        
                        prop_str = ", ".join([f"{k}: {v}" for k, v in properties.items()])
                        text = f"GeoJSON Feature {idx+1} | Geometry: {geom_type} | Coordinates: {coords} | Properties: {{{prop_str}}}"
                        results.append({
                            "text": text,
                            "page_number": 1,
                            "metadata": {"source_type": "geojson", "feature_index": idx}
                        })
                        
                        lat_lon = None
                        if geom_type == "Point" and len(coords) >= 2:
                            lat_lon = f"{coords[1]},{coords[0]}"
                        elif geom_type in ["Polygon", "MultiPolygon", "LineString"] and coords:
                            def get_first_pt(c, t):
                                if t == "LineString":
                                    return c[0]
                                elif t == "Polygon":
                                    return c[0][0]
                                elif t == "MultiPolygon":
                                    return c[0][0][0]
                                return None
                            pt = get_first_pt(coords, geom_type)
                            if pt and len(pt) >= 2:
                                lat_lon = f"{pt[1]},{pt[0]}"
                                
                        name = properties.get("name") or properties.get("title") or properties.get("label") or f"GeoJSON Feature {idx+1}"
                        address = properties.get("address") or properties.get("place") or prop_str
                        if lat_lon and case_id:
                            insert_location_entity_if_not_exists(case_id, name, address, lat_lon, properties)
                else:
                    pretty_text = json.dumps(data, indent=2)
                    results.append({
                        "text": pretty_text,
                        "page_number": 1,
                        "metadata": {"source_type": "json"}
                    })
            except Exception as e:
                print(f"[rag_processor] JSON parsing error: {e}")
                
    elif file_ext == ".xml":
        try:
            tree = ET.parse(file_path)
            root = tree.getroot()
            
            def get_xml_text(element, depth=0):
                text_parts = []
                indent = "  " * depth
                tag = element.tag.split("}")[-1]
                attrs = ", ".join([f"{k}={v}" for k, v in element.attrib.items()])
                attr_str = f" ({attrs})" if attrs else ""
                
                elem_text = element.text.strip() if element.text else ""
                if elem_text:
                    text_parts.append(f"{indent}{tag}{attr_str}: {elem_text}")
                else:
                    text_parts.append(f"{indent}{tag}{attr_str}")
                    
                for child in element:
                    text_parts.append(get_xml_text(child, depth + 1))
                return "\n".join([p for p in text_parts if p.strip()])
                
            xml_structured = get_xml_text(root)
            if xml_structured.strip():
                results.append({
                    "text": xml_structured,
                    "page_number": 1,
                    "metadata": {"source_type": "xml"}
                })
        except Exception as e:
            print(f"[rag_processor] XML parsing error: {e}")
            
    elif file_ext == ".kml":
        try:
            tree = ET.parse(file_path)
            root = tree.getroot()
            ns = ""
            if root.tag.startswith("{"):
                ns = root.tag.split("}")[0] + "}"
                
            placemarks = root.findall(f".//{ns}Placemark")
            for idx, pm in enumerate(placemarks):
                name_elem = pm.find(f"{ns}name")
                desc_elem = pm.find(f"{ns}description")
                name = name_elem.text if name_elem is not None else f"Placemark {idx+1}"
                desc = desc_elem.text if desc_elem is not None else ""
                
                coords_text = ""
                coords_elem = pm.find(f".//{ns}coordinates")
                if coords_elem is not None and coords_elem.text:
                    coords_text = coords_elem.text.strip()
                    
                text = f"KML Placemark {idx+1} | Name: {name} | Description: {desc} | Coordinates: {coords_text}"
                results.append({
                    "text": text,
                    "page_number": 1,
                    "metadata": {"source_type": "kml", "placemark_index": idx}
                })
                
                if coords_text and case_id:
                    pts = coords_text.split()
                    if pts:
                        first_pt = pts[0].split(',')
                        if len(first_pt) >= 2:
                            lon, lat = first_pt[0], first_pt[1]
                            lat_lon = f"{lat.strip()},{lon.strip()}"
                            insert_location_entity_if_not_exists(case_id, name, desc, lat_lon)
        except Exception as e:
            print(f"[rag_processor] KML parsing error: {e}")
            
    elif file_ext in [".shp", ".dbf", ".shx", ".zip"]:
        import tempfile
        import shutil
        
        temp_dir = tempfile.mkdtemp()
        try:
            if file_ext == ".zip":
                shutil.unpack_archive(file_path, temp_dir, "zip")
            else:
                shutil.copy(file_path, temp_dir)
                base_name = os.path.splitext(os.path.basename(file_path))[0]
                dir_name = os.path.dirname(file_path)
                for ext in [".dbf", ".shx", ".prj"]:
                    sibling = os.path.join(dir_name, base_name + ext)
                    if os.path.exists(sibling):
                        shutil.copy(sibling, temp_dir)
            
            shp_files = []
            for root_dir, _, files in os.walk(temp_dir):
                for f in files:
                    if f.lower().endswith(".shp"):
                        shp_files.append(os.path.join(root_dir, f))
            
            import shapefile
            for shp_idx, shp_f in enumerate(shp_files):
                try:
                    with shapefile.Reader(shp_f) as sf:
                        fields = [f[0] for f in sf.fields[1:]]
                        
                        for idx, sr in enumerate(sf.shapeRecords()):
                            geom = sr.shape
                            rec = sr.record
                            rec_dict = dict(zip(fields, rec))
                            
                            prop_str = ", ".join([f"{k}: {v}" for k, v in rec_dict.items()])
                            geom_type = geom.shapeTypeName
                            points = geom.points
                            
                            text = f"Shapefile Feature {idx+1} | Type: {geom_type} | Properties: {{{prop_str}}} | Points: {points[:5]}"
                            results.append({
                                "text": text,
                                "page_number": 1,
                                "metadata": {"source_type": "shapefile", "shapefile_index": shp_idx, "record_index": idx}
                            })
                            
                            if points and case_id:
                                first_pt = points[0]
                                lat_lon = f"{first_pt[1]},{first_pt[0]}"
                                name = rec_dict.get("name") or rec_dict.get("NAME") or rec_dict.get("title") or f"Shapefile Feature {idx+1}"
                                address = rec_dict.get("address") or rec_dict.get("ADDRESS") or prop_str
                                insert_location_entity_if_not_exists(case_id, name, address, lat_lon, rec_dict)
                except Exception as e:
                    print(f"[rag_processor] Error reading shapefile {shp_f}: {e}")
        except Exception as e:
            print(f"[rag_processor] Shapefile parsing error: {e}")
        finally:
            shutil.rmtree(temp_dir)
            
    elif file_ext in [".png", ".jpg", ".jpeg", ".jfif"]:
        # OCR via Gemini API vision
        try:
            import base64
            with open(file_path, "rb") as image_file:
                image_data = base64.b64encode(image_file.read()).decode('utf-8')
                
            mime_type = "image/png" if file_ext == ".png" else "image/jpeg"
            
            payload = {
                "contents": [{
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": image_data
                            }
                        },
                        {
                            "text": "Perform high-accuracy OCR on this image. Extract all text exactly as written. Output only the raw extracted text, no formatting/commentary."
                        }
                    ]
                }]
            }
            
            gemini_key = os.getenv("GEMINI_API_KEY")
            if gemini_key:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
                data_bytes = json.dumps(payload).encode('utf-8')
                req = urllib.request.Request(
                    url,
                    data=data_bytes,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=15.0) as response:
                    res_data = json.loads(response.read().decode('utf-8'))
                    candidates = res_data.get("candidates", [])
                    if candidates:
                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                        if text:
                            results.append({
                                "text": text,
                                "page_number": 1,
                                "metadata": {"source_type": "image"}
                            })
            else:
                print("[rag_processor] GEMINI_API_KEY missing for image OCR.")
        except Exception as e:
            print(f"[rag_processor] Image OCR error: {e}")
            
    elif file_ext in [".mp3", ".wav", ".m4a", ".mp4", ".mov", ".avi", ".webm"]:
        # OCR / Media transcription via Gemini API
        try:
            import base64
            with open(file_path, "rb") as media_file:
                media_data = base64.b64encode(media_file.read()).decode('utf-8')
                
            if file_ext == ".mp3": mime_type = "audio/mp3"
            elif file_ext == ".wav": mime_type = "audio/wav"
            elif file_ext == ".m4a": mime_type = "audio/m4a"
            elif file_ext == ".mp4": mime_type = "video/mp4"
            elif file_ext == ".mov": mime_type = "video/quicktime"
            elif file_ext == ".avi": mime_type = "video/x-msvideo"
            elif file_ext == ".webm": mime_type = "video/webm"
            else: mime_type = "audio/mp3"
            
            prompt = "Transcribe the following media file. Extract all spoken words exactly as spoken. Output only the raw transcription text, no commentary."
            
            payload = {
                "contents": [{
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": media_data
                            }
                        },
                        {
                            "text": prompt
                        }
                    ]
                }]
            }
            
            gemini_key = os.getenv("GEMINI_API_KEY")
            if gemini_key:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
                data_bytes = json.dumps(payload).encode('utf-8')
                req = urllib.request.Request(
                    url,
                    data=data_bytes,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=30.0) as response:
                    res_data = json.loads(response.read().decode('utf-8'))
                    candidates = res_data.get("candidates", [])
                    if candidates:
                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                        if text:
                            results.append({
                                "text": text,
                                "page_number": 1,
                                "metadata": {
                                    "source_type": "audio" if "audio" in mime_type else "video",
                                    "timestamp_range": "0:00 - End"
                                }
                            })
            else:
                print("[rag_processor] GEMINI_API_KEY missing for media transcription.")
        except Exception as e:
            print(f"[rag_processor] Media transcription error: {e}")
            
    return results

def process_and_index_file(case_id: str, file_path: str, doc_name: str, progress_callback: Optional[Any] = None) -> bool:
    """
    Given an uploaded file, extracts text, chunks it, embeds it,
    saves chunks to v2_rag_embeddings, and updates the local NumPy cache.
    """
    file_ext = os.path.splitext(doc_name)[1].lower()
    
    if progress_callback:
        progress_callback(30.0, "Extracting text content from file...")
        
    if file_ext in [".png", ".jpg", ".jpeg", ".jfif", ".mp3", ".wav", ".m4a", ".mp4", ".mov", ".avi", ".webm"]:
        if progress_callback:
            progress_callback(50.0, "Running AI processing (OCR/transcription)...")
            
    pages_data = extract_text_from_file(file_path, file_ext, case_id=case_id)
    if not pages_data:
        print(f"[Case RAG] No text extracted from {doc_name}.")
        return False
        
    if progress_callback:
        progress_callback(70.0, "Generating vector embeddings for semantic chunks...")
        
    chunks_to_write = []
    
    # We will generate semantic chunks of ~500 tokens
    for item in pages_data:
        text = item["text"]
        page = item["page_number"]
        meta = item["metadata"]
        
        words = text.split()
        chunk_size = 300  # Words (~400-500 tokens)
        overlap = 50
        
        start = 0
        chunk_idx = 0
        while start < len(words):
            end = start + chunk_size
            chunk_words = words[start:end]
            chunk_text = " ".join(chunk_words)
            
            # Generate embedding
            emb = ai_router.embed(chunk_text)
            if emb:
                chunk_id = f"{case_id}_{doc_name.replace(' ', '_')}_p{page}_c{chunk_idx}"
                meta_w_chunk = meta.copy()
                meta_w_chunk["chunk_index"] = chunk_idx
                
                chunks_to_write.append({
                    "chunk_id": chunk_id,
                    "case_id": case_id,
                    "document_name": doc_name,
                    "page_number": page,
                    "text_content": chunk_text,
                    "metadata_json": json.dumps(meta_w_chunk),
                    "embedding": json.dumps(emb)
                })
                chunk_idx += 1
            start += (chunk_size - overlap)

    if not chunks_to_write:
        return False
        
    # Write to database (ZCQL / SQLite)
    try:
        for chunk in chunks_to_write:
            sql = """
            INSERT OR REPLACE INTO v2_rag_embeddings 
            (chunk_id, case_id, document_name, page_number, text_content, metadata_json, embedding)
            VALUES (:chunk_id, :case_id, :document_name, :page_number, :text_content, :metadata_json, :embedding);
            """
            db_client.execute(sql, chunk)
            
        # Trigger cache reload for case
        load_case_embeddings_cache(case_id, force_reload=True)
        return True
    except Exception as e:
        print(f"[Case RAG] Failed to index chunks to database: {e}")
        return False
