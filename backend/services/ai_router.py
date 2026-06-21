import os
import time
import math
import random
from typing import Dict, List, Any, Optional
from services.providers import (
    GroqProvider,
    HFProvider,
    NASAProvider,
    GoogleMapsProvider,
    MapillaryProvider,
    IndianKanoonProvider,
    FirecrawlProvider,
    TavilyProvider,
    GeminiProvider,
    ProviderResult,
    IntelligenceProvider
)

class AIRouter:
    def __init__(self):
        # Register providers
        self.providers: Dict[str, IntelligenceProvider] = {
            "groq": GroqProvider(),
            "hf": HFProvider(),
            "nasa": NASAProvider(),
            "google_maps": GoogleMapsProvider(),
            "mapillary": MapillaryProvider(),
            "indian_kanoon": IndianKanoonProvider(),
            "firecrawl": FirecrawlProvider(),
            "tavily": TavilyProvider(),
            "gemini": GeminiProvider()
        }
        
        # Circuit breaker state
        self.health_registry: Dict[str, Dict[str, Any]] = {}
        for p in self.providers:
            self.health_registry[p] = {"status": "healthy", "last_check": 0.0, "failures": 0}
            
        self.cache = {}
        self.CACHE_TTL = 300

    def get_provider(self, name: str) -> Optional[IntelligenceProvider]:
        return self.providers.get(name)

    def verify_health(self, name: str) -> bool:
        registry = self.health_registry.get(name)
        if not registry:
            return False
            
        now = time.time()
        if registry["status"] == "unhealthy" and (now - registry["last_check"]) < 30.0:
            return False
            
        status = self.providers[name].health()
        registry["last_check"] = now
        if status == "healthy":
            registry["status"] = "healthy"
            registry["failures"] = 0
            return True
        else:
            registry["failures"] += 1
            if registry["failures"] >= 3:
                registry["status"] = "unhealthy"
            return False

    def report_failure(self, name: str):
        registry = self.health_registry.get(name)
        if registry:
            registry["failures"] += 1
            if registry["failures"] >= 3:
                registry["status"] = "unhealthy"
                registry["last_check"] = time.time()

    def report_success(self, name: str):
        registry = self.health_registry.get(name)
        if registry:
            registry["failures"] = 0
            registry["status"] = "healthy"

    def complete(self, query: str, system: Optional[str] = None, **kwargs) -> Optional[str]:
        # Extract provider from kwargs, defaulting to 'groq'
        provider_name = kwargs.pop("provider", "groq")
        
        cache_key = f"complete:{query}:{system}:{kwargs}:{provider_name}"
        now = time.time()
        
        if cache_key in self.cache:
            val, expiry = self.cache[cache_key]
            if now < expiry:
                return val

        # Try the requested provider first
        provider_healthy = self.verify_health(provider_name)
        if provider_healthy:
            provider = self.providers[provider_name]
            max_attempts = kwargs.get("max_attempts", 2)
            base_backoff = 0.5
            
            for attempt in range(max_attempts):
                if provider_name == "gemini":
                    result = provider.search(f"{system}\n\n{query}" if system else query, **kwargs)
                else:
                    result = provider.search(query, system=system, **kwargs)
                
                if result.success:
                    self.report_success(provider_name)
                    self.cache[cache_key] = (result.data, now + self.CACHE_TTL)
                    return result.data
                else:
                    self.report_failure(provider_name)
                    error_msg = result.errors[0] if result.errors else ""
                    is_rate_limit = "429" in error_msg
                    
                    if attempt < max_attempts - 1:
                        sleep_time = base_backoff * (2 ** attempt) + random.uniform(0, 0.1)
                        time.sleep(sleep_time)
                    elif is_rate_limit and provider_name == "groq":
                        # Fallback to secondary model within Groq/OpenRouter
                        fallback_kwargs = kwargs.copy()
                        fallback_kwargs["model"] = "meta-llama/llama-3.1-8b-instruct" if provider.api_key.startswith("sk-or-") else "llama-3.1-8b-instant"
                        fallback_result = provider.search(query, system=system, **fallback_kwargs)
                        if fallback_result.success:
                            self.cache[cache_key] = (fallback_result.data, now + self.CACHE_TTL)
                            return fallback_result.data

        # Fallback to the alternate provider if the requested one failed
        alternate_provider_name = "gemini" if provider_name == "groq" else "groq"
        if self.verify_health(alternate_provider_name):
            print(f"[AI Router] Provider {provider_name} failed/unhealthy. Activating alternate fallback {alternate_provider_name}...")
            provider = self.providers[alternate_provider_name]
            if alternate_provider_name == "gemini":
                res = provider.search(f"{system}\n\n{query}" if system else query, **kwargs)
            else:
                res = provider.search(query, system=system, **kwargs)
                
            if res.success:
                self.report_success(alternate_provider_name)
                self.cache[cache_key] = (res.data, now + self.CACHE_TTL)
                return res.data
            else:
                self.report_failure(alternate_provider_name)

        return self._mock_completion_fallback(query, system)

    def embed(self, query: str) -> Optional[List[float]]:
        cache_key = f"embed:{query}"
        now = time.time()
        
        if cache_key in self.cache:
            val, expiry = self.cache[cache_key]
            if now < expiry:
                return val

        provider_name = "hf"
        if not self.verify_health(provider_name):
            return self._generate_local_embedding(query)

        provider = self.providers[provider_name]
        result = provider.search(query)
        if result.success and isinstance(result.data, list):
            self.report_success(provider_name)
            self.cache[cache_key] = (result.data, now + 86400 * 30)
            return result.data
        else:
            self.report_failure(provider_name)
            return self._generate_local_embedding(query)

    def _generate_local_embedding(self, text: str) -> List[float]:
        random.seed(hash(text))
        emb = [random.uniform(-0.1, 0.1) for _ in range(384)]
        norm = math.sqrt(sum(x*x for x in emb))
        if norm > 0:
            emb = [x/norm for x in emb]
        return emb

    def _mock_completion_fallback(self, query: str, system: str = "") -> str:
        return f"[OFFLINE FALLBACK REPLY] LLM Providers currently offline. Query keyword context: {query[:100]}"

ai_router = AIRouter()
