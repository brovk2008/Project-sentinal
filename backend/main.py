import sys
import os
import json
import traceback

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Add the current directory and lib folder to python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

# Global capture for import errors
import_error = None
app = None

try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from routes import heatmap, trends, districts, network, ai, rag, spatial, cases, graph, memory_api, agents_api, migration
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
                "env_keys": list(os.environ.keys())
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

# API Key Verification Middleware
SENTINEL_API_KEY = os.getenv("SENTINEL_API_KEY", "")

@app.middleware("http")
async def api_key_auth_middleware(request: Request, call_next):
    path = request.url.path
    if (
        path == "/"
        or path == "/health"
        or path.startswith("/docs")
        or path.startswith("/openapi.json")
        or path.startswith("/redoc")
        or not SENTINEL_API_KEY
    ):
        return await call_next(request)
    
    # Secure all v2 routes and any diagnostic endpoints
    if path.startswith("/api/v2") or "diagnostic" in path:
        api_key_header = request.headers.get("x-api-key")
        auth_header = request.headers.get("authorization")
        
        auth_token = ""
        if auth_header and auth_header.lower().startswith("bearer "):
            auth_token = auth_header[7:].strip()
            
        if api_key_header == SENTINEL_API_KEY or auth_token == SENTINEL_API_KEY:
            return await call_next(request)
            
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized: Invalid or missing API key."}
        )
        
    return await call_next(request)

# Secure Web Headers Middleware
@app.middleware("http")
async def secure_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none';"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# Register normal endpoints
app.include_router(heatmap.router, prefix="/api/v1/heatmap")
app.include_router(trends.router, prefix="/api/v1/trends")
app.include_router(districts.router, prefix="/api/v1/districts")
app.include_router(network.router, prefix="/api/v1/network")
app.include_router(ai.router, prefix="/api/v1/ai")
app.include_router(rag.router, prefix="/api/v1/intelligence")
app.include_router(spatial.router, prefix="/api/v1/spatial")

# Register V2 endpoints
app.include_router(cases.router, prefix="/api/v2/cases")
app.include_router(graph.router, prefix="/api/v2/cases/{case_id}/graph")
app.include_router(memory_api.router, prefix="/api/v2/cases/{case_id}/memory")
app.include_router(agents_api.router, prefix="/api/v2/cases/{case_id}/agents")
app.include_router(migration.router, prefix="/api/v2/migration")

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
        from services.ai_router import ai_router
    except ImportError:
        try:
            from backend.db import db_client
            from backend.services.vector_search import is_vector_search_ready
            from backend.services.ai_router import ai_router
        except ImportError:
            return {
                "status": "unhealthy",
                "catalyst_datastore": "offline",
                "catalyst_filestore": "offline",
                "groq_api": "offline",
                "vector_search": "not_ready",
                "groq": "offline",
                "gemini": "offline",
                "hf": "offline",
                "nasa": "offline",
                "google_maps": "offline",
                "mapillary": "offline",
                "indian_kanoon": "offline",
                "firecrawl": "offline",
                "tavily": "offline"
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
        
    providers = ["groq", "gemini", "hf", "nasa", "google_maps", "mapillary", "indian_kanoon", "firecrawl", "tavily"]
    provider_status = {}
    for p in providers:
        try:
            is_healthy = ai_router.verify_health(p)
            provider_status[p] = "available" if is_healthy else "offline"
        except Exception as e:
            print(f"[Health Check Root] Provider {p} check failed: {e}")
            provider_status[p] = "offline"

    vector_search_status = "ready" if is_vector_search_ready() else "not_ready"
    status = "healthy" if (datastore_status == "online" and vector_search_status == "ready") else "unhealthy"
    
    return {
        "status": status,
        "catalyst_datastore": datastore_status,
        "catalyst_filestore": filestore_status,
        "groq_api": provider_status.get("groq", "offline"),
        "vector_search": vector_search_status,
        "groq": provider_status.get("groq", "offline"),
        "gemini": provider_status.get("gemini", "offline"),
        "hf": provider_status.get("hf", "offline"),
        "nasa": provider_status.get("nasa", "offline"),
        "google_maps": provider_status.get("google_maps", "offline"),
        "mapillary": provider_status.get("mapillary", "offline"),
        "indian_kanoon": provider_status.get("indian_kanoon", "offline"),
        "firecrawl": provider_status.get("firecrawl", "offline"),
        "tavily": provider_status.get("tavily", "offline")
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
        "env_keys": list(os.environ.keys()),
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
is_cloud = os.getenv("X_ZC_INSTANCE_ID") is not None
allowed_origins = []

if is_prod and is_cloud:
    # In cloud production container, Zoho Catalyst API Gateway handles CORS injection automatically.
    # Leaving allowed_origins empty prevents duplicate headers which browsers block.
    allowed_origins = []
elif is_prod:
    # Local production testing mode
    allowed_origins = [
        "http://localhost:5173",
        "http://localhost:8000",
    ]
    frontend_url = os.getenv("FRONTEND_URL")
    if frontend_url:
        allowed_origins.append(frontend_url)
else:
    # Local development mode
    allowed_origins = [
        "http://localhost:5173",
        "http://localhost:8000",
    ]
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
