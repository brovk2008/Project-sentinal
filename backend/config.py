import os
DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/sentinel_db")
APP_HOST = "0.0.0.0"
APP_PORT = int(os.getenv("X_ZOHO_CATALYST_LISTEN_PORT", os.getenv("PORT", "9000")))
