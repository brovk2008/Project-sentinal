import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Zero Trust: Automatic API Key injection for outgoing frontend fetch requests
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const apiKey = import.meta.env.VITE_API_KEY || "";
  if (apiKey) {
    init = init || {};
    init.headers = init.headers || {};
    if (init.headers instanceof Headers) {
      init.headers.set("X-API-Key", apiKey);
    } else if (Array.isArray(init.headers)) {
      init.headers.push(["X-API-Key", apiKey]);
    } else {
      init.headers["X-API-Key"] = apiKey;
    }
  }
  return originalFetch(input, init);
};


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
