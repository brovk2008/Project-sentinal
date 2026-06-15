// Project Sentinel Runtime Configuration Resolver

export const getApiBaseUrl = () => {
  // Check if window.APP_CONFIG has been defined in index.html (runtime override)
  if (window.APP_CONFIG && window.APP_CONFIG.VITE_API_BASE_URL) {
    return window.APP_CONFIG.VITE_API_BASE_URL;
  }
  // Fall back to Vite compile-time environment variables
  if (import.meta.env && import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // Default fallback for local development
  return 'http://localhost:8000';
};
