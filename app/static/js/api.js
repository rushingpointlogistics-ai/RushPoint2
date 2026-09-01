/**
 * RushingPoint V1.0 API Client
 */
const API = {
  getBaseUrl() {
    if (typeof window !== "undefined" && window.location.origin && window.location.origin !== "null" && window.location.protocol.startsWith("http")) {
      return window.location.origin;
    }
    return localStorage.getItem("rp_api_endpoint") || "https://rushpoint.onrender.com";
  },

  get baseUrl() {
    return this.getBaseUrl();
  },
  
  getToken() {
    return localStorage.getItem("rp_token") || "";
  },
  
  setToken(token) {
    if (token) localStorage.setItem("rp_token", token);
    else localStorage.removeItem("rp_token");
  },
  
  getUser() {
    try {
      return JSON.parse(localStorage.getItem("rp_user")) || null;
    } catch {
      return null;
    }
  },
  
  setUser(user) {
    if (user) localStorage.setItem("rp_user", JSON.stringify(user));
    else localStorage.removeItem("rp_user");
  },

  logout() {
    localStorage.removeItem("rp_token");
    localStorage.removeItem("rp_user");
    localStorage.removeItem("rp_wallet");
  },

  async request(endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    
    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    const config = {
      ...options,
      headers
    };
    
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      const data = await response.json();
      
      if (!response.ok) {
        const errorMsg = data.detail || data.message || "An unexpected error occurred.";
        this.showToast(errorMsg, "error");
        throw new Error(errorMsg);
      }
      
      return data;
    } catch (err) {
      if (!options.silent) {
        console.error(`API Error on ${endpoint}:`, err);
      }
      throw err;
    }
  },

  get(endpoint, options = {}) {
    return this.request(endpoint, { method: "GET", ...options });
  },

  post(endpoint, body, options = {}) {
    return this.request(endpoint, { method: "POST", body: JSON.stringify(body), ...options });
  },

  put(endpoint, body, options = {}) {
    return this.request(endpoint, { method: "PUT", body: JSON.stringify(body), ...options });
  },

  delete(endpoint, options = {}) {
    return this.request(endpoint, { method: "DELETE", ...options });
  },

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, { method: "PATCH", body: JSON.stringify(body), ...options });
  },


  showToast(message, type = "info") {
    const existing = document.querySelector(".rp-toast");
    if (existing) existing.remove();
    
    const toast = document.createElement("div");
    toast.className = `rp-toast toast-${type}`;
    
    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "⚠️";
    
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }
};
