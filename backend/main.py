import sys
import os
import json
import traceback

# Add the current directory and lib folder to python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

# Global capture for import errors
import_error = None
app = None

try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from routes import heatmap, trends, districts, network, ai, rag, spatial
except Exception as e:
    import_error = traceback.format_exc()

if import_error:
    print("[DIAGNOSTIC] Crash detected on startup! Initializing fallback http.server...")
    print(import_error)
    
    # Fallback standard library server to bind to port and display traceback
    import http.server
    import socketserver
    
    class DiagnosticHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = {
                "status": "diagnostic_mode",
                "error": import_error,
                "sys_path": sys.path,
                "env": dict(os.environ)
            }
            self.wfile.write(json.dumps(response, indent=2).encode('utf-8'))
            
        def do_POST(self):
            self.do_GET()

    # AppSail listen port
    port = int(os.getenv("X_ZOHO_CATALYST_LISTEN_PORT", os.getenv("PORT", "9000")))
    print(f"[DIAGNOSTIC] Running diagnostic http.server on 0.0.0.0:{port}...", flush=True)
    
    class ThreadingHTTPServer(http.server.HTTPServer):
        pass

    server = ThreadingHTTPServer(("0.0.0.0", port), DiagnosticHandler)
    server.serve_forever()
    sys.exit(0)

# If imports succeeded, build normal app
app = FastAPI(
    title="Project Sentinel API",
    description="Backend analysis dashboard API for crime data, fraud flows, and communication records.",
    version="2.0"
)

@app.middleware("http")
async def catalyst_headers_middleware(request: Request, call_next):
    try:
        from zcatalyst_sdk._thread_util import ZCThreadUtil
        thread_obj = ZCThreadUtil()
        thread_obj.put_value("catalyst_headers", dict(request.headers))
    except Exception as e:
        print(f"[Middleware] Failed to set catalyst headers: {e}")
    response = await call_next(request)
    return response

# Register normal endpoints
app.include_router(heatmap.router, prefix="/api/v1/heatmap")
app.include_router(trends.router, prefix="/api/v1/trends")
app.include_router(districts.router, prefix="/api/v1/districts")
app.include_router(network.router, prefix="/api/v1/network")
app.include_router(ai.router, prefix="/api/v1/ai")
app.include_router(rag.router, prefix="/api/v1/intelligence")
app.include_router(spatial.router, prefix="/api/v1/spatial")

# Root
@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "Project Sentinel API",
        "version": "2.0"
    }

# Health check
@app.get("/health")
def health_check():
    import os
    try:
        from db import db_client
        from services.vector_search import is_vector_search_ready
        from services.llm import LLMService
    except ImportError:
        try:
            from backend.db import db_client
            from backend.services.vector_search import is_vector_search_ready
            from backend.services.llm import LLMService
        except ImportError:
            return {
                "status": "unhealthy",
                "catalyst_datastore": "offline",
                "catalyst_filestore": "offline",
                "groq_api": "offline",
                "vector_search": "not_ready"
            }

    datastore_status = "offline"
    try:
        db_client.execute("SELECT 1;")
        datastore_status = "online"
    except Exception as e:
        print(f"[Health Check Root] Datastore offline: {e}")
        
    filestore_status = "offline"
    try:
        if db_client.is_production:
            if db_client._app:
                db_client._app.filestore().get_all_folders()
                filestore_status = "online"
        else:
            if os.path.exists(db_client.sqlite_path):
                filestore_status = "online"
    except Exception as e:
        print(f"[Health Check Root] Filestore offline: {e}")
        
    groq_status = "available" if LLMService.is_available() else "offline"
    vector_search_status = "ready" if is_vector_search_ready() else "not_ready"
    status = "healthy" if (datastore_status == "online" and vector_search_status == "ready") else "unhealthy"
    
    return {
        "status": status,
        "catalyst_datastore": datastore_status,
        "catalyst_filestore": filestore_status,
        "groq_api": groq_status,
        "vector_search": vector_search_status
    }

@app.get("/api/v1/diagnostic/db")
def diagnostic_db_check(request: Request):
    try:
        from db import db_client
    except ImportError:
        try:
            from backend.db import db_client
        except ImportError:
            return {"error": "Could not import db_client"}

    tables = [
        "rag_document_embeddings",
        "dim_crime_classification",
        "dim_police_units",
        "district_centroids",
        "dim_geography",
        "dim_demographics",
        "fact_fir_events",
        "mv_district_profile",
        "mv_monthly_trends",
        "mv_station_profile",
        "dim_financial_accounts",
        "fact_financial_transactions",
        "fact_call_detail_records",
        "mv_network_stats",
        "mv_fraud_graph_edges",
        "mv_anomaly_financial"
    ]

    counts = {}
    for table in tables:
        try:
            res = db_client.execute(f"SELECT COUNT(*) FROM {table};")
            row = res.fetchone()
            counts[table] = int(row[0]) if row else 0
        except Exception as e:
            counts[table] = f"error: {str(e)}"

    try:
        from services.vector_search import _cached_embeddings
    except ImportError:
        try:
            from backend.services.vector_search import _cached_embeddings
        except ImportError:
            _cached_embeddings = []

    st_status = "unknown"
    st_error = None
    try:
        try:
            from rag.embeddings import _st_available
        except ImportError:
            from backend.rag.embeddings import _st_available
        st_status = "available" if _st_available else "disabled"
    except Exception as e:
        import traceback
        st_status = "error"
        st_error = traceback.format_exc()

    import os
    return {
        "status": "success",
        "backend": "Catalyst ZCQL" if db_client.is_production else "SQLite Fallback",
        "init_error": getattr(db_client, "init_error", None),
        "sentence_transformers_status": st_status,
        "sentence_transformers_error": st_error,
        "headers": dict(request.headers),
        "env": dict(os.environ),
        "cached_embeddings_count": len(_cached_embeddings),
        "counts": counts
    }

@app.get("/api/v1/diagnostic/embeddings")
def diagnostic_embeddings_check(q: str = "acid attack"):
    try:
        from rag.embeddings import get_embedding
    except ImportError:
        try:
            from backend.rag.embeddings import get_embedding
        except ImportError:
            return {"error": "Could not import get_embedding"}
            
    try:
        emb = get_embedding(q)
        return {
            "status": "success",
            "query": q,
            "dimensions": len(emb),
            "sample": emb[:5]
        }
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }

# Enable CORS for React frontend and local development
# In production Catalyst AppSail, the Catalyst API Gateway automatically injects the CORS headers 
# for the hosted client domains. Including them here results in duplicate headers which browsers block.
is_prod = os.getenv("ENV") == "production"
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:8000",
]
if not is_prod:
    frontend_url = os.getenv("FRONTEND_URL")
    if frontend_url:
        allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    print("Startup: Project Sentinel API is live.")

if __name__ == "__main__":
    import uvicorn
    # Catalyst AppSail provides port via X_ZOHO_CATALYST_LISTEN_PORT
    port = int(os.getenv("X_ZOHO_CATALYST_LISTEN_PORT", os.getenv("PORT", "9000")))
    uvicorn.run(app, host="0.0.0.0", port=port)
