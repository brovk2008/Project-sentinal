# 07 — API Integrations

**Depends on:** `00_Vision.md` non-negotiable #3 (no hardcoded secrets), `03_Agent_System.md` §4 (AI Router)

---

## 1. Secrets Handling Policy (binding for every provider below)

> **No API key, token, or credential value appears in any Sentinel_V2 document, in any commit, or in any chat/prompt to an AI tool — ever, including this one.**

- All credentials are referenced exclusively by environment variable name (e.g. `GROQ_API_KEY`), never by value, in code, docs, or AI prompts.
- Real values live only in `.env` files (gitignored) locally, and in Catalyst's environment/secrets configuration in deployed environments.
- If a key is ever pasted into a chat, doc, repo, or ticket — even temporarily, even "old"/inactive — treat it as compromised: rotate it immediately at the provider console and update the environment configuration. Do not just delete the text; the key itself must be regenerated.
- `10_Deployment.md` §3 covers the operational side of this (where secrets are actually stored per environment).

## 2. Provider Interface (Plugin Architecture)

Every external data/AI source implements a common interface so the Planner/Router can call any provider generically and new providers can be added without touching orchestration code:

```python
class IntelligenceProvider(ABC):
    @abstractmethod
    def search(self, query: str, **kwargs) -> ProviderResult: ...

    @abstractmethod
    def health(self) -> HealthStatus: ...

    @abstractmethod
    def capabilities(self) -> list[Capability]: ...

    @abstractmethod
    def authenticate(self) -> bool: ...
```

- `health()` is polled periodically and surfaced on the Admin screen (`02_UI_UX.md` §3) — this is what makes the circuit breaker in `03_Agent_System.md` §4.1 possible.
- `capabilities()` lets the Planner Agent know what a provider can do without hardcoding a provider name into planning logic.
- Adding a new provider = implementing this interface + registering it in a provider registry config. No core code changes required.

## 3. Providers — Current (v1, already integrated)

| Provider | Env var | Used for | Rate limit posture | Fallback |
|---|---|---|---|---|
| Groq | `GROQ_API_KEY` | Completions (Llama 3.3 70B) | Free tier — implement backoff per `03_Agent_System.md` §4.1 | None currently (single AI provider in v1); v2 adds fallback once a second provider is integrated |
| HF Inference Router | `HF_TOKEN` | Embeddings (`all-MiniLM-L6-v2`) | Free tier, read-only token | Cache aggressively (Catalyst Cache) — identical text should never be re-embedded |

## 4. Providers — Planned Additions (v2)

Each row below is a **plugin to be built**, not yet integrated. Purpose, owning agent, and rate-limit posture are specified so implementation can start without re-deriving requirements; actual key provisioning happens separately by whoever owns each provider account, and only the env var name is wired into code.

| Provider | Env var | Purpose | Owning agent | Rate limit posture | Fallback strategy |
|---|---|---|---|---|---|
| NASA (FIRMS, GIBS, POWER) | `NASA_API_KEY` | Fire detection, satellite imagery, weather — **current imagery only, not used for geological data** per explicit product decision | Geospatial Agent | NASA's free tier has generous but real limits; cache imagery responses by location+date | Show "satellite data unavailable" state in UI rather than blocking the map |
| Mapillary | `MAPILLARY_ACCESS_TOKEN` | Street-level imagery | Geospatial Agent | Free tier rate-limited | Degrade to map markers without street view |
| Google Maps | `GOOGLE_MAPS_API_KEY` | Base map, geocoding, coordinates | Geospatial Agent | Paid-per-use beyond free quota — monitor usage closely, this is the one provider where a leaked key has direct cost impact | Fall back to Leaflet/OSM tiles (v1's existing map provider) if Google Maps quota is exhausted |
| Indian Kanoon | `INDIAN_KANOON_API_KEY` | Case law, statute lookup | Legal Agent | Confirm actual rate limits with provider before Phase 1 build — not publicly documented at spec time | Cache common statute lookups (IPC/BNS sections) since these don't change |
| Firecrawl | `FIRECRAWL_API_KEY` | Web scraping for OSINT | OSINT Agent | Free tier — confirm limits at implementation | Tavily as alternate within same task |
| Tavily | `TAVILY_API_KEY` | Live web search | OSINT Agent | Free tier | Firecrawl as alternate |
| OpenCity | `OPENCITY_API_KEY` (if required — confirm, some OpenCity datasets are open without auth) | Government open datasets | OSINT / Population Agent | Varies by dataset | N/A — static/cached datasets where possible |
| Worldometers | N/A if scraped, or provider-specific key if using a paid data API | Live population estimates | Population module | Confirm licensing — Worldometers does not have an official public API; using it requires either a licensed data provider or careful scraping-policy review before building | **Do not implement until this is resolved** — flagged as an open question, not a green light |

### 4.1 Explicitly Flagged Open Questions

These need a decision before the corresponding Phase 1/2 work starts — listed here rather than silently assumed:

1. **Vision/OCR provider** — no vision-capable provider exists in v1 or in the table above yet. Required for image OCR (`06_Data_Ingestion.md` §2.2) and any future face-related work (explicitly deferred per `00_Vision.md` §6). Needs a provider decision (e.g. a vision-capable model via an existing or new provider) before Phase 1 OCR is implementable.
2. **CERT-IN / PIB / RBI** — named in the original brainstorm as OSINT sources but none publish a conventional public API; integration likely means scraping their public bulletins via Firecrawl/Tavily rather than a dedicated provider plugin. Confirm before listing them as first-class providers.
3. **Population data licensing** — see Worldometers note above.
4. **Second AI completion provider** — for genuine model diversity in the Router (per `03_Agent_System.md` §4) and for the Verification Agent's "different model, fewer correlated errors" goal, a second completion provider beyond Groq should be added. Which one is a product/cost decision, not specified here.

## 5. `.env.example` (reference shape — values are never real)

```ini
# ─── Environment ────────────────────────────────────────────
ENV=development
DATABASE_URL=

# ─── AI — Existing (v1) ─────────────────────────────────────
GROQ_API_KEY=
HF_TOKEN=

# ─── AI — Planned Additions (v2, provision before enabling) ──
# SECOND_LLM_PROVIDER_API_KEY=
# VISION_PROVIDER_API_KEY=

# ─── Geospatial ──────────────────────────────────────────────
NASA_API_KEY=
MAPILLARY_ACCESS_TOKEN=
GOOGLE_MAPS_API_KEY=

# ─── Legal / OSINT ───────────────────────────────────────────
INDIAN_KANOON_API_KEY=
FIRECRAWL_API_KEY=
TAVILY_API_KEY=
OPENCITY_API_KEY=

# ─── Zoho Catalyst (existing, v1) ────────────────────────────
CATALYST_PROJECT_ID=
CATALYST_ENVIRONMENT=
CATALYST_APP_URL=
```

Every value above is blank by design. See `10_Deployment.md` §3 for where real values are actually stored per environment.

## 6. Phased Rollout

- **Phase 0:** Groq + HF only (v1 parity), Provider Interface scaffolding built and tested against these two
- **Phase 1:** NASA, Mapillary, Google Maps, Indian Kanoon, Firecrawl, Tavily — pending each provider's key being provisioned by whoever owns that account
- **Phase 2:** Resolve open questions in §4.1, add vision provider, second LLM provider, OpenCity/government sources
