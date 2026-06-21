import os
import json
import urllib.request
import urllib.parse
import urllib.error
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional

class ProviderResult:
    def __init__(self, data: Any, source: str, success: bool = True, errors: list = None):
        self.data = data
        self.source = source
        self.success = success
        self.errors = errors or []

class IntelligenceProvider(ABC):
    @abstractmethod
    def search(self, query: str, **kwargs) -> ProviderResult:
        pass

    @abstractmethod
    def health(self) -> str:
        pass

    @abstractmethod
    def capabilities(self) -> List[str]:
        pass

    @abstractmethod
    def authenticate(self) -> bool:
        pass

class GroqProvider(IntelligenceProvider):
    def __init__(self):
        # Allow loading OpenRouter keys as well
        self.api_key = os.getenv("GROQ_API_KEY")

    def authenticate(self) -> bool:
        return bool(self.api_key)

    def health(self) -> str:
        if not self.authenticate():
            return "unhealthy"
        try:
            url = "https://openrouter.ai/api/v1/models" if self.api_key.startswith("sk-or-") else "https://api.groq.com/openai/v1/models"
            req = urllib.request.Request(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "User-Agent": "ProjectSentinel/2.0"
                }
            )
            with urllib.request.urlopen(req, timeout=5.0) as response:
                if response.status == 200:
                    return "healthy"
        except Exception:
            pass
        return "unhealthy"

    def capabilities(self) -> List[str]:
        return ["completions", "reasoning", "verification"]

    def search(self, query: str, **kwargs) -> ProviderResult:
        system_prompt = kwargs.get("system", "")
        model = kwargs.get("model", "meta-llama/llama-3.3-70b-instruct" if self.api_key.startswith("sk-or-") else "llama-3.3-70b-versatile")
        temperature = kwargs.get("temperature", 0.1)
        max_tokens = kwargs.get("max_tokens", 768)

        payload = {
            "model": model,
            "messages": [],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False
        }
        if system_prompt:
            payload["messages"].append({"role": "system", "content": system_prompt})
        payload["messages"].append({"role": "user", "content": query})
        
        data_bytes = json.dumps(payload).encode('utf-8')
        try:
            url = "https://openrouter.ai/api/v1/chat/completions" if self.api_key.startswith("sk-or-") else "https://api.groq.com/openai/v1/chat/completions"
            req = urllib.request.Request(
                url,
                data=data_bytes,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "ProjectSentinel/2.0"
                }
            )
            with urllib.request.urlopen(req, timeout=12.0) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                choices = res_data.get("choices", [])
                if not choices:
                    return ProviderResult(None, "Groq/OpenRouter", success=False, errors=["Empty choices from model endpoint"])
                content = choices[0].get("message", {}).get("content", "").strip()
                return ProviderResult(content, "Groq/OpenRouter")
        except Exception as e:
            return ProviderResult(None, "Groq/OpenRouter", success=False, errors=[str(e)])

class HFProvider(IntelligenceProvider):
    def __init__(self):
        self.token = os.getenv("HF_TOKEN")

    def authenticate(self) -> bool:
        return bool(self.token)

    def health(self) -> str:
        if not self.authenticate():
            return "unhealthy"
        try:
            req = urllib.request.Request(
                "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "User-Agent": "ProjectSentinel/2.0"
                },
                method="GET"
            )
            with urllib.request.urlopen(req, timeout=5.0) as response:
                if response.status == 200:
                    return "healthy"
        except Exception:
            pass
        return "unhealthy"

    def capabilities(self) -> List[str]:
        return ["embeddings"]

    def search(self, query: str, **kwargs) -> ProviderResult:
        payload = {"inputs": query}
        data_bytes = json.dumps(payload).encode('utf-8')
        try:
            req = urllib.request.Request(
                "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
                data=data_bytes,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                    "User-Agent": "ProjectSentinel/2.0"
                }
            )
            with urllib.request.urlopen(req, timeout=10.0) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                if isinstance(res_data, list):
                    return ProviderResult(res_data, "HuggingFace")
                else:
                    return ProviderResult(None, "HuggingFace", success=False, errors=["Unexpected response shape from HF API"])
        except Exception as e:
            return ProviderResult(None, "HuggingFace", success=False, errors=[str(e)])

