import urllib.request
import urllib.error
import json
import os
import time
from typing import Optional, Dict, Any

class LLMService:
    @staticmethod
    def is_available() -> bool:
        """Checks if Groq API key is present and connectivity to Groq works."""
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return False
            
        try:
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/models",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "ProjectSentinel/2.0"
                }
            )
            with urllib.request.urlopen(req, timeout=8.0) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
                    models = [m.get("id") for m in data.get("data", [])]
                    # Verify if our primary model or fallback model is present in the list
                    return any(m in models for m in ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"])
        except Exception as e:
            print(f"[Groq LLM Log] Health connectivity check failed: {e}", flush=True)
            return False
        return False

    @staticmethod
    def generate(prompt: str, system: Optional[str] = None, max_retries: int = 3) -> Optional[str]:
        """
        Generates text using Groq Chat Completions API with automatic retry,
        latency tracking, token logging, and fallback model logic.
        Uses a strict 5.0s timeout per attempt for production response speed.
        """
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            print("[Groq LLM Log] Error: GROQ_API_KEY is not set in environment.", flush=True)
            return None
        
        # Primary model and Fallback model configuration
        models_to_try = [
            ("llama-3.3-70b-versatile", False, max_retries),  # (model_name, is_fallback, retries)
            ("llama-3.1-8b-instant", True, 2)
        ]
        
        for model, is_fallback, attempts in models_to_try:
            payload = {
                "model": model,
                "messages": [],
                "temperature": 0.1,
                "max_tokens": 768,
                "stream": False
            }
            if system:
                payload["messages"].append({"role": "system", "content": system})
            payload["messages"].append({"role": "user", "content": prompt})
            
            data_bytes = json.dumps(payload).encode('utf-8')
            
            for attempt in range(attempts):
                start_time = time.time()
                try:
                    req = urllib.request.Request(
                        "https://api.groq.com/openai/v1/chat/completions",
                        data=data_bytes,
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json",
                            "User-Agent": "ProjectSentinel/2.0"
                        }
                    )
                    
                    # Hardened 5.0 second timeout for responsiveness
                    with urllib.request.urlopen(req, timeout=5.0) as response:
                        latency = time.time() - start_time
                        res_data = json.loads(response.read().decode('utf-8'))
                        
                        choices = res_data.get("choices", [])
                        if not choices:
                            raise ValueError("Empty choices in Groq response")
                            
                        content = choices[0].get("message", {}).get("content", "").strip()
                        usage = res_data.get("usage", {})
                        prompt_tokens = usage.get("prompt_tokens", 0)
                        completion_tokens = usage.get("completion_tokens", 0)
                        total_tokens = usage.get("total_tokens", 0)
                        
                        prefix = "[Groq LLM Log] Fallback " if is_fallback else "[Groq LLM Log] "
                        print(f"{prefix}SUCCESS. Model: {model} | Latency: {latency:.2f}s | Tokens: {prompt_tokens}p / {completion_tokens}c / {total_tokens}t", flush=True)
                        
                        return content
                        
                except Exception as e:
                    latency = time.time() - start_time
                    print(f"[Groq LLM Log] Attempt {attempt + 1} failed for model {model} (latency: {latency:.2f}s): {e}", flush=True)
                    if attempt < attempts - 1:
                        time.sleep(0.3)
            
            # If primary model fails entirely, log fallback warning and try fallback model
            if not is_fallback:
                print(f"[Groq LLM Log] WARNING: Primary model {model} failed. Activating fallback model llama-3.1-8b-instant...", flush=True)
                
        print("[Groq LLM Log] ERROR: All models and retries failed.", flush=True)
        return None
