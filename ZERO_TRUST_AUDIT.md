# Project Sentinel — Zero Trust Security Audit Report

This report records the findings of a security audit performed against the Project Sentinel repository codebase. The audit checks for alignment with Zero Trust architecture principles (Never Trust, Always Verify, Minimise Blast Radius, Assume Breach).

---

## 1. Vulnerability Findings

### Finding 1: Critical System Secrets Leaked in Public Diagnostic API
* **Vulnerability:** Sensitive Environment Variable Dump
* **Severity:** **CRITICAL**
* **Location:** [backend/main.py:L246](file:///c:/Users/techp/Downloads/more%20projects/Project%20Sentinel/backend/main.py#L246) inside `/api/v1/diagnostic/db`
* **Description:** The diagnostic endpoint returns `dict(os.environ)` directly to clients. This dumps all environment variables into the JSON response payload, including Zoho Catalyst DB connection variables, `GROQ_API_KEY`, `HF_TOKEN`, and other private server configurations.
* **Remediation:** Remove `dict(os.environ)` entirely. Instead, expose only a list of active environment variable **keys** (e.g. `list(os.environ.keys())`) to allow troubleshooting without exposing sensitive values.

### Finding 2: Lack of Authenticated API Gateway Controls
* **Vulnerability:** Unauthenticated Access to Administrative and Data Endpoints
* **Severity:** **HIGH**
* **Location:** [backend/main.py:L75-88](file:///c:/Users/techp/Downloads/more%20projects/Project%20Sentinel/backend/main.py#L75-L88)
* **Description:** All case endpoints, graph entities, spatiotemporal mappings, and system migration commands are exposed as public HTTP routes with no token validation or API key requirements.
* **Remediation:** Introduce an optional `SENTINEL_API_KEY` environment check. If configured, API requests to all `/api/v2/*` and `/api/v1/diagnostic/*` routes must present a valid `X-API-Key` or `Authorization: Bearer <key>` header, else they are blocked with a `401 Unauthorized` response.

### Finding 3: Permissive CORS Middleware Scope in Production
* **Vulnerability:** Broad CORS Configuration
* **Severity:** **MEDIUM**
* **Location:** [backend/main.py:L280-296](file:///c:/Users/techp/Downloads/more%20projects/Project%20Sentinel/backend/main.py#L280-L296)
* **Description:** CORS allowed origins fall back to localhost in production mode even if external domains are serving the API, which increases the CSRF/cross-origin attack surface.
* **Remediation:** Lock down CORS allowed origins strictly to the configured `FRONTEND_URL` when `ENV=production`, disabling local sandbox overrides.

### Finding 4: Absence of Standard HTTP Security Headers
* **Vulnerability:** Missing Defense-in-Depth Headers
* **Severity:** **LOW**
* **Location:** [backend/main.py](file:///c:/Users/techp/Downloads/more%20projects/Project%20Sentinel/backend/main.py)
* **Description:** The FastAPI backend does not issue protection headers like `X-Frame-Options`, `Content-Security-Policy` (CSP), or `X-Content-Type-Options`, exposing clients to clickjacking or mime-sniffing exploits.
* **Remediation:** Inject a standard security header middleware to append CSP, frame constraints, and browser protections to all outgoing API responses.

---

## 2. Security Decision Matrix

To enable easy local development and CI testing, the authentication gateway will support **graceful defaults**:
* **Developer/Test Sandbox (Local):** If `SENTINEL_API_KEY` is not defined or is empty, endpoints run in public/unauthenticated mode.
* **Staging/Production:** When `SENTINEL_API_KEY` is set in the environment variables (via local `.env` or Zoho Catalyst Console config), authentication is strictly enforced.