class NASAProvider(IntelligenceProvider):
    def __init__(self):
        self.api_key = os.getenv("NASA_API_KEY")

    def authenticate(self) -> bool:
        return bool(self.api_key)

    def health(self) -> str:
        if not self.authenticate():
            return "unhealthy"
        return "healthy"

    def capabilities(self) -> List[str]:
        return ["geospatial", "satellite_imagery", "weather"]

    def search(self, query: str, **kwargs) -> ProviderResult:
        if not self.authenticate():
            return ProviderResult(None, "NASA", success=False, errors=["Unauthenticated"])
        try:
            # Query active fires in Karnataka using NASA FIRMS API bounding box csv
            # bbox coordinates: min_lon, min_lat, max_lon, max_lat
            # Karnataka box approx: 74.0, 11.5, 78.5, 18.5
            bbox_str = kwargs.get("bbox", "74.0,11.5,78.5,18.5")
            url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{self.api_key}/LANDSAT_NRT/{bbox_str}/1"
            
            req = urllib.request.Request(url, headers={"User-Agent": "ProjectSentinel/2.0"})
            with urllib.request.urlopen(req, timeout=8.0) as response:
                csv_data = response.read().decode('utf-8')
                lines = csv_data.split('\n')
                fires = []
                if len(lines) > 1:
                    header = lines[0].split(',')
                    for line in lines[1:]:
                        cols = line.split(',')
                        if len(cols) == len(header):
                            fire_data = dict(zip(header, cols))
                            fires.append(fire_data)
                return ProviderResult(fires, "NASA_FIRMS")
        except Exception as e:
            return ProviderResult(None, "NASA", success=False, errors=[str(e)])

class GoogleMapsProvider(IntelligenceProvider):
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_MAPS_API_KEY")

    def authenticate(self) -> bool:
        return bool(self.api_key)

    def health(self) -> str:
        return "healthy" if self.authenticate() else "unhealthy"

    def capabilities(self) -> List[str]:
        return ["geocoding", "map_tiles"]

    def search(self, query: str, **kwargs) -> ProviderResult:
        if not self.authenticate():
            return ProviderResult(None, "GoogleMaps", success=False, errors=["Unauthenticated"])
        try:
            encoded_query = urllib.parse.quote(query)
            url = f"https://maps.googleapis.com/maps/api/geocode/json?address={encoded_query}&key={self.api_key}"
            req = urllib.request.Request(url, headers={"User-Agent": "ProjectSentinel/2.0"})
            with urllib.request.urlopen(req, timeout=5.0) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                if res_data.get("status") == "OK":
                    results = res_data.get("results", [])
                    return ProviderResult(results, "GoogleMaps")
                else:
                    return ProviderResult(None, "GoogleMaps", success=False, errors=[res_data.get("status")])
        except Exception as e:
            return ProviderResult(None, "GoogleMaps", success=False, errors=[str(e)])

class MapillaryProvider(IntelligenceProvider):
    def __init__(self):
        self.token = os.getenv("MAPILLARY_ACCESS_TOKEN")

    def authenticate(self) -> bool:
        return bool(self.token)

    def health(self) -> str:
        return "healthy" if self.authenticate() else "unhealthy"

    def capabilities(self) -> List[str]:
        return ["street_imagery"]

    def search(self, query: str, **kwargs) -> ProviderResult:
        if not self.authenticate():
            return ProviderResult(None, "Mapillary", success=False, errors=["Unauthenticated"])
        try:
            # Query Mapillary images around coordinates using BBox
            lat = kwargs.get("latitude")
            lon = kwargs.get("longitude")
            if not lat or not lon:
                return ProviderResult(None, "Mapillary", success=False, errors=["Missing latitude/longitude"])
            
            bbox = f"{lon-0.005},{lat-0.005},{lon+0.005},{lat+0.005}"
            url = f"https://graph.mapillary.com/images?fields=id,geometry,thumb_256_url&bbox={bbox}&access_token={self.token}"
            
            req = urllib.request.Request(url, headers={"User-Agent": "ProjectSentinel/2.0"})
            with urllib.request.urlopen(req, timeout=8.0) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                return ProviderResult(res_data.get("data", []), "Mapillary")
        except Exception as e:
            return ProviderResult(None, "Mapillary", success=False, errors=[str(e)])

