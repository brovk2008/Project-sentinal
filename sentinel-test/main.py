import sys
print(f"Python {sys.version}", flush=True)
print("Starting sentinel-test...", flush=True)

from fastapi import FastAPI
import os
import uvicorn

print("FastAPI imported OK", flush=True)

app = FastAPI()

import platform

@app.get("/")
def root():
    return {
        "status": "ok",
        "machine": platform.machine(),
        "processor": platform.processor(),
        "system": platform.system(),
        "version": sys.version
    }

@app.get("/health")
def health():
    return {"status": "healthy"}

from fastapi import Request
@app.get("/headers")
def get_headers(request: Request):
    headers_dict = dict(request.headers)
    print("INCOMING HEADERS:", headers_dict, flush=True)
    return headers_dict

if __name__ == "__main__":
    port = int(os.getenv("X_ZOHO_CATALYST_LISTEN_PORT", os.getenv("PORT", "9000")))
    print(f"Binding on 0.0.0.0:{port}", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=port)