class IndianKanoonProvider(IntelligenceProvider):
    def __init__(self):
        self.api_key = os.getenv("INDIAN_KANOON_API_KEY")

    def authenticate(self) -> bool:
        return bool(self.api_key)

    def health(self) -> str:
        return "healthy" if self.authenticate() else "unhealthy"

    def capabilities(self) -> List[str]:
        return ["legal", "statute_lookup", "case_law"]

    def search(self, query: str, **kwargs) -> ProviderResult:
        if not self.authenticate():
            return ProviderResult(None, "IndianKanoon", success=False, errors=["Unauthenticated"])
        try:
            headers = {
                "Authorization": f"Token {self.api_key}",
                "Accept": "application/json",
                "User-Agent": "ProjectSentinel/2.0"
            }
            form_input = urllib.parse.quote(query)
            pagenum = kwargs.get("pagenum", 1)
            url = f"https://api.indiankanoon.org/search/?formInput={form_input}&pagenum={pagenum}"
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10.0) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                return ProviderResult(res_data, "IndianKanoon")
        except Exception as e:
            return ProviderResult(None, "IndianKanoon", success=False, errors=[str(e)])

class FirecrawlProvider(IntelligenceProvider):
    def __init__(self):
        self.api_key = os.getenv("FIRECRAWL_API_KEY")

    def authenticate(self) -> bool:
        return bool(self.api_key)

    def health(self) -> str:
        return "healthy" if self.authenticate() else "unhealthy"

    def capabilities(self) -> List[str]:
        return ["scraping", "search"]

    def search(self, query: str, **kwargs) -> ProviderResult:
        if not self.authenticate():
            return ProviderResult(None, "Firecrawl", success=False, errors=["Unauthenticated"])
        try:
            payload = {
                "url": query,
                "formats": ["markdown"]
            }
            data_bytes = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                "https://api.firecrawl.dev/v1/scrape",
                data=data_bytes,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "ProjectSentinel/2.0"
                }
            )
            with urllib.request.urlopen(req, timeout=10.0) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                if res_data.get("success"):
                    markdown_content = res_data.get("data", {}).get("markdown", "")
                    return ProviderResult(markdown_content, "Firecrawl")
                else:
                    return ProviderResult(None, "Firecrawl", success=False, errors=[res_data.get("error", "Scrape failed")])
        except Exception as e:
            return ProviderResult(None, "Firecrawl", success=False, errors=[str(e)])

class TavilyProvider(IntelligenceProvider):
    def __init__(self):
        self.api_key = os.getenv("TAVILY_API_KEY")

    def authenticate(self) -> bool:
        return bool(self.api_key)

    def health(self) -> str:
        return "healthy" if self.authenticate() else "unhealthy"

    def capabilities(self) -> List[str]:
        return ["search"]

    def search(self, query: str, **kwargs) -> ProviderResult:
        if not self.authenticate():
            return ProviderResult(None, "Tavily", success=False, errors=["Unauthenticated"])
        try:
            payload = {
                "api_key": self.api_key,
                "query": query,
                "search_depth": "advanced",
                "include_answer": True
            }
            data_bytes = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                "https://api.tavily.com/search",
                data=data_bytes,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "ProjectSentinel/2.0"
                }
            )
            with urllib.request.urlopen(req, timeout=10.0) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                return ProviderResult(res_data, "Tavily")
        except Exception as e:
            return ProviderResult(None, "Tavily", success=False, errors=[str(e)])

class GeminiProvider(IntelligenceProvider):
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")

    def authenticate(self) -> bool:
        return bool(self.api_key)

    def health(self) -> str:
        if not self.authenticate():
            return "unhealthy"
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={self.api_key}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=5.0) as response:
                if response.status == 200:
                    return "healthy"
        except Exception:
            pass
        return "unhealthy"

    def capabilities(self) -> List[str]:
        return ["completions", "vision", "ocr"]

    def search(self, query: str, **kwargs) -> ProviderResult:
        # Gemini text completion Beta endpoint
        if not self.authenticate():
            return ProviderResult(None, "Gemini", success=False, errors=["Unauthenticated"])
        try:
            model = kwargs.get("model", "gemini-2.5-flash")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
            
            # Simple content payload structure
            payload = {
                "contents": [{
                    "parts": [{"text": query}]
                }]
            }
            
            data_bytes = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=data_bytes,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "ProjectSentinel/2.0"
                }
            )
            with urllib.request.urlopen(req, timeout=10.0) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                candidates = res_data.get("candidates", [])
                if candidates:
                    content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                    return ProviderResult(content, "Gemini")
                return ProviderResult(None, "Gemini", success=False, errors=["Empty candidates in Gemini response"])
        except Exception as e:
            return ProviderResult(None, "Gemini", success=False, errors=[str(e)])
