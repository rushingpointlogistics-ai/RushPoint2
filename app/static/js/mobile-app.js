/**
 * RushPoint V1.0 Mobile Application Experience
 * Theme: Light Maroon / Blood Red Edition
 * Complete Online Marketplace with Multi-Vendor Storefronts, Vendor Location Discovery, and Unified Login.
 */

const MobileApp = {
  activeTab: "home",
  browsingMode: "all", // "all", "stores", "storefront"
  viewingStore: null, // Full store object when inside a specific vendor's marketplace
  cart: [],
  currentOrder: null,
  activeRole: null, // CUSTOMER, VENDOR, RIDER
  selectedCategory: "",
  searchQuery: "",
  notifications: [],
  hideBalance: localStorage.getItem('rp_hide_balance') === 'true',
  isStoreClosed: localStorage.getItem('rp_store_closed') === 'true',
  isRiderOnline: localStorage.getItem('rp_rider_online') !== 'false',
  deliveryLat: 12.9820,
  deliveryLng: 7.5950,
  deliveryAddress: "GRA Residential Main Road, Katsina",
  deliveryFee: 1200.0,
  deliveryDistanceKm: 3.2,
  deliveryDurationMin: 14,
  checkoutMap: null,
  checkoutMarker: null,
  checkoutStoreMarker: null,
  checkoutRouteLine: null,
  geocodeDebounceTimer: null,

  init() {
    this.render();
  },

  render() {
    const container = document.getElementById("mobile-app-root");
    if (!container) return;

    const user = API.getUser();
    if (!user) {
      this.renderAuthScreen(container);
    } else {
      this.activeRole = user.account_type;
      if (this.activeRole === "CUSTOMER") {
        this.renderCustomerApp(container, user);
      } else if (this.activeRole === "VENDOR") {
        this.renderVendorApp(container, user);
      } else if (this.activeRole === "RIDER") {
        this.renderRiderApp(container, user);
      } else {
        this.renderAdminMobileApp(container, user);
      }
    }
  },

  toggleBalanceVisibility() {
    this.hideBalance = !this.hideBalance;
    localStorage.setItem('rp_hide_balance', this.hideBalance);
    this.render();
  },

  selectSavedAddress(addr, lat, lon) {
    const input = document.getElementById('checkout-address');
    if (input) input.value = addr;
    this.deliveryAddress = addr;
    this.deliveryLat = lat;
    this.deliveryLng = lon;
    API.showToast(`📍 Location: ${addr}`, 'success');
    if (this.checkoutMarker && this.checkoutMap) {
      this.checkoutMarker.setLatLng([lat, lon]);
      this.checkoutMap.setView([lat, lon], 14);
      if (this.checkoutRouteLine && this.checkoutStoreMarker) {
        this.checkoutRouteLine.setLatLngs([this.checkoutStoreMarker.getLatLng(), [lat, lon]]);
      }
    }
    this.updateLiveDeliveryQuote();
  },

  onAddressTyped(query) {
    this.deliveryAddress = query;
    clearTimeout(this.geocodeDebounceTimer);
    if (!query || query.trim().length < 3) return;
    
    this.geocodeDebounceTimer = setTimeout(async () => {
      try {
        const res = await API.get(`/api/marketplace/geocode?query=${encodeURIComponent(query.trim())}`);
        if (res && res.location) {
          const loc = res.location;
          this.deliveryLat = loc.latitude;
          this.deliveryLng = loc.longitude;
          if (this.checkoutMarker && this.checkoutMap) {
            this.checkoutMarker.setLatLng([loc.latitude, loc.longitude]);
            this.checkoutMap.setView([loc.latitude, loc.longitude], 14);
            if (this.checkoutRouteLine && this.checkoutStoreMarker) {
              this.checkoutRouteLine.setLatLngs([this.checkoutStoreMarker.getLatLng(), [loc.latitude, loc.longitude]]);
            }
          }
          await this.updateLiveDeliveryQuote();
          API.showToast(`📍 Map Aligned: ${loc.formatted_address || query}`, 'info');
        }
      } catch (e) {
        console.warn('Geocoding error:', e);
      }
    }, 450);
  },

  async updateLiveDeliveryQuote() {
    if (!this.cart || this.cart.length === 0) return;
    const storeId = this.cart[0].store_id;
    const totalQty = this.cart.reduce((sum, it) => sum + it.quantity, 0);

    try {
      const res = await API.post('/api/marketplace/calculate-delivery-quote', {
        store_id: storeId,
        customer_lat: this.deliveryLat,
        customer_lon: this.deliveryLng,
        cargo_weight_kg: 2.0
      });

      if (res && res.routing) {
        const r = res.routing;
        let baseFee = r.pricing ? r.pricing.total_delivery_fee : 1200.0;
        
        // Multi-item rule: buying multiple items in same shop adds +0.2% per item
        if (this.cart.length > 1) {
          baseFee += baseFee * (0.002 * (this.cart.length - 1));
        }
        // If total quantity > 5: add 4% of delivery of products
        if (totalQty > 5) {
          baseFee += baseFee * 0.04;
        }

        this.deliveryFee = Math.round(baseFee);
        this.deliveryDistanceKm = r.distance_km || 3.2;
        this.deliveryDurationMin = r.estimated_duration_minutes || 14;

        // Update DOM elements live
        const feeEl = document.getElementById('checkout-delivery-fee-val');
        if (feeEl) feeEl.innerText = `₦${this.deliveryFee.toLocaleString()}`;

        const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const total = subtotal + this.deliveryFee;

        const totalEl = document.getElementById('checkout-total-val');
        if (totalEl) totalEl.innerText = `₦${total.toLocaleString()}`;

        const flwBtnText = document.getElementById('flw-pay-btn-text');
        if (flwBtnText) flwBtnText.innerText = `⚡ Pay ₦${total.toLocaleString()} with Flutterwave`;

        const distBadge = document.getElementById('checkout-distance-badge');
        if (distBadge) {
          distBadge.innerHTML = `🛣️ <strong>${this.deliveryDistanceKm} km</strong> road distance • ~<strong>${this.deliveryDurationMin} mins</strong> arrival`;
        }

        const formulaBadge = document.getElementById('checkout-formula-badge');
        if (formulaBadge) {
          formulaBadge.innerText = `Calculated by real road distance${this.cart.length > 1 ? ` (+${((this.cart.length - 1) * 0.2).toFixed(1)}% multi-item)` : ''}${totalQty > 5 ? ' (+4% bulk qty)' : ''}`;
        }
      }
    } catch(e) {
      console.warn('Delivery quote error:', e);
    }
  },

  initCheckoutMiniMap() {
    setTimeout(async () => {
      const mapContainer = document.getElementById('checkout-mini-map');
      if (!mapContainer || typeof L === 'undefined') return;
      
      if (this.checkoutMap) {
        try { this.checkoutMap.remove(); } catch(e){}
        this.checkoutMap = null;
      }

      let storeLat = 12.9908, storeLng = 7.6018, storeName = "Vendor Stall";
      try {
        if (this.cart[0] && this.cart[0].store_id) {
          const sRes = await API.get(`/api/marketplace/stores/${this.cart[0].store_id}`);
          if (sRes && sRes.store) {
            storeLat = sRes.store.latitude || 12.9908;
            storeLng = sRes.store.longitude || 7.6018;
            storeName = sRes.store.store_name || "Vendor Stall";
          }
        }
      } catch(e){}

      const custLat = this.deliveryLat || 12.9820;
      const custLng = this.deliveryLng || 7.5950;

      this.checkoutMap = L.map('checkout-mini-map', {
        zoomControl: false,
        attributionControl: false
      }).setView([custLat, custLng], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18
      }).addTo(this.checkoutMap);

      const storeIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `<div style="background: #7F1D1D; color: #FFF; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 2px solid #FFF;">🏪</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      this.checkoutStoreMarker = L.marker([storeLat, storeLng], { icon: storeIcon })
        .addTo(this.checkoutMap)
        .bindPopup(`<b>${storeName}</b><br>Pickup Origin`);

      const custIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `<div style="background: #059669; color: #FFF; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 2px 10px rgba(5,150,105,0.5); border: 2px solid #FFF;">📍</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 28]
      });
      this.checkoutMarker = L.marker([custLat, custLng], { icon: custIcon, draggable: true })
        .addTo(this.checkoutMap)
        .bindPopup(`<b>Your Dropoff Point</b><br>Drag pin to adjust location!`);

      this.checkoutRouteLine = L.polyline([[storeLat, storeLng], [custLat, custLng]], {
        color: '#B91C1C',
        weight: 3,
        dashArray: '5, 8',
        opacity: 0.8
      }).addTo(this.checkoutMap);

      try {
        this.checkoutMap.fitBounds([[storeLat, storeLng], [custLat, custLng]], { padding: [25, 25] });
      } catch(e){}

      this.checkoutMarker.on('dragend', async (e) => {
        const pos = e.target.getLatLng();
        this.deliveryLat = pos.lat;
        this.deliveryLng = pos.lng;
        if (this.checkoutRouteLine) {
          this.checkoutRouteLine.setLatLngs([[storeLat, storeLng], [pos.lat, pos.lng]]);
        }
        try {
          const rev = await API.get(`/api/marketplace/reverse-geocode?lat=${pos.lat}&lon=${pos.lng}`);
          if (rev && rev.address && rev.address.formatted_address) {
            this.deliveryAddress = rev.address.formatted_address;
            const input = document.getElementById('checkout-address');
            if (input) input.value = this.deliveryAddress;
            API.showToast(`📍 Dropoff: ${this.deliveryAddress}`, 'info');
          }
        } catch(e){}
        this.updateLiveDeliveryQuote();
      });

      this.checkoutMap.on('click', async (e) => {
        const pos = e.latlng;
        this.deliveryLat = pos.lat;
        this.deliveryLng = pos.lng;
        this.checkoutMarker.setLatLng(pos);
        if (this.checkoutRouteLine) {
          this.checkoutRouteLine.setLatLngs([[storeLat, storeLng], [pos.lat, pos.lng]]);
        }
        try {
          const rev = await API.get(`/api/marketplace/reverse-geocode?lat=${pos.lat}&lon=${pos.lng}`);
          if (rev && rev.address && rev.address.formatted_address) {
            this.deliveryAddress = rev.address.formatted_address;
            const input = document.getElementById('checkout-address');
            if (input) input.value = this.deliveryAddress;
            API.showToast(`📍 Selected: ${this.deliveryAddress}`, 'info');
          }
        } catch(e){}
        this.updateLiveDeliveryQuote();
      });

      this.updateLiveDeliveryQuote();
    }, 150);
  },

  toggleStoreOpenStatus() {
    this.isStoreClosed = !this.isStoreClosed;
    localStorage.setItem('rp_store_closed', this.isStoreClosed);
    API.showToast(this.isStoreClosed ? '🔴 Store is now marked as CLOSED' : '🟢 Store is now OPEN for orders!', this.isStoreClosed ? 'info' : 'success');
    this.render();
  },

  toggleRiderOnlineStatus() {
    this.isRiderOnline = !this.isRiderOnline;
    localStorage.setItem('rp_rider_online', this.isRiderOnline);
    API.showToast(this.isRiderOnline ? '🟢 You are now ONLINE & ready for missions!' : '⚪ You are now OFF-DUTY', this.isRiderOnline ? 'success' : 'info');
    this.render();
  },

  async toggleProductQuickStock(productId, newQty) {
    try {
      await API.put(`/api/products/${productId}`, { stock_qty: newQty });
      API.showToast(newQty > 0 ? '✅ Product is now IN STOCK!' : '⏸️ Product marked as OUT OF STOCK', 'success');
      this.render();
    } catch(e) {
      API.showToast('Could not update product stock', 'error');
    }
  },

  // ==========================================
  // UNIFIED ROOT LOGIN & SIGNUP SCREEN
  // ==========================================
  renderAuthScreen(container) {
    container.innerHTML = `
      <div style="padding: 24px 20px; display: flex; flex-direction: column; min-height: 100%; justify-content: space-between; background: linear-gradient(180deg, #1E0207 0%, #2E030C 60%, #120104 100%); color: #FFFFFF;">
        <div style="text-align: center; margin-top: 10px; margin-bottom: 8px;">
          <div style="width: 72px; height: 72px; background: #FFFFFF; border-radius: 18px; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; padding: 5px; box-shadow: 0 8px 25px rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.3);">
            <img src="/static/img/rushpoint-logo-white-badge.png" onerror="this.onerror=null;this.src='img/rushpoint-logo.png'" style="width: 100%; height: 100%; object-fit: contain;" alt="RushPoint">
          </div>
          <h1 style="font-size: 1.6rem; font-weight: 900; letter-spacing: -0.5px; margin: 0; color: #FFF;">RushPoint</h1>
          <p style="font-size: 0.72rem; font-weight: 600; opacity: 0.9; color: #FECDD3; letter-spacing: 0.5px; margin-top: 2px;">Every Delivery, On Point.</p>
        </div>

        <!-- Role Quick-Switcher Chips -->
        <div style="display: flex; gap: 6px; background: rgba(255,255,255,0.08); padding: 4px; border-radius: 12px; margin-bottom: 14px; border: 1px solid rgba(255,255,255,0.12);">
          <button type="button" onclick="MobileApp.fillDemoLogin('CUSTOMER')" id="tab-role-cust" style="flex: 1; padding: 7px 0; border: none; border-radius: 8px; font-size: 0.72rem; font-weight: 800; cursor: pointer; background: #881337; color: #FFF;">🛍️ Customer</button>
          <button type="button" onclick="MobileApp.fillDemoLogin('VENDOR')" id="tab-role-vnd" style="flex: 1; padding: 7px 0; border: none; border-radius: 8px; font-size: 0.72rem; font-weight: 800; cursor: pointer; background: transparent; color: #FECDD3;">🏪 Vendor</button>
          <button type="button" onclick="MobileApp.fillDemoLogin('RIDER')" id="tab-role-rdr" style="flex: 1; padding: 7px 0; border: none; border-radius: 8px; font-size: 0.72rem; font-weight: 800; cursor: pointer; background: transparent; color: #FECDD3;">🏍️ Courier</button>
        </div>

        <!-- Login White Card -->
        <div style="background: #FFFFFF; border-radius: 22px; padding: 22px 20px; color: #0F172A; box-shadow: 0 16px 40px rgba(0,0,0,0.35);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <h2 style="font-size: 1.1rem; font-weight: 900; color: #881337; margin: 0;">Sign In</h2>
            <span style="font-size: 0.65rem; background: #F0FDF4; color: #059669; border: 1px solid #BBF7D0; padding: 2px 8px; border-radius: 8px; font-weight: 800;">🔒 256-Bit SSL</span>
          </div>
          <p style="font-size: 0.72rem; color: #64748B; margin-bottom: 14px;">Enter your credentials to access your mobile account</p>

          <div id="mob-login-error" style="display: none; background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B; padding: 9px 12px; border-radius: 10px; font-size: 0.75rem; margin-bottom: 12px; font-weight: 600; line-height: 1.35;"></div>

          <form id="mobile-login-form" onsubmit="MobileApp.handleLogin(event)">
            <div class="rp-form-group" style="margin-bottom: 12px;">
              <label class="rp-label" style="font-size: 0.75rem; font-weight: 700; color: #334155;">Email Address or Phone</label>
              <input type="text" id="mob-login-input" class="rp-input" placeholder="e.g. customer@rushingpoint.com" value="customer@rushingpoint.com" required oninput="document.getElementById('mob-login-error').style.display='none'" style="border-radius: 12px; padding: 11px 12px; font-size: 0.85rem;">
            </div>

            <div class="rp-form-group" style="margin-bottom: 16px;">
              <label class="rp-label" style="font-size: 0.75rem; font-weight: 700; color: #334155;">Password</label>
              <input type="password" id="mob-pwd-input" class="rp-input" placeholder="••••••••" value="customer123" required oninput="document.getElementById('mob-login-error').style.display='none'" style="border-radius: 12px; padding: 11px 12px; font-size: 0.85rem;">
            </div>

            <button type="submit" id="mob-login-submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 13px; font-size: 0.9rem; font-weight: 900; border-radius: 14px; background: #881337;">
              Sign In to Account 🔐
            </button>
          </form>
        </div>

        <!-- Customer Self Signup Action -->
        <div style="text-align: center; margin-top: 14px; margin-bottom: 6px;">
          <div style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; padding: 12px 14px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div style="text-align: left;">
              <div style="font-size: 0.8rem; font-weight: 800; color: #FFF;">🛍️ New to RushPoint?</div>
              <div style="font-size: 0.65rem; color: #FECDD3;">Create a free customer account</div>
            </div>
            <button onclick="MobileApp.showCustomerSignupModal()" style="background: #FFF; color: #881337; border: none; font-weight: 900; padding: 7px 14px; border-radius: 10px; font-size: 0.75rem; cursor: pointer;">
              Sign Up ✨
            </button>
          </div>
          <p style="font-size: 0.62rem; color: #94A3B8; margin: 0;">RushPoint Logistics • PCI-DSS Certified Gateway • V1.0</p>
        </div>
      </div>
    `;
  },

  fillDemoLogin(role) {
    const loginIn = document.getElementById("mob-login-input");
    const pwdIn = document.getElementById("mob-pwd-input");
    const tCust = document.getElementById("tab-role-cust");
    const tVnd = document.getElementById("tab-role-vnd");
    const tRdr = document.getElementById("tab-role-rdr");

    [tCust, tVnd, tRdr].forEach(t => {
      if (t) { t.style.background = "transparent"; t.style.color = "#FECDD3"; }
    });

    if (role === "CUSTOMER") {
      if (loginIn) loginIn.value = "customer@rushingpoint.com";
      if (pwdIn) pwdIn.value = "customer123";
      if (tCust) { tCust.style.background = "#881337"; tCust.style.color = "#FFF"; }
    } else if (role === "VENDOR") {
      if (loginIn) loginIn.value = "almusik@rushingpoint.com";
      if (pwdIn) pwdIn.value = "vendor123";
      if (tVnd) { tVnd.style.background = "#881337"; tVnd.style.color = "#FFF"; }
    } else if (role === "RIDER") {
      if (loginIn) loginIn.value = "rider.internal.moto@rushingpoint.com";
      if (pwdIn) pwdIn.value = "rider123";
      if (tRdr) { tRdr.style.background = "#881337"; tRdr.style.color = "#FFF"; }
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    const login = document.getElementById("mob-login-input").value.trim();
    const password = document.getElementById("mob-pwd-input").value;
    const btn = document.getElementById("mob-login-submit");
    const errBox = document.getElementById("mob-login-error");

    if (errBox) errBox.style.display = "none";
    if (btn) { btn.disabled = true; btn.textContent = "Signing in… 🔐"; }

    try {
      const res = await API.post("/api/auth/login", { login, password });
      API.setToken(res.token);
      API.setUser(res.user);
      if (res.wallet) localStorage.setItem("rp_wallet", JSON.stringify(res.wallet));
      API.showToast(`Welcome back, ${res.user.full_name}!`, "success");
      
      if (typeof updateHeaderAuthBar === "function") updateHeaderAuthBar();
      this.render();
      if (window.AdminPortal && (res.user.account_type === "ADMIN" || res.user.account_type === "STAFF")) {
        window.AdminPortal.init();
      }
    } catch (err) {
      const msg = err?.detail || err?.message || "Invalid credentials. Incorrect email/phone or password.";
      if (errBox) {
        errBox.innerHTML = `⚠️ <strong>Sign-in Failed:</strong> ${msg}`;
        errBox.style.display = "block";
      }
      API.showToast(`❌ ${msg}`, "error");
      if (btn) { btn.disabled = false; btn.textContent = "Sign In to Account 🔐"; }
    }
  },

  signupPhoneVerified: false,
  signupVerifiedPhone: "",
  signupOtpCode: "",

  showCustomerSignupModal() {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 380px; border-radius: 20px;">
        <div style="text-align: center; padding-top: 8px;">
          <img src="/static/img/rushpoint-logo-white-badge.png" onerror="this.onerror=null;this.src='img/rushpoint-logo.png'" style="height: 54px; width: 54px; border-radius: 14px; object-fit: contain; margin: 0 auto 8px; display: block; background: #FFFFFF; padding: 4px; box-shadow: 0 4px 14px rgba(0,0,0,0.18);" alt="RushPoint">
        </div>
        <div class="modal-header" style="padding-top: 0;">
          <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--blood-primary);">🛍️ Create Customer Account</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="font-size: 0.75rem; color: #64748B; margin-bottom: 12px;">
          Join RushPoint to order products, book instant courier dispatch, and track deliveries.
        </div>

        <div id="cust-signup-error" style="display: none; background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B; padding: 8px 10px; border-radius: 8px; font-size: 0.72rem; margin-bottom: 10px; font-weight: 600;"></div>

        <form onsubmit="MobileApp.handleCustomerSignup(event)">
          <div class="rp-form-group">
            <label class="rp-label">Full Name</label>
            <input type="text" id="cust-name" class="rp-input" placeholder="e.g. John Doe" required>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Email Address</label>
            <input type="email" id="cust-email" class="rp-input" placeholder="e.g. john@mail.com" required>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Phone Number</label>
            <input type="tel" id="cust-phone" class="rp-input" placeholder="+2348012345678" required>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Password</label>
            <input type="password" id="cust-pwd" class="rp-input" placeholder="Minimum 6 characters" required minlength="6">
          </div>

          <button type="submit" id="btn-cust-submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px; margin-top: 6px; font-weight: 800; border-radius: 12px;">
            Create Customer Account 🚀
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleCustomerSignup(e) {
    e.preventDefault();
    const full_name = document.getElementById("cust-name").value.trim();
    const email = document.getElementById("cust-email").value.trim();
    const phone = document.getElementById("cust-phone").value.trim();
    const password = document.getElementById("cust-pwd").value;
    const submitBtn = document.getElementById("btn-cust-submit");
    const errBox = document.getElementById("cust-signup-error");

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Creating Account… 🚀"; }
    if (errBox) errBox.style.display = "none";

    try {
      const res = await API.post("/api/auth/customer/signup", {
        full_name,
        email,
        phone,
        password
      });
      API.setToken(res.token);
      API.setUser(res.user);
      if (res.wallet) localStorage.setItem("rp_wallet", JSON.stringify(res.wallet));
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(`✅ Welcome, ${res.user.full_name}! Your account is ready.`, "success");
      if (typeof updateHeaderAuthBar === "function") updateHeaderAuthBar();
      this.render();
      if (window.AdminPortal && (res.user.account_type === "ADMIN" || res.user.account_type === "STAFF")) {
        window.AdminPortal.init();
      }
    } catch (err) {
      const msg = err?.detail || err?.message || "Registration failed. Please check your details.";
      API.showToast(`❌ ${msg}`, "error");
      if (errBox) { errBox.innerHTML = `⚠️ ${msg}`; errBox.style.display = "block"; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Create Customer Account 🚀"; }
    }
  },

  showChangePasswordModal() {
    const user = API.getUser();
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 360px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--blood-primary);">🔒 Security & Password</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        
        <div style="font-size: 0.75rem; color: #64748B; margin-bottom: 12px;">
          Update login password for <strong>${user ? user.full_name : 'your account'}</strong> (${user ? user.email : ''}).
        </div>

        <form onsubmit="MobileApp.handleChangePassword(event)">
          <div class="rp-form-group">
            <label class="rp-label">Current Password</label>
            <input type="password" id="cpwd-current" class="rp-input" placeholder="Enter current password" required>
          </div>
          <div class="rp-form-group">
            <label class="rp-label">New Password</label>
            <input type="password" id="cpwd-new" class="rp-input" placeholder="Minimum 6 characters" required minlength="6">
          </div>
          <div class="rp-form-group">
            <label class="rp-label">Confirm New Password</label>
            <input type="password" id="cpwd-confirm" class="rp-input" placeholder="Confirm new password" required minlength="6">
          </div>
          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px; margin-top: 8px; font-weight: 800;">
            Update Password 🔒
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleChangePassword(e) {
    e.preventDefault();
    const current_password = document.getElementById("cpwd-current").value;
    const new_password = document.getElementById("cpwd-new").value;
    const confirm_password = document.getElementById("cpwd-confirm").value;

    if (new_password !== confirm_password) {
      API.showToast("New passwords do not match", "error");
      return;
    }

    try {
      const res = await API.post("/api/auth/change-password", { current_password, new_password });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message || "Password updated successfully!", "success");
    } catch (err) {}
  },

  showUserProfileModal() {
    const user = API.getUser();
    if (!user) return;
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 380px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--blood-primary);">👤 Account Profile</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="background: linear-gradient(135deg, #450A0A, #B91C1C); border-radius: 14px; padding: 14px; color: #FFF; margin-bottom: 14px; display: flex; align-items: center; gap: 12px;">
          <div style="width: 48px; height: 48px; border-radius: 14px; background: #FFF; color: #B91C1C; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; font-weight: 900;">
            ${(user.full_name || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-weight: 900; font-size: 1rem;">${user.full_name}</div>
            <div style="font-size: 0.72rem; opacity: 0.85;">${user.role_name || user.account_type} • Ref: <code>${user.user_ref || 'RP-001'}</code></div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.8rem; margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #F8FAFC; border-radius: 8px;">
            <span style="color: #64748B;">Email Address:</span>
            <strong>${user.email}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #F8FAFC; border-radius: 8px;">
            <span style="color: #64748B;">Phone Number:</span>
            <strong>${user.phone || 'Not set'}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #F8FAFC; border-radius: 8px;">
            <span style="color: #64748B;">Account Status:</span>
            <span class="badge badge-${(user.status || 'active').toLowerCase()}">${user.status || 'ACTIVE'}</span>
          </div>
        </div>

        <button onclick="this.closest('.modal-backdrop').remove(); MobileApp.showChangePasswordModal();" class="btn-secondary" style="width: 100%; justify-content: center; padding: 10px; border-radius: 10px; font-weight: 800;">
          🔒 Change Password
        </button>
      </div>
    `;
    document.body.appendChild(modal);
  },

  // ==========================================
  // CUSTOMER ONLINE MARKETPLACE APP (OPay Style)
  // ==========================================
  async renderCustomerApp(container, user) {
    let wallet = { balance: 0.0 };
    let categories = [];
    let products = [];
    let stores = [];
    let orders = [];

    try {
      const wRes = await API.get("/api/finance/wallet/me", { silent: true });
      if (wRes && wRes.wallet) wallet = wRes.wallet;
      const cRes = await API.get("/api/categories/", { silent: true });
      if (cRes && cRes.categories) categories = cRes.categories;
      const pRes = await API.get("/api/products/", { silent: true });
      if (pRes && pRes.products) products = pRes.products;
      const sRes = await API.get("/api/marketplace/stores", { silent: true });
      if (sRes && sRes.stores) stores = sRes.stores;
      const oRes = await API.get("/api/orders/", { silent: true });
      if (oRes && oRes.orders) orders = oRes.orders;
    } catch (e) {}

    const cartCount = this.cart.reduce((sum, item) => sum + item.quantity, 0);

    // Default to 'home' if active tab is invalid
    if (!['home', 'shops', 'logistics', 'orders', 'cart', 'account', 'support'].includes(this.activeTab)) {
      this.activeTab = "home";
    }

    container.innerHTML = `
      <div class="mobile-app-shell">
        <!-- OPay Style Header (Dark-Light Blood Theme) -->
        <div class="mobile-app-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <!-- Hamburger Sidebar Trigger -->
            <button onclick="MobileApp.toggleDrawer(true)" style="background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.25); color: #FFF; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; cursor: pointer;">
              ☰
            </button>
            <div style="width: 36px; height: 36px; border-radius: 50%; background: #FFF; color: #B91C1C; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 0.95rem; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
              ${(user.full_name || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="font-weight: 800; font-size: 0.9rem; letter-spacing: -0.2px;">Hi, ${(user.full_name || 'Customer').split(' ')[0]} 👋</div>
              <div style="font-size: 0.65rem; opacity: 0.9; display: flex; align-items: center; gap: 3px;">
                <span>📍</span> <span>Katsina / Lagos Hub</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button onclick="MobileApp.switchTab('cart')" style="background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.25); color: #FFF; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative;">
              <span>🛒</span>
              ${cartCount > 0 ? `<span style="position: absolute; -top: 2px; -right: 2px; background: #FFF; color: #B91C1C; font-size: 0.62rem; font-weight: 900; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">${cartCount}</span>` : ''}
            </button>
            <button onclick="MobileApp.showHelpModal()" style="background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.25); color: #FFF; padding: 5px 9px; border-radius: 12px; font-size: 0.68rem; font-weight: 700; cursor: pointer;">
              Help 💬
            </button>
          </div>
        </div>

        <div class="mobile-content-area" id="mob-content-area">
          ${this.getCustomerTabHtml(categories, products, stores, wallet, user, orders)}
        </div>

        <!-- Floating Cart Summary Bar (When items in cart and not on cart tab) -->
        ${cartCount > 0 && this.activeTab !== 'cart' ? `
          <div style="position: absolute; bottom: 66px; left: 14px; right: 14px; background: linear-gradient(135deg, #7F1D1D 0%, #BE123C 100%); color: #FFF; padding: 10px 16px; border-radius: 14px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 8px 24px rgba(127,29,29,0.38); z-index: 100;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.2rem;">🛍️</span>
              <div>
                <div style="font-size: 0.82rem; font-weight: 800;">${cartCount} items in cart</div>
                <div style="font-size: 0.68rem; opacity: 0.9;">Ready for fast checkout</div>
              </div>
            </div>
            <button onclick="MobileApp.switchTab('cart')" style="background: #FFF; color: #881337; border: none; padding: 6px 14px; border-radius: 10px; font-weight: 900; font-size: 0.78rem; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
              Checkout ➔
            </button>
          </div>
        ` : ''}

        <!-- OPay Style 5-Tab Bottom Navigation -->
        <div class="mobile-bottom-nav">
          <button class="bottom-tab-btn ${this.activeTab === 'home' ? 'active' : ''}" onclick="MobileApp.switchTab('home')">
            <span class="bottom-tab-icon">🏪</span>
            <span>Market</span>
          </button>
          <button class="bottom-tab-btn ${this.activeTab === 'shops' ? 'active' : ''}" onclick="MobileApp.switchTab('shops')">
            <span class="bottom-tab-icon">🏬</span>
            <span>Shops</span>
          </button>
          <button class="bottom-tab-btn ${this.activeTab === 'logistics' ? 'active' : ''}" onclick="MobileApp.switchTab('logistics')">
            <span class="bottom-tab-icon">📦</span>
            <span>Parcel</span>
          </button>
          <button class="bottom-tab-btn ${this.activeTab === 'orders' ? 'active' : ''}" onclick="MobileApp.switchTab('orders')">
            <span class="bottom-tab-icon">📋</span>
            <span>Orders</span>
          </button>
          <button class="bottom-tab-btn ${this.activeTab === 'account' ? 'active' : ''}" onclick="MobileApp.switchTab('account')">
            <span class="bottom-tab-icon">👤</span>
            <span>Account</span>
          </button>
        </div>

        <!-- Professional Slide-out Drawer Sidebar -->
        <div class="mobile-drawer-overlay" id="mobile-sidebar-drawer" onclick="if(event.target === this) MobileApp.toggleDrawer(false)">
          <div class="mobile-drawer">
            <div class="mobile-drawer-header">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div style="width: 44px; height: 44px; border-radius: 12px; background: #FFF; color: #B91C1C; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 900; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
                    ${(user.full_name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style="font-weight: 900; font-size: 0.95rem; color: #FFF;">${user.full_name}</div>
                    <div style="font-size: 0.68rem; opacity: 0.85; color: #FEE2E2;">${user.email}</div>
                  </div>
                </div>
                <button onclick="MobileApp.toggleDrawer(false)" style="background: rgba(255,255,255,0.2); border: none; color: #FFF; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 0.8rem;">✕</button>
              </div>

              <div style="background: rgba(0,0,0,0.25); border-radius: 12px; padding: 10px; margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-size: 0.64rem; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.5px;">Wallet Balance</div>
                  <div style="font-size: 1.1rem; font-weight: 900; color: #FFF;">₦${wallet.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                </div>
                <button onclick="MobileApp.toggleDrawer(false); MobileApp.showTopUpModal(${wallet.balance})" style="background: #FFF; color: #B91C1C; border: none; padding: 4px 10px; border-radius: 8px; font-size: 0.68rem; font-weight: 800; cursor: pointer;">
                  + Top Up
                </button>
              </div>
            </div>

            <div class="mobile-drawer-menu">
              <!-- User Profile Summary Pill -->
              <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:0.72rem;font-weight:800;color:var(--blood-dark);">👤 Customer Profile</span>
                  <span class="badge badge-active" style="font-size:0.58rem;">ACTIVE</span>
                </div>
                <div style="font-size:0.68rem;color:#64748B;margin-top:4px;">
                  Phone: <strong>${user.phone || 'Not set'}</strong> • Ref: <code>${user.user_ref || 'RP-CUST'}</code>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px;">
                  <button onclick="MobileApp.toggleDrawer(false); MobileApp.showUserProfileModal();" class="btn-secondary btn-sm" style="flex:1;font-size:0.65rem;padding:4px;justify-content:center;">
                    👤 View Profile
                  </button>
                  <button onclick="MobileApp.toggleDrawer(false); MobileApp.showChangePasswordModal();" class="btn-secondary btn-sm" style="flex:1;font-size:0.65rem;padding:4px;justify-content:center;color:var(--blood-primary);border-color:var(--blood-border);">
                    🔒 Password
                  </button>
                </div>
              </div>

              <div class="mobile-drawer-section-title">Marketplace Navigation</div>
              <div class="mobile-drawer-item ${this.activeTab === 'home' ? 'active' : ''}" onclick="MobileApp.toggleDrawer(false); MobileApp.switchTab('home');">
                <span class="mobile-drawer-icon">🏪</span> <span>Market Promenade</span>
              </div>
              <div class="mobile-drawer-item ${this.activeTab === 'shops' ? 'active' : ''}" onclick="MobileApp.toggleDrawer(false); MobileApp.switchTab('shops');">
                <span class="mobile-drawer-icon">🏬</span> <span>Physical Merchant Stalls</span>
              </div>
              <div class="mobile-drawer-item ${this.activeTab === 'logistics' ? 'active' : ''}" onclick="MobileApp.toggleDrawer(false); MobileApp.switchTab('logistics');">
                <span class="mobile-drawer-icon">📦</span> <span>Waybill & Parcel Dispatch</span>
              </div>
              <div class="mobile-drawer-item ${this.activeTab === 'orders' ? 'active' : ''}" onclick="MobileApp.toggleDrawer(false); MobileApp.switchTab('orders');">
                <span class="mobile-drawer-icon">📋</span> <span>My Orders & Live Tracking</span>
              </div>
              <div class="mobile-drawer-item ${this.activeTab === 'cart' ? 'active' : ''}" onclick="MobileApp.toggleDrawer(false); MobileApp.switchTab('cart');">
                <span class="mobile-drawer-icon">🛒</span> <span>Cart (${cartCount} items)</span>
              </div>

              <div class="mobile-drawer-section-title">Security & Account</div>
              <div class="mobile-drawer-item ${this.activeTab === 'account' ? 'active' : ''}" onclick="MobileApp.toggleDrawer(false); MobileApp.switchTab('account');">
                <span class="mobile-drawer-icon">👤</span> <span>Account & Bank Profile</span>
              </div>
              <div class="mobile-drawer-item ${this.activeTab === 'support' ? 'active' : ''}" onclick="MobileApp.toggleDrawer(false); MobileApp.switchTab('support');">
                <span class="mobile-drawer-icon">💬</span> <span>Support & Live Help</span>
              </div>
            </div>

            <div style="padding: 12px 14px; border-top: 1px solid #E2E8F0; background: #F8FAFC;">
              <button onclick="API.logout(); window.location.reload();" class="btn-danger btn-sm" style="width: 100%; justify-content: center; padding: 9px; border-radius: 10px; font-weight: 800;">
                🚪 Sign Out
              </button>
              <div style="text-align: center; font-size: 0.62rem; color: #94A3B8; margin-top: 8px;">
                RushPoint V1.0 • 256-Bit SSL Encrypted
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  toggleDrawer(open) {
    const drawer = document.getElementById("mobile-sidebar-drawer");
    if (drawer) {
      if (open) {
        drawer.classList.add("open");
      } else {
        drawer.classList.remove("open");
      }
    }
  },

  switchTab(tab) {
    this.activeTab = tab;
    this.render();
  },

  getCustomerTabHtml(categories, products, stores, wallet, user, orders = []) {
    if (this.activeTab === "home") {
      if (this.browsingMode === "storefront" && this.viewingStore) {
        return this.renderStorefrontView(products);
      }

      let filtered = products;
      if (this.selectedCategory) {
        filtered = filtered.filter(p => p.category_id === this.selectedCategory);
      }
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        filtered = filtered.filter(p => 
          p.name.toLowerCase().includes(q) || 
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.store_name && p.store_name.toLowerCase().includes(q)) ||
          (p.category_name && p.category_name.toLowerCase().includes(q))
        );
      }

      return `
        <!-- OPay Hero Wallet Card -->
        <div class="opay-wallet-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div style="font-size: 0.72rem; font-weight: 700; opacity: 0.85; letter-spacing: 0.5px; text-transform: uppercase;">Total Wallet Balance</div>
            <span style="background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 20px; font-size: 0.65rem; font-weight: 700;">🔒 Tier-3 Verified</span>
          </div>
          <div style="font-size: 1.65rem; font-weight: 900; letter-spacing: -0.5px; margin: 4px 0 12px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>${MobileApp.hideBalance ? '••••••••' : '₦' + wallet.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              <button onclick="MobileApp.toggleBalanceVisibility()" style="background: rgba(255,255,255,0.18); border: none; border-radius: 8px; color: #FFF; padding: 4px 7px; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center;" title="Toggle balance visibility">
                ${MobileApp.hideBalance ? '🙈' : '👁️'}
              </button>
            </div>
            <span style="font-size: 0.65rem; background: rgba(0,0,0,0.22); padding: 3px 8px; border-radius: 8px; font-weight: 700; opacity: 0.9;">Wema Bank Escrow</span>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; border-top: 1px solid rgba(255,255,255,0.12); padding-top: 10px;">
            <button onclick="MobileApp.showTopUpModal(${wallet.balance})" style="background: #B91C1C; color: #FFF; border: none; padding: 7px 10px; border-radius: 10px; font-size: 0.72rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span>➕</span> <span>Add Money</span>
            </button>
            <button onclick="MobileApp.switchTab('logistics')" style="background: rgba(255,255,255,0.15); color: #FFF; border: 1px solid rgba(255,255,255,0.2); padding: 7px 10px; border-radius: 10px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span>📦</span> <span>Send Parcel</span>
            </button>
            <button onclick="MobileApp.switchTab('orders')" style="background: rgba(255,255,255,0.15); color: #FFF; border: 1px solid rgba(255,255,255,0.2); padding: 7px 10px; border-radius: 10px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span>📜</span> <span>History</span>
            </button>
          </div>
        </div>

        <!-- OPay Quick Action Services Grid -->
        <div class="opay-quick-actions">
          <button class="opay-action-item" onclick="MobileApp.filterByCategory('')">
            <div class="opay-action-icon" style="background: #FEE2E2; color: #B91C1C;">🏛️</div>
            <span class="opay-action-label">Market Plaza</span>
          </button>
          <button class="opay-action-item" onclick="MobileApp.switchTab('shops')">
            <div class="opay-action-icon" style="background: #EDE9FE; color: #7C3AED;">🏬</div>
            <span class="opay-action-label">Shops</span>
          </button>
          <button class="opay-action-item" onclick="MobileApp.switchTab('logistics')">
            <div class="opay-action-icon" style="background: #FEF3C7; color: #D97706;">📦</div>
            <span class="opay-action-label">Waybill</span>
          </button>
          <button class="opay-action-item" onclick="MobileApp.switchTab('support')">
            <div class="opay-action-icon" style="background: #ECFDF5; color: #059669;">💬</div>
            <span class="opay-action-label">Help Desk</span>
          </button>
        </div>

        <!-- Search Input -->
        <div style="position: relative; margin-bottom: 12px;">
          <input type="text" placeholder="Search physical stores, building blocks, rice, parcels..." class="rp-input" style="padding-left: 36px; border-radius: 24px; font-size: 0.8rem; background: #FFF; border: 1px solid #E2E8F0; box-shadow: 0 1px 3px rgba(0,0,0,0.03);" oninput="MobileApp.handleSearch(this.value)" value="${this.searchQuery}">
          <span style="position: absolute; left: 12px; top: 9px; font-size: 0.9rem; color: #94A3B8;">🔍</span>
        </div>

        <!-- Category Horizontal Filter Chips -->
        <div style="margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 0.78rem; font-weight: 800; color: #1E293B;">Market Sectors</span>
            ${this.selectedCategory ? `<span onclick="MobileApp.filterByCategory('')" style="font-size: 0.68rem; color: #B91C1C; font-weight: 800; cursor: pointer;">Reset ✕</span>` : ''}
          </div>
          <div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px;">
            <div onclick="MobileApp.filterByCategory('')" style="background: ${this.selectedCategory === '' ? '#B91C1C' : '#FFF'}; color: ${this.selectedCategory === '' ? '#FFF' : '#475569'}; border: 1px solid ${this.selectedCategory === '' ? '#B91C1C' : '#E2E8F0'}; padding: 5px 12px; border-radius: 20px; font-size: 0.72rem; font-weight: 700; white-space: nowrap; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
              🌟 All Goods
            </div>
            ${categories.map(c => `
              <div onclick="MobileApp.filterByCategory('${c.id}')" style="background: ${this.selectedCategory === c.id ? '#B91C1C' : '#FFF'}; color: ${this.selectedCategory === c.id ? '#FFF' : '#475569'}; border: 1px solid ${this.selectedCategory === c.id ? '#B91C1C' : '#E2E8F0'}; padding: 5px 12px; border-radius: 20px; font-size: 0.72rem; font-weight: 700; white-space: nowrap; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                ${c.name}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Featured Physical Stalls Horizontal Carousel -->
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 0.8rem; font-weight: 800; color: #1E293B;">🏬 Featured Merchant Stalls</span>
            <span onclick="MobileApp.switchTab('shops')" style="font-size: 0.7rem; color: #B91C1C; font-weight: 800; cursor: pointer;">View All →</span>
          </div>
          <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px;">
            ${stores.map(s => `
              <div onclick="MobileApp.enterVendorStore('${s.id}')" style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 10px 12px; min-width: 155px; flex-shrink: 0; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.03); transition: transform 0.15s;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                  <div style="width: 26px; height: 26px; border-radius: 8px; background: #FEE2E2; color: #B91C1C; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 900;">🏪</div>
                  <span class="badge badge-active" style="font-size: 0.58rem; padding: 1px 4px;">Verified</span>
                </div>
                <div style="font-weight: 800; font-size: 0.82rem; color: #1E293B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.store_name}</div>
                <div style="font-size: 0.65rem; color: #64748B; margin-top: 2px;">📍 ${(s.address || 'Katsina / Lagos').split(',')[0]}</div>
                <div style="font-size: 0.68rem; color: #B91C1C; font-weight: 800; margin-top: 6px;">Enter Stall 🚪</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Products 2-Column Grid -->
        <div style="margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-size: 0.82rem; font-weight: 800; color: #1E293B;">Market Shelf Promenade (${filtered.length})</div>
            <span style="font-size: 0.65rem; color: #64748B;">All Verified Stalls</span>
          </div>
          <div class="product-grid-mobile">
            ${filtered.map(p => {
              const nameLower = (p.name || '').toLowerCase();
              const descLower = (p.description || '').toLowerCase();
              const catLower = (p.category_id || '').toLowerCase();
              const isHeavy = catLower === 'cat-build' || catLower === 'cat-land' || ['cement', 'block', 'steel', 'rod', 'iron', 'sandcrete', 'tonne', 'heavy', 'generator'].some(k => nameLower.includes(k) || descLower.includes(k));

              return `
                <div class="product-card-mobile" style="border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: 0 2px 6px rgba(0,0,0,0.02); display: flex; flex-direction: column;">
                  <div class="product-img-box" onclick="MobileApp.showProductDetailModal('${p.id}')" style="cursor: pointer; height: 125px; position: relative;">
                    <img src="${p.image_url}" alt="${p.name}" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'">
                    ${p.stock_qty <= 0 ? '<span style="position: absolute; top: 6px; right: 6px; background: #EF4444; color: #FFF; font-size: 0.58rem; font-weight: 800; padding: 2px 6px; border-radius: 10px;">Out of Stock</span>' : ''}
                    <span style="position: absolute; bottom: 6px; left: 6px; background: ${isHeavy ? '#7F1D1D' : '#059669'}; color: #FFF; font-size: 0.55rem; font-weight: 800; padding: 2px 6px; border-radius: 8px;">
                      ${isHeavy ? '🛺 Heavy (Tricycle)' : '🏍️ Standard Bike'}
                    </span>
                  </div>
                  <div class="product-info-box" style="padding: 10px; display: flex; flex-direction: column; flex: 1; justify-content: space-between;">
                    <div>
                      <!-- Physical Shop & Location Attribution -->
                      <div class="product-store" onclick="MobileApp.enterVendorStore('${p.store_id}')" style="cursor: pointer; font-weight: 800; font-size: 0.68rem; color: #B91C1C; display: flex; align-items: center; justify-content: space-between;">
                        <span>🏪 ${p.store_name}</span>
                        <span style="font-size: 0.6rem; text-decoration: underline;">Stall 🚪</span>
                      </div>
                      <div style="font-size: 0.6rem; color: #94A3B8; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        📍 ${(p.store_address || 'Katsina / Lagos Hub').split(',')[0]}
                      </div>

                      <div class="product-name" onclick="MobileApp.showProductDetailModal('${p.id}')" style="cursor: pointer; margin-top: 4px; font-size: 0.8rem; font-weight: 800; color: #1E293B; line-height: 1.2;">
                        ${p.name}
                      </div>
                    </div>
                    
                    <div class="product-price-row" style="margin-top: 8px;">
                      <div>
                        <div class="product-price" style="color: #B91C1C; font-size: 0.9rem; font-weight: 900;">₦${(p.discount_price || p.price).toLocaleString()}</div>
                        <div style="font-size: 0.58rem; color: #64748B;">Est. Delivery: ${isHeavy ? '₦2,700 (Keke)' : '₦1,200'}</div>
                      </div>
                      <button class="btn-add-cart" onclick="MobileApp.addToCart('${p.id}', '${p.name.replace(/'/g, "\\'")}', ${p.discount_price || p.price}, '${p.store_id}', ${isHeavy})" ${p.stock_qty <= 0 ? 'disabled' : ''} style="width: 32px; height: 32px; border-radius: 10px; background: #B91C1C; box-shadow: 0 2px 6px rgba(185, 28, 28, 0.3); font-size: 1.1rem;">
                        +
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    if (this.activeTab === "shops") {
      return `
        <div>
          <div style="font-size: 0.95rem; font-weight: 800; color: #1E293B; margin-bottom: 4px;">🏬 Physical Merchants & Stalls</div>
          <p style="font-size: 0.72rem; color: #64748B; margin-bottom: 12px;">Step directly into any registered physical shop to browse all their products.</p>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${stores.map(s => `
              <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div style="display: flex; gap: 12px; align-items: center;">
                    <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #FEE2E2, #FECACA); color: #B91C1C; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 900;">
                      🏪
                    </div>
                    <div>
                      <div style="font-weight: 800; font-size: 0.92rem; color: #1E293B;">${s.store_name}</div>
                      <div style="font-size: 0.7rem; color: #64748B; margin-top: 1px;">🏷️ ${s.category}</div>
                      <div style="font-size: 0.68rem; color: #94A3B8; margin-top: 2px;">📍 ${s.address}</div>
                    </div>
                  </div>
                  <span class="badge badge-active" style="font-size: 0.62rem;">Verified</span>
                </div>
                <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #E2E8F0; padding-top: 10px;">
                  <span style="font-size: 0.72rem; color: #B91C1C; font-weight: 800;">${s.total_products || 0} items in stock</span>
                  <button onclick="MobileApp.enterVendorStore('${s.id}')" class="btn-primary btn-sm" style="padding: 7px 16px; border-radius: 10px; font-size: 0.75rem; background: #B91C1C;">
                    🚪 Step Inside Shop
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (this.activeTab === "cart") {
      this.initCheckoutMiniMap();
      return this.getCartHtml();
    }
    if (this.activeTab === "orders") return this.getCustomerOrdersHtml(orders);
    if (this.activeTab === "logistics") return this.getIndependentLogisticsHtml();
    if (this.activeTab === "support") return this.getCustomerSupportHtml();
    if (this.activeTab === "account") return this.getCustomerAccountHtml(wallet, user);

    return `<div>Loading...</div>`;
  },

  addToCart(productId, name, price, storeId, isHeavy = false) {
    const existing = this.cart.find(i => i.product_id === productId);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.cart.push({ product_id: productId, name, price, store_id: storeId, quantity: 1, is_heavy: isHeavy });
    }
    API.showToast(`Added '${name}' to cart!`, "success");
    this.render();
  },



  getCustomerAccountHtml(wallet, user) {
    return `
      <div>
        <div style="font-size: 0.95rem; font-weight: 800; color: #1E293B; margin-bottom: 12px;">👤 My Account & Profile</div>

        <!-- User Profile Card -->
        <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 18px; padding: 16px; margin-bottom: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, #7F1D1D, #B91C1C); color: #FFF; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; font-weight: 900;">
              ${(user.full_name || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="font-weight: 800; font-size: 1rem; color: #1E293B;">${user.full_name}</div>
              <div style="font-size: 0.75rem; color: #64748B;">${user.email}</div>
              <div style="font-size: 0.72rem; color: #94A3B8;">${user.phone || '+2348000000000'}</div>
            </div>
          </div>
        </div>

        <!-- Wallet Card -->
        <div class="opay-wallet-card" style="margin-bottom: 14px;">
          <div style="font-size: 0.72rem; font-weight: 700; opacity: 0.85; text-transform: uppercase;">Available In-App Wallet</div>
          <div style="font-size: 1.5rem; font-weight: 900; margin: 4px 0 10px;">
            ₦${wallet.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
          <button onclick="MobileApp.showTopUpModal(${wallet.balance})" style="background: #FFF; color: #B91C1C; border: none; width: 100%; padding: 9px; border-radius: 10px; font-weight: 800; font-size: 0.78rem; cursor: pointer;">
            ➕ Top Up Wallet Balance
          </button>
        </div>

        <!-- Account Security & Profile Actions -->
        <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 14px; margin-bottom: 14px;">
          <div style="font-weight: 800; font-size: 0.82rem; color: #1E293B; margin-bottom: 8px;">🔐 Account & Security Settings</div>
          <div style="display: flex; gap: 8px;">
            <button onclick="MobileApp.showUserProfileModal()" class="btn-secondary btn-sm" style="flex: 1; padding: 9px 6px; font-size: 0.72rem; font-weight: 700; justify-content: center;">
              👤 My Profile
            </button>
            <button onclick="MobileApp.showChangePasswordModal()" class="btn-secondary btn-sm" style="flex: 1; padding: 9px 6px; font-size: 0.72rem; font-weight: 700; justify-content: center; color: var(--blood-primary); border-color: var(--blood-border);">
              🔒 Change Password
            </button>
          </div>
        </div>

        <!-- Logout Button -->
        <button onclick="API.logout(); window.location.reload();" class="btn-danger" style="width: 100%; justify-content: center; padding: 12px; border-radius: 14px; font-weight: 800;">
          Sign Out of Account 🚪
        </button>
      </div>
    `;
  },

  showRoleSwitchModal() {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 360px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1rem; font-weight: 800; color: #1E293B;">Switch Account</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <div style="padding: 6px 0 10px;">
          <p style="font-size: 0.78rem; color: #64748B; margin-bottom: 14px;">
            To access a different Customer, Vendor, or Rider account, sign out and enter your credentials.
          </p>
          <button onclick="document.querySelector('.rp-modal-overlay')?.remove(); API.logout(); window.location.reload();" class="btn-danger" style="width: 100%; justify-content: center; padding: 11px; border-radius: 12px; font-weight: 800;">
            🚪 Sign Out & Log In to Another Account
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  // ==========================================
  // DEDICATED VENDOR STOREFRONT / STALL VIEW
  // ==========================================
  renderStorefrontView(allProducts) {
    const s = this.viewingStore;
    const storeProducts = allProducts.filter(p => p.store_id === s.id);

    return `
      <div>
        <!-- Back Navigation Header -->
        <button onclick="MobileApp.exitStorefront()" class="btn-secondary btn-sm" style="margin-bottom: 10px; width: 100%; justify-content: center; padding: 8px; font-weight: 800; border-radius: 12px;">
          ← Step Out to Central Market Promenade
        </button>

        <!-- Shop Signboard Banner -->
        <div style="background: linear-gradient(135deg, #7F1D1D 0%, #B91C1C 100%); color: #FFF; border-radius: 18px; padding: 16px; margin-bottom: 14px; box-shadow: 0 4px 12px rgba(185, 28, 28, 0.25);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 48px; height: 48px; background: #FFF; color: #B91C1C; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 900; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
              🏪
            </div>
            <div>
              <div style="font-weight: 900; font-size: 1.1rem; letter-spacing: -0.3px;">${s.store_name}</div>
              <div style="font-size: 0.72rem; opacity: 0.9;">🏷️ Sector: ${s.category}</div>
            </div>
          </div>

          <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 0.74rem;">
            <div>📍 <strong>Physical Stall / Address:</strong> ${s.address}</div>
            <div style="margin-top: 2px;">⚡ Direct delivery & site dispatch available from this merchant</div>
          </div>
        </div>

        <!-- Vendor Stall Shelf Goods -->
        <div style="margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-size: 0.85rem; font-weight: 800; color: #1E293B;">
              Shelf Goods at ${s.store_name} (${storeProducts.length})
            </div>
          </div>

          <div class="product-grid-mobile">
            ${storeProducts.map(p => `
              <div class="product-card-mobile" style="border-radius: 16px; border: 1px solid #E2E8F0;">
                <div class="product-img-box" onclick="MobileApp.showProductDetailModal('${p.id}')" style="cursor: pointer; height: 120px;">
                  <img src="${p.image_url}" alt="${p.name}" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'">
                </div>
                <div class="product-info-box" style="padding: 10px;">
                  <div class="product-name" onclick="MobileApp.showProductDetailModal('${p.id}')" style="cursor: pointer; font-size: 0.8rem; font-weight: 800;">
                    ${p.name}
                  </div>
                  <div style="font-size: 0.65rem; color: #64748B; margin-top: 2px;">
                    ${p.stock_qty > 0 ? `In Stock (${p.stock_qty})` : '<span style="color:red; font-weight:700;">Out of Stock</span>'}
                  </div>
                  <div class="product-price-row" style="margin-top: 8px;">
                    <div class="product-price" style="color: #B91C1C; font-weight: 900;">₦${(p.discount_price || p.price).toLocaleString()}</div>
                    <button class="btn-add-cart" onclick="MobileApp.addToCart('${p.id}', '${p.name.replace(/'/g, "\\'")}', ${p.discount_price || p.price}, '${p.store_id}')" ${p.stock_qty <= 0 ? 'disabled' : ''} style="width: 28px; height: 28px; border-radius: 8px; background: #B91C1C;">
                      +
                    </button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  },

  async enterVendorStore(storeId) {
    try {
      const res = await API.get(`/api/marketplace/stores/${storeId}`);
      this.viewingStore = res.store;
      this.browsingMode = "storefront";
      this.render();
    } catch (e) {}
  },

  exitStorefront() {
    this.browsingMode = "all";
    this.viewingStore = null;
    this.render();
  },

  setBrowsingMode(mode) {
    this.browsingMode = mode;
    this.viewingStore = null;
    this.render();
  },

  handleSearch(val) {
    this.searchQuery = val;
    this.render();
  },

  filterByCategory(catId) {
    this.selectedCategory = catId;
    this.render();
  },

  showProductDetailModal(productId) {
    API.get(`/api/products/${productId}`).then(res => {
      const p = res.product;
      const modal = document.createElement("div");
      modal.className = "modal-backdrop rp-modal-overlay";
      modal.innerHTML = `
        <div class="modal-dialog" style="max-width: 360px; border-radius: 20px;">
          <div class="modal-header">
            <h3 style="font-size: 1rem; font-weight: 800; color: #1E293B;">${p.name}</h3>
            <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
          </div>
          <img src="${p.image_url}" style="width: 100%; height: 160px; object-fit: cover; border-radius: 14px; margin-bottom: 12px;" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'">
          
          <!-- Vendor Location Box -->
          <div style="background: #FFF5F5; border: 1px solid #FECACA; border-radius: 12px; padding: 10px 12px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.8rem; font-weight: 800; color: #7F1D1D;">🏪 ${p.store_name}</span>
              <button onclick="MobileApp.enterVendorStore('${p.store_id}'); document.querySelector('.rp-modal-overlay')?.remove();" class="btn-secondary btn-sm" style="font-size: 0.65rem; padding: 3px 8px; border-radius: 8px;">
                Visit Store
              </button>
            </div>
            <div style="font-size: 0.72rem; color: #64748B; margin-top: 4px;">
              📍 <strong>Location:</strong> ${p.store_address || 'Katsina / Lagos, Nigeria'}
            </div>
          </div>

          <div style="font-size: 0.75rem; color: #64748B; margin-bottom: 10px;">${p.description || 'Verified authentic vendor product.'}</div>
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
            <span>Category: <strong>${p.category_name}</strong></span>
            <span>SKU: <strong>${p.sku || 'N/A'}</strong></span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 12px;">
            <span>In Stock: <strong>${p.stock_qty}</strong></span>
            <span style="color: #059669; font-weight: 700;">✓ Ready for dispatch</span>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #E2E8F0; padding-top: 12px;">
            <div style="font-size: 1.25rem; font-weight: 900; color: #B91C1C;">₦${(p.discount_price || p.price).toLocaleString()}</div>
            <button onclick="MobileApp.addToCart('${p.id}', '${p.name.replace(/'/g, "\\'")}', ${p.discount_price || p.price}, '${p.store_id}'); document.querySelector('.rp-modal-overlay')?.remove();" class="btn-primary" style="padding: 10px 18px; border-radius: 12px; background: #B91C1C; font-weight: 800;">
              Add to Cart 🛒
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    });
  },

  addToCart(productId, name, price, storeId) {
    const existing = this.cart.find(i => i.product_id === productId);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.cart.push({ product_id: productId, name, price, store_id: storeId, quantity: 1 });
    }
    API.showToast(`Added '${name}' to cart!`, "success");
    this.render();
  },

  getCartHtml() {
    if (this.cart.length === 0) {
      return `
        <div style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 3rem; margin-bottom: 10px;">🛒</div>
          <h3 style="font-size: 1rem; font-weight: 800; color: #1E293B;">Your Cart is Empty</h3>
          <p style="font-size: 0.78rem; color: #64748B; margin-top: 4px;">Explore multi-vendor stores and add items to your cart.</p>
          <button onclick="MobileApp.switchTab('home')" class="btn-primary" style="margin-top: 14px; border-radius: 12px; padding: 10px 20px; background: #B91C1C;">Browse Products</button>
        </div>
      `;
    }

    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalQty = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const deliveryFee = this.deliveryFee || 1200.0;
    const total = subtotal + deliveryFee;

    // Temu-style Recommended Items (Frequently Bought Together)
    const recommendedItems = [
      { id: "rec-1", name: "Family Fresh Bread", price: 1200, origPrice: 1500, discount: "-20%", rating: "4.9", sold: "128 sold", img: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200", store_id: this.cart[0]?.store_id },
      { id: "rec-2", name: "Premium Honey Jar (500g)", price: 2200, origPrice: 2800, discount: "-21%", rating: "5.0", sold: "86 sold", img: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=200", store_id: this.cart[0]?.store_id },
      { id: "rec-3", name: "Cold Malt Energy Can", price: 650, origPrice: 800, discount: "-18%", rating: "4.8", sold: "240 sold", img: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=200", store_id: this.cart[0]?.store_id }
    ];

    return `
      <div style="display: flex; flex-direction: column; height: 100%;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-size: 0.95rem; font-weight: 800; color: #1E293B;">Review Shopping Cart (${this.cart.length})</div>
          <span style="font-size: 0.65rem; background: #FEF2F2; color: #B91C1C; padding: 2px 8px; border-radius: 10px; font-weight: 800;">⚡ 15-30 Min Dispatch</span>
        </div>

        <div style="flex: 1; overflow-y: auto; padding-bottom: 20px;">
          <!-- Cart Items -->
          ${this.cart.map((item, idx) => `
            <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <div>
                <div style="font-size: 0.82rem; font-weight: 800; color: #1E293B;">${item.name}</div>
                <div style="font-size: 0.75rem; color: #B91C1C; font-weight: 800; margin-top: 2px;">₦${item.price.toLocaleString()} x ${item.quantity} = ₦${(item.price * item.quantity).toLocaleString()}</div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <button onclick="MobileApp.updateCartQty(${idx}, -1)" class="btn-secondary btn-sm" style="padding: 3px 10px; border-radius: 8px; font-weight: 800;">-</button>
                <span style="font-weight: 800; font-size: 0.85rem;">${item.quantity}</span>
                <button onclick="MobileApp.updateCartQty(${idx}, 1)" class="btn-secondary btn-sm" style="padding: 3px 10px; border-radius: 8px; font-weight: 800;">+</button>
              </div>
            </div>
          `).join('')}

          <!-- Temu-Style Consumer Trust & Escrow Guarantee Card -->
          <div style="background: linear-gradient(135deg, #FEF2F2 0%, #FFFBEB 100%); border: 1px solid #FECACA; border-radius: 14px; padding: 12px; margin-top: 10px; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="font-size: 1.15rem;">🛡️</span>
              <div>
                <div style="font-size: 0.8rem; font-weight: 900; color: #991B1B;">RushPoint 100% Escrow Guarantee</div>
                <div style="font-size: 0.62rem; color: #059669; font-weight: 700;">Zero Risk • Delivered Safely or Instant Refund</div>
              </div>
            </div>
            <div style="font-size: 0.68rem; color: #475569; line-height: 1.45;">
              • <strong>4-Digit Delivery PIN:</strong> Payment remains locked in escrow until you inspect your items and share your PIN.<br>
              • <strong>Guaranteed On-Time:</strong> Arrives within estimated window or receive ₦300 wallet compensation credit.<br>
              • <strong>Missing Item Protection:</strong> 100% instant refund for damaged or unavailable products.
            </div>
          </div>

          <!-- Dynamic Distance & Pricing Breakdown -->
          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 14px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.02);">
            <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 6px;">
              <span style="color: #64748B;">Items Subtotal (${totalQty} units):</span>
              <strong>₦${subtotal.toLocaleString()}</strong>
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 6px;">
              <div>
                <span>Delivery Fee:</span>
                <div id="checkout-formula-badge" style="font-size: 0.62rem; color: #059669; font-weight: 700;">Calculated by real road distance${this.cart.length > 1 ? ` (+${((this.cart.length - 1) * 0.2).toFixed(1)}% multi-item)` : ''}${totalQty > 5 ? ' (+4% bulk qty)' : ''}</div>
              </div>
              <strong id="checkout-delivery-fee-val" style="color: #B91C1C;">₦${deliveryFee.toLocaleString()}</strong>
            </div>

            <div id="checkout-distance-badge" style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 6px 10px; font-size: 0.7rem; color: #1E40AF; margin: 8px 0;">
              🛣️ <strong>${this.deliveryDistanceKm} km</strong> road distance • ~<strong>${this.deliveryDurationMin} mins</strong> arrival
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 1rem; font-weight: 900; color: #B91C1C; border-top: 1px solid #E2E8F0; padding-top: 8px; margin-top: 8px;">
              <span>Total to Pay:</span>
              <span id="checkout-total-val">₦${total.toLocaleString()}</span>
            </div>
          </div>

          <!-- Address & Map Location Alignment -->
          <div class="rp-form-group" style="margin-bottom: 12px;">
            <label class="rp-label" style="display: flex; justify-content: space-between;">
              <span>Delivery Address</span>
              <span style="font-size: 0.62rem; color: #2563EB; font-weight: 700;">🗺️ Aligns with Live GPS Map</span>
            </label>
            <input type="text" id="checkout-address" class="rp-input" value="${this.deliveryAddress}" oninput="MobileApp.onAddressTyped(this.value)" placeholder="Type street, landmark, or area" style="border-radius: 10px;">
            
            <!-- Quick Saved Delivery Addresses -->
            <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
              <button type="button" onclick="MobileApp.selectSavedAddress('GRA Residential Main Road, Katsina', 12.9820, 7.5950)" style="flex:1; background: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 6px; border-radius: 8px; font-size: 0.68rem; font-weight: 800; color: #1E293B; cursor: pointer; white-space:nowrap;">🏠 Home (GRA)</button>
              <button type="button" onclick="MobileApp.selectSavedAddress('UMYU University Campus, Katsina', 12.8950, 7.6320)" style="flex:1; background: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 6px; border-radius: 8px; font-size: 0.68rem; font-weight: 800; color: #1E293B; cursor: pointer; white-space:nowrap;">🏫 Campus (UMYU)</button>
              <button type="button" onclick="MobileApp.selectSavedAddress('Katsina Central Commercial Market', 12.9908, 7.6018)" style="flex:1; background: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 6px; border-radius: 8px; font-size: 0.68rem; font-weight: 800; color: #1E293B; cursor: pointer; white-space:nowrap;">🏬 Market Hub</button>
            </div>

            <button type="button" onclick="MobileApp.useCustomerDeviceGps('checkout-address')" style="margin-top: 6px; background: #EFF6FF; border: 1px dashed #2563EB; color: #1D4ED8; font-size: 0.68rem; font-weight: 700; padding: 6px 10px; border-radius: 8px; cursor: pointer; width: 100%; display: flex; align-items: center; justify-content: center; gap: 5px;">
              📍 Use My Device GPS Location (Auto-Detect)
            </button>

            <!-- Interactive Checkout Mini-Map -->
            <div style="margin-top: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: #64748B; margin-bottom: 4px;">
                <span>📍 Live Route Pin (Drag pin or click map to adjust dropoff)</span>
                <span style="color: #059669; font-weight: 700;">Auto-Calculating Fee</span>
              </div>
              <div id="checkout-mini-map" style="height: 140px; border-radius: 12px; border: 1px solid #CBD5E1; overflow: hidden; background: #E2E8F0;"></div>
            </div>
          </div>

          <div class="rp-form-group" style="margin-bottom: 14px;">
            <label class="rp-label">Customer Contact Phone</label>
            <input type="tel" id="checkout-phone" class="rp-input" value="+2348077770001" style="border-radius: 10px;">
          </div>

          <!-- Temu-Style Frequently Bought Together Recommendations -->
          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="font-size: 0.8rem; font-weight: 800; color: #1E293B;">🔥 Frequently Bought Together</div>
              <span style="font-size: 0.62rem; color: #EA580C; font-weight: 700;">Save on Combined Delivery</span>
            </div>
            <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px;">
              ${recommendedItems.map(rec => `
                <div style="min-width: 130px; max-width: 130px; background: #FFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 8px; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); display: flex; flex-direction: column; justify-content: space-between;">
                  <div style="position: relative; height: 75px; border-radius: 8px; overflow: hidden; margin-bottom: 6px;">
                    <img src="${rec.img}" alt="${rec.name}" style="width: 100%; height: 100%; object-fit: cover;">
                    <span style="position: absolute; top: 4px; left: 4px; background: #EF4444; color: #FFF; font-size: 0.52rem; font-weight: 900; padding: 1px 4px; border-radius: 4px;">${rec.discount}</span>
                  </div>
                  <div>
                    <div style="font-size: 0.68rem; font-weight: 800; color: #1E293B; line-height: 1.2; height: 26px; overflow: hidden;">${rec.name}</div>
                    <div style="font-size: 0.58rem; color: #64748B; margin-top: 2px;">★ ${rec.rating} • ${rec.sold}</div>
                    <div style="display: flex; align-items: baseline; gap: 4px; margin-top: 4px;">
                      <span style="font-size: 0.78rem; font-weight: 900; color: #B91C1C;">₦${rec.price.toLocaleString()}</span>
                      <span style="font-size: 0.58rem; color: #94A3B8; text-decoration: line-through;">₦${rec.origPrice.toLocaleString()}</span>
                    </div>
                  </div>
                  <button onclick="MobileApp.addToCart('${rec.id}', '${rec.name}', ${rec.price}, '${rec.store_id}'); MobileApp.updateLiveDeliveryQuote();" style="width: 100%; margin-top: 6px; background: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA; padding: 5px 0; border-radius: 8px; font-size: 0.65rem; font-weight: 800; cursor: pointer;">
                    + Add to Cart
                  </button>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Payment Methods: Flutterwave vs Wallet -->
          <div style="font-size: 0.75rem; font-weight: 800; color: #1E293B; margin: 10px 0 6px;">Select Payment Method:</div>
          
          <!-- Flutterwave Gateway Button -->
          <button onclick="MobileApp.openFlutterwaveModal(${total})" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px; font-size: 0.9rem; background: linear-gradient(135deg, #F5A623 0%, #EA580C 100%); margin-bottom: 8px; border-radius: 12px; box-shadow: 0 4px 12px rgba(245, 166, 35, 0.3); font-weight: 800;">
            <span id="flw-pay-btn-text">⚡ Pay ₦${total.toLocaleString()} with Flutterwave</span>
          </button>

          <!-- RP Wallet Button -->
          <button onclick="MobileApp.handleCheckout('WALLET')" class="btn-secondary" style="width: 100%; justify-content: center; padding: 11px; font-size: 0.84rem; font-weight: 800; border-radius: 12px;">
            <span>👛 Pay with RushPoint Wallet</span>
          </button>
        </div>
      </div>
    `;
  },

  updateCartQty(idx, delta) {
    this.cart[idx].quantity += delta;
    if (this.cart[idx].quantity <= 0) {
      this.cart.splice(idx, 1);
    }
    this.render();
  },

  async openFlutterwaveModal(totalAmount) {
    const address = document.getElementById("checkout-address").value.trim();
    const phone = document.getElementById("checkout-phone").value.trim();
    if (!address || !phone) {
      API.showToast("Please provide delivery address and phone number", "error");
      return;
    }

    let dedicatedAcc = null;
    try {
      const wRes = await API.get("/api/finance/wallet/dedicated-account");
      if (wRes && wRes.dedicated_account) dedicatedAcc = wRes.dedicated_account;
    } catch(e) {}

    const accNum = dedicatedAcc ? dedicatedAcc.account_number : "9901847291";
    const bankName = dedicatedAcc ? dedicatedAcc.bank_name : "Wema Bank (Flutterwave)";
    const accName = dedicatedAcc ? dedicatedAcc.account_name : "RushPoint - Fatima Abubakar";

    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 380px; border-radius: 20px; overflow: hidden; padding: 0;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #7F1D1D 0%, #B91C1C 100%); color: #FFF; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 0.68rem; font-weight: 800; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px;">256-Bit SSL Secured</div>
            <div style="font-size: 1.15rem; font-weight: 900;">Multi-Payment Checkout</div>
          </div>
          <div style="font-size: 1.2rem; cursor: pointer;" onclick="this.closest('.modal-backdrop').remove()">✕</div>
        </div>

        <div style="padding: 16px; max-height: 80vh; overflow-y: auto;">
          <!-- Amount Banner -->
          <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 12px; text-align: center; margin-bottom: 14px;">
            <div style="font-size: 0.7rem; color: #7F1D1D; font-weight: 800;">TOTAL AMOUNT TO PAY</div>
            <div style="font-size: 1.6rem; font-weight: 900; color: #991B1B;">₦${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            <div style="font-size: 0.68rem; color: #059669; font-weight: 700; margin-top: 2px;">🛡️ 4-Way Delivery Escrow Protected</div>
          </div>

          <!-- Payment Methods Selector -->
          <div style="font-size: 0.8rem; font-weight: 800; color: #1E293B; margin-bottom: 8px;">Select Payment Option:</div>

          <!-- 1. Direct Bank Transfer Card -->
          <div style="background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: 14px; padding: 12px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 0.82rem; font-weight: 900; color: #166534;">🏦 Direct Bank Transfer</span>
              <span style="font-size: 0.62rem; background: #DCFCE7; color: #15803D; padding: 2px 6px; border-radius: 6px; font-weight: 800;">MOST POPULAR</span>
            </div>
            <div style="font-size: 0.72rem; color: #374151; margin-bottom: 8px;">Transfer from OPay, Kuda, GTBank, Zenith, PalmPay:</div>
            <div style="background: #FFF; border: 1px dashed #4ADE80; border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 0.65rem; color: #64748B;">${bankName}</div>
                <div style="font-size: 1.1rem; font-weight: 900; color: #14532D; letter-spacing: 1px;" id="checkout-bank-acc">${accNum}</div>
                <div style="font-size: 0.65rem; color: #166534; font-weight: 600;">${accName}</div>
              </div>
              <button onclick="navigator.clipboard.writeText('${accNum}'); API.showToast('Account number copied! 📋', 'success')" style="background: #166534; color: #FFF; border: none; padding: 6px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; cursor: pointer;">
                Copy
              </button>
            </div>
            <button onclick="MobileApp.processMultiPayment('${address}', '${phone}', 'BANK_TRANSFER')" style="width: 100%; margin-top: 8px; background: #166534; color: #FFF; border: none; padding: 9px; border-radius: 8px; font-weight: 800; font-size: 0.8rem; cursor: pointer;">
              I Have Made This Transfer ➔
            </button>
          </div>

          <!-- 2. Online Card Payment -->
          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.82rem; font-weight: 800; color: #1E293B;">💳 Debit / Credit Card</div>
              <div style="font-size: 0.68rem; color: #64748B;">Mastercard, Visa, Verve (Flutterwave)</div>
            </div>
            <button onclick="MobileApp.processMultiPayment('${address}', '${phone}', 'CARD')" style="background: #B91C1C; color: #FFF; border: none; padding: 7px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">
              Pay with Card
            </button>
          </div>

          <!-- 3. USSD Code -->
          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.82rem; font-weight: 800; color: #1E293B;">📱 USSD Banking Code</div>
              <div style="font-size: 0.68rem; color: #64748B;">*737#, *901#, *894# Instant Dial</div>
            </div>
            <button onclick="MobileApp.processMultiPayment('${address}', '${phone}', 'USSD')" style="background: #334155; color: #FFF; border: none; padding: 7px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">
              Pay via USSD
            </button>
          </div>

          <!-- 4. QR Code -->
          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.82rem; font-weight: 800; color: #1E293B;">🔳 Scan to Pay (QR Code)</div>
              <div style="font-size: 0.68rem; color: #64748B;">Scan from your mobile bank application</div>
            </div>
            <button onclick="MobileApp.processMultiPayment('${address}', '${phone}', 'QR_CODE')" style="background: #0284C7; color: #FFF; border: none; padding: 7px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">
              Show QR
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async processMultiPayment(address, phone, method = "FLUTTERWAVE") {
    const overlay = document.querySelector(".rp-modal-overlay");
    if (overlay) overlay.innerHTML = `
      <div class="modal-dialog" style="max-width: 320px; text-align: center; padding: 24px; border-radius: 20px;">
        <div style="font-size: 2rem; margin-bottom: 12px;">⏳</div>
        <div style="font-size: 1rem; font-weight: 900; color: #1E293B; margin-bottom: 6px;">Processing Transaction...</div>
        <div style="font-size: 0.75rem; color: #64748B;">Connecting to Flutterwave gateway & securing 4-way escrow.</div>
      </div>
    `;

    try {
      const payload = {
        store_id: this.cart[0].store_id,
        items: this.cart.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
        delivery_address: address,
        customer_phone: phone,
        payment_method: method
      };

      const res = await API.post("/api/marketplace/checkout", payload);
      document.querySelector(".rp-modal-overlay")?.remove();
      this.cart = [];
      this.activeTab = "orders";
      API.showToast(`Order Placed (${res.order_ref})! 4-Digit Delivery PIN: ${res.pod_otp || '8899'}`, "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(e.message || "Failed to complete payment. Please check balance or try card.", "error");
    }
  },

  async handleCheckout(method = "WALLET") {
    const address = document.getElementById("checkout-address").value.trim();
    const phone = document.getElementById("checkout-phone").value.trim();
    if (!address || !phone) {
      API.showToast("Please provide address and phone number", "error");
      return;
    }

    try {
      const payload = {
        store_id: this.cart[0].store_id,
        items: this.cart.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
        delivery_address: address,
        customer_phone: phone,
        payment_method: method
      };

      const res = await API.post("/api/marketplace/checkout", payload);
      this.cart = [];
      this.activeTab = "orders";
      API.showToast(`Order ${res.order_ref} placed! Vendor credited 100% product price instantly.`, "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {}
  },

  getCustomerOrdersHtml(orders = []) {

    return `
      <div>
        <div style="font-size: 0.95rem; font-weight: 800; color: #1E293B; margin-bottom: 12px;">My Order History & Live Tracking (${orders.length})</div>
        ${orders.length === 0 ? `
          <div style="text-align: center; padding: 40px 10px; color: #64748B;">
            <div style="font-size: 3rem;">📦</div>
            <div style="font-size: 0.85rem; font-weight: 700; margin-top: 6px;">No orders placed yet.</div>
            <p style="font-size: 0.72rem; margin-top: 4px;">Items purchased will show here with real-time delivery status.</p>
            <button onclick="MobileApp.switchTab('home')" class="btn-primary" style="margin-top: 14px; border-radius: 12px; padding: 8px 16px; background: #B91C1C;">Start Shopping</button>
          </div>
        ` : orders.map(o => `
          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 14px; margin-bottom: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 900; font-size: 0.9rem; color: #7F1D1D;">${o.order_ref}</span>
              <span class="badge badge-${o.status.toLowerCase()}">${o.status}</span>
            </div>
            <div style="font-size: 0.74rem; color: #475569;">Store: <strong>${o.store_name}</strong></div>
            <div style="font-size: 0.74rem; color: #475569;">Total: <strong style="color: #B91C1C;">₦${o.total_amount.toLocaleString()}</strong></div>
            
            ${o.pod_otp && o.status !== 'DELIVERED' ? `
              <div style="background: #FFF5F5; border: 1px dashed #B91C1C; border-radius: 10px; padding: 8px 12px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.72rem; font-weight: 700; color: #7F1D1D;">🔐 Share Delivery OTP with Rider:</span>
                <span style="font-size: 1.1rem; font-weight: 900; color: #B91C1C; letter-spacing: 2px;">${o.pod_otp}</span>
              </div>
            ` : ''}

            <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #F1F5F9; padding-top: 8px;">
              <div style="font-size: 0.65rem; color: #94A3B8;">${new Date(o.created_at).toLocaleString()}</div>
              <button onclick="MobileApp.viewOrderTimeline('${o.id}')" class="btn-secondary btn-sm" style="border-radius: 8px; font-weight: 800;">Track Order</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  async viewOrderTimeline(orderId) {
    try {
      const res = await API.get(`/api/orders/${orderId}`);
      const o = res.order;
      const timeline = res.timeline || [];

      // Determine numeric step for 4-stage stepper
      let currentStep = 1;
      const s = (o.status || "").toUpperCase();
      if (s === "DELIVERED") currentStep = 4;
      else if (s === "IN_TRANSIT" || s === "PICKED_UP" || s === "ARRIVED") currentStep = 3;
      else if (s === "CONFIRMED" || s === "PREPARING" || s === "ASSIGNED") currentStep = 2;
      else currentStep = 1;

      const stepProgressPct = currentStep === 1 ? 0 : currentStep === 2 ? 33 : currentStep === 3 ? 66 : 100;

      const modal = document.createElement("div");
      modal.className = "modal-backdrop rp-modal-overlay";
      modal.innerHTML = `
        <div class="modal-dialog" style="max-width: 380px; border-radius: 22px; overflow: hidden; padding: 0;">
          <div style="background: linear-gradient(135deg, #7F1D1D 0%, #B91C1C 100%); color: #FFF; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.7rem; opacity: 0.85; text-transform: uppercase; font-weight: 700;">Live Dispatch Radar</div>
              <h3 style="font-size: 1.05rem; font-weight: 900; margin: 0;">${o.order_ref}</h3>
            </div>
            <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; color: #FFF; font-size: 1.2rem; cursor: pointer;">✕</button>
          </div>

          <div style="padding: 16px;">
            <!-- 4-Stage Visual Progress Stepper -->
            <div style="display: flex; justify-content: space-between; position: relative; margin: 12px 6px 20px; text-align: center;">
              <div style="position: absolute; top: 12px; left: 12%; right: 12%; height: 3px; background: #E2E8F0; z-index: 1;"></div>
              <div style="position: absolute; top: 12px; left: 12%; width: ${stepProgressPct * 0.76}%; height: 3px; background: #059669; z-index: 2; transition: width 0.3s;"></div>
              
              <div style="position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center;">
                <div style="width: 26px; height: 26px; border-radius: 50%; background: ${currentStep >= 1 ? '#059669' : '#E2E8F0'}; color: #FFF; font-size: 0.7rem; display: flex; align-items: center; justify-content: center; font-weight: 800;">${currentStep >= 1 ? '✓' : '1'}</div>
                <span style="font-size: 0.62rem; font-weight: 700; color: #1E293B; margin-top: 4px;">Placed</span>
              </div>
              <div style="position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center;">
                <div style="width: 26px; height: 26px; border-radius: 50%; background: ${currentStep >= 2 ? '#059669' : '#E2E8F0'}; color: #FFF; font-size: 0.7rem; display: flex; align-items: center; justify-content: center; font-weight: 800;">${currentStep >= 2 ? '✓' : '2'}</div>
                <span style="font-size: 0.62rem; font-weight: 700; color: #1E293B; margin-top: 4px;">Preparing</span>
              </div>
              <div style="position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center;">
                <div style="width: 26px; height: 26px; border-radius: 50%; background: ${currentStep >= 3 ? '#059669' : '#E2E8F0'}; color: #FFF; font-size: 0.7rem; display: flex; align-items: center; justify-content: center; font-weight: 800;">${currentStep >= 3 ? '✓' : '3'}</div>
                <span style="font-size: 0.62rem; font-weight: 700; color: #1E293B; margin-top: 4px;">In Transit</span>
              </div>
              <div style="position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center;">
                <div style="width: 26px; height: 26px; border-radius: 50%; background: ${currentStep >= 4 ? '#059669' : '#E2E8F0'}; color: #FFF; font-size: 0.7rem; display: flex; align-items: center; justify-content: center; font-weight: 800;">${currentStep >= 4 ? '✓' : '4'}</div>
                <span style="font-size: 0.62rem; font-weight: 700; color: #1E293B; margin-top: 4px;">Delivered</span>
              </div>
            </div>

            <!-- Prominent Delivery PIN Card (If not delivered) -->
            ${o.pod_otp && o.status !== 'DELIVERED' ? `
              <div style="background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%); border: 1.5px solid #F59E0B; border-radius: 14px; padding: 12px; margin-bottom: 14px; text-align: center; box-shadow: 0 4px 12px rgba(245,158,11,0.12);">
                <div style="font-size: 0.68rem; font-weight: 800; color: #92400E; text-transform: uppercase; letter-spacing: 0.5px;">🔒 Your 4-Digit Delivery PIN</div>
                <div style="font-size: 1.8rem; font-weight: 900; color: #B45309; letter-spacing: 6px; margin: 4px 0;">${o.pod_otp}</div>
                <div style="font-size: 0.68rem; color: #78350F; line-height: 1.35;">Show this code to courier <strong>only after</strong> you physically inspect your parcel!</div>
              </div>
            ` : ''}

            <!-- Key Order Details -->
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 12px; margin-bottom: 14px; font-size: 0.74rem;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #64748B;">Current Status:</span>
                <span class="badge badge-${o.status.toLowerCase()}">${o.status}</span>
              </div>
              <div style="margin-top: 4px;">🏪 Store: <strong>${o.store_name}</strong></div>
              <div style="margin-top: 4px;">📍 Destination: <strong>${o.delivery_address}</strong></div>
              ${o.rider_name ? `<div style="margin-top: 4px;">🛵 Assigned Courier: <strong>${o.rider_name}</strong></div>` : ''}
              
              <!-- Direct Contact Rider Buttons -->
              ${o.rider_phone ? `
                <div style="display: flex; gap: 8px; margin-top: 10px;">
                  <a href="tel:${o.rider_phone}" class="btn-primary" style="flex: 1; text-align: center; justify-content: center; padding: 8px 0; border-radius: 10px; font-size: 0.75rem; font-weight: 800; text-decoration: none; background: #0284C7;">📞 Call Rider</a>
                  <a href="https://wa.me/${o.rider_phone.replace('+', '')}?text=Hello%20Rider%2C%20I%20am%20the%20customer%20for%20order%20${o.order_ref}" target="_blank" class="btn-secondary" style="flex: 1; text-align: center; justify-content: center; padding: 8px 0; border-radius: 10px; font-size: 0.75rem; font-weight: 800; text-decoration: none; color: #059669; border-color: #A7F3D0; background: #ECFDF5;">💬 WhatsApp</a>
                </div>
              ` : ''}
            </div>

            <!-- Live Interactive Radar Map -->
            <div style="margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.68rem; margin-bottom: 4px;">
                <span style="font-weight: 800; color: #1E293B;">🗺️ Live GPS Courier Radar</span>
                <span style="background: #ECFDF5; color: #059669; font-weight: 800; padding: 1px 6px; border-radius: 6px;">⏱️ ~14 mins ETA</span>
              </div>
              <div id="order-radar-map" style="height: 160px; border-radius: 12px; border: 1px solid #CBD5E1; overflow: hidden; background: #E2E8F0;"></div>
            </div>

            <div style="font-weight: 800; font-size: 0.8rem; margin-bottom: 8px; color: #1E293B;">Milestone Timeline</div>
            <div style="display: flex; flex-direction: column; gap: 8px; border-left: 2px solid #FECACA; padding-left: 12px; margin-left: 6px; max-height: 180px; overflow-y: auto;">
              ${timeline.map(t => `
                <div style="font-size: 0.72rem;">
                  <span style="font-weight: 800; color: #B91C1C;">${t.to_status}</span>
                  <div style="font-size: 0.65rem; color: #94A3B8;">${new Date(t.timestamp).toLocaleTimeString()} by ${t.actor_role}</div>
                  ${t.notes ? `<div style="font-size: 0.65rem; color: #64748B;">${t.notes}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      setTimeout(() => {
        const mapEl = document.getElementById('order-radar-map');
        if (!mapEl || typeof L === 'undefined') return;

        const storeLat = o.store_lat || 12.9908;
        const storeLng = o.store_lng || 7.6018;
        const destLat = o.delivery_lat || 12.9820;
        const destLng = o.delivery_lng || 7.5950;

        let riderLat = storeLat;
        let riderLng = storeLng;
        const sUpper = (o.status || '').toUpperCase();
        if (sUpper === 'IN_TRANSIT' || sUpper === 'PICKED_UP') {
          riderLat = (storeLat + destLat) / 2 + 0.0015;
          riderLng = (storeLng + destLng) / 2 + 0.0015;
        } else if (sUpper === 'DELIVERED') {
          riderLat = destLat;
          riderLng = destLng;
        }

        const map = L.map('order-radar-map', { zoomControl: false, attributionControl: false }).setView([(storeLat + destLat)/2, (storeLng + destLng)/2], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

        const storeIcon = L.divIcon({
          html: '<div style="background:#7F1D1D;color:#FFF;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid #FFF;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏪</div>',
          iconSize: [24, 24], iconAnchor: [12, 12]
        });
        L.marker([storeLat, storeLng], { icon: storeIcon }).addTo(map).bindPopup(`<b>${o.store_name}</b><br>Store Pickup`);

        const custIcon = L.divIcon({
          html: '<div style="background:#059669;color:#FFF;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid #FFF;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏠</div>',
          iconSize: [24, 24], iconAnchor: [12, 12]
        });
        L.marker([destLat, destLng], { icon: custIcon }).addTo(map).bindPopup(`<b>Your Dropoff Point</b><br>${o.delivery_address}`);

        if (sUpper !== 'PENDING' && sUpper !== 'CANCELLED') {
          const bikeIcon = L.divIcon({
            html: '<div style="background:#F59E0B;color:#000;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #FFF;box-shadow:0 0 10px rgba(245,158,11,0.8);">🛵</div>',
            iconSize: [28, 28], iconAnchor: [14, 14]
          });
          L.marker([riderLat, riderLng], { icon: bikeIcon }).addTo(map).bindPopup(`<b>${o.rider_name || 'Assigned Courier'}</b><br>Live GPS Radar`);
        }

        L.polyline([[storeLat, storeLng], [riderLat, riderLng], [destLat, destLng]], {
          color: '#B91C1C', weight: 3, dashArray: '4, 6', opacity: 0.85
        }).addTo(map);

        try {
          map.fitBounds([[storeLat, storeLng], [destLat, destLng]], { padding: [20, 20] });
        } catch(e){}
      }, 150);
    } catch (e) {}
  },

  getIndependentLogisticsHtml() {
    return `
      <div>
        <div style="font-size: 0.95rem; font-weight: 800; color: #1E293B; margin-bottom: 4px;">📦 Independent Parcel & Waybill Dispatch</div>
        <p style="font-size: 0.72rem; color: #64748B; margin-bottom: 12px;">Deliver any item outside the marketplace — motor park station pickups (e.g. Kano → Katsina) and direct door delivery.</p>

        <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 18px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
          <form onsubmit="MobileApp.handleBookLogistics(event)">
            <div class="rp-form-group">
              <label class="rp-label">Item Description</label>
              <input type="text" id="log-desc" class="rp-input" placeholder="e.g. Spare Parts / 3 Cartons / Electronics" required style="border-radius: 10px;">
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Package Size</label>
              <select id="log-size" class="rp-select" style="border-radius: 10px;">
                <option value="SMALL">Small (Documents, Envelope, Phone)</option>
                <option value="MEDIUM" selected>Medium (Clothes, Shoes, Gadgets)</option>
                <option value="LARGE">Large (Cartons, Small Appliances)</option>
                <option value="HEAVY">Heavy (Machinery, Furniture, Building Materials)</option>
              </select>
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Pickup Address & Sender Contact</label>
              <input type="text" id="log-pickup" class="rp-input" placeholder="e.g. Katsina Central Motor Park" required value="Katsina Central Motor Park, Kano Road" style="border-radius: 10px;">
              <input type="tel" id="log-pickup-contact" class="rp-input" placeholder="Sender Phone" style="margin-top: 4px; border-radius: 10px;" required value="+2348011112222">
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Dropoff Address & Receiver Contact</label>
              <input type="text" id="log-dropoff" class="rp-input" placeholder="e.g. 14 Kofar Kaura, Katsina" required value="14 Kofar Kaura Layout, Katsina" style="border-radius: 10px;">
              <button type="button" onclick="MobileApp.useCustomerDeviceGps('log-dropoff')" style="margin-top: 5px; background: #EFF6FF; border: 1px dashed #2563EB; color: #1D4ED8; font-size: 0.68rem; font-weight: 700; padding: 5px 10px; border-radius: 8px; cursor: pointer; width: 100%; display: flex; align-items: center; justify-content: center; gap: 5px;">
                📍 Use My Device GPS for Dropoff
              </button>
              <input type="tel" id="log-dropoff-contact" class="rp-input" placeholder="Receiver Phone" style="margin-top: 4px; border-radius: 10px;" required value="+2348033334444">
            </div>
            <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px; margin-top: 6px; border-radius: 12px; background: #B91C1C; font-weight: 800;">
              Get Instant Quote & Dispatch 🚀
            </button>
          </form>
        </div>
      </div>
    `;
  },

  async handleBookLogistics(e) {
    e.preventDefault();
    const item_description = document.getElementById("log-desc").value.trim();
    const package_size = document.getElementById("log-size").value;
    const pickup_address = document.getElementById("log-pickup").value.trim();
    const pickup_contact = document.getElementById("log-pickup-contact").value.trim();
    const dropoff_address = document.getElementById("log-dropoff").value.trim();
    const dropoff_contact = document.getElementById("log-dropoff-contact").value.trim();

    try {
      const res = await API.post("/api/logistics/book", {
        item_description, package_size, pickup_address, pickup_contact, dropoff_address, dropoff_contact
      });
      API.showToast(`Logistics Booked! Reference: ${res.request_ref}`, "success");
      this.activeTab = "orders";
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (err) {}
  },

  getCustomerSupportHtml() {
    return `
      <div>
        <div style="font-size: 0.95rem; font-weight: 800; color: #1E293B; margin-bottom: 4px;">💬 Help & Customer Support</div>
        <p style="font-size: 0.72rem; color: #64748B; margin-bottom: 12px;">Trackable support desk for missing items, refunds, delivery questions.</p>

        <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 18px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
          <form onsubmit="MobileApp.handleCreateTicket(event)">
            <div class="rp-form-group">
              <label class="rp-label">Issue Category</label>
              <select id="sup-cat" class="rp-select" style="border-radius: 10px;">
                <option value="DELIVERY_DELAY">Delivery Delay / Rider Inquiry</option>
                <option value="MISSING_ITEM">Missing or Damaged Item</option>
                <option value="REFUND_REQUEST">Refund / Payment Question</option>
                <option value="OTHER">General Feedback</option>
              </select>
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Subject</label>
              <input type="text" id="sup-sub" class="rp-input" placeholder="Brief summary" required style="border-radius: 10px;">
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Detailed Description</label>
              <textarea id="sup-desc" class="rp-textarea" rows="3" placeholder="Explain the problem..." required style="border-radius: 10px;"></textarea>
            </div>
            <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px; border-radius: 12px; background: #B91C1C; font-weight: 800;">
              Submit Support Ticket 📨
            </button>
          </form>
        </div>
      </div>
    `;
  },

  async handleCreateTicket(e) {
    e.preventDefault();
    const category = document.getElementById("sup-cat").value;
    const subject = document.getElementById("sup-sub").value.trim();
    const description = document.getElementById("sup-desc").value.trim();

    try {
      const res = await API.post("/api/support/tickets", { category, subject, description });
      API.showToast(`Support Ticket ${res.ticket_ref} submitted!`, "success");
      document.getElementById("sup-sub").value = "";
      document.getElementById("sup-desc").value = "";
    } catch (e) {}
  },

  showTopUpModal(currentBal) {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 320px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1rem; font-weight: 800; color: #1E293B;">💳 Top Up Wallet</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <div style="font-size: 0.78rem; margin-bottom: 12px;">Current Balance: <strong style="color: #B91C1C;">₦${currentBal.toLocaleString()}</strong></div>
        <div class="rp-form-group">
          <label class="rp-label">Deposit Amount (NGN)</label>
          <input type="number" id="topup-amount" class="rp-input" placeholder="e.g. 5000" min="100" step="500" style="border-radius: 10px;">
        </div>
        <div style="font-size: 0.72rem; color: #64748B; margin-bottom: 12px;">🔒 Real live payment powered by Flutterwave (Debit Card, Bank Transfer, USSD).</div>
        <button onclick="MobileApp.executeTopUp()" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px; border-radius: 12px; background: #B91C1C; font-weight: 800;">
          Pay with Flutterwave 💳
        </button>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async executeTopUp() {
    const amt = parseFloat(document.getElementById("topup-amount").value);
    if (!amt || amt <= 0) {
      API.showToast("Please enter a valid deposit amount.", "error");
      return;
    }
    const btn = document.querySelector(".rp-modal-overlay button.btn-primary");
    if (btn) { btn.disabled = true; btn.textContent = "Connecting Gateway… 🔐"; }
    try {
      const res = await API.post("/api/finance/payment/initialize", {
        amount: amt,
        payment_type: "WALLET_TOPUP",
        redirect_url: window.location.origin + "/app"
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      if (res.payment_link && res.gateway === "FLUTTERWAVE_LIVE") {
        API.showToast("Redirecting to Flutterwave checkout…", "info");
        window.location.href = res.payment_link;
      } else {
        API.showToast("Deposit request generated (Ref: " + res.reference + ")", "info");
        this.render();
      }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Pay with Flutterwave 💳"; }
    }
  },

  // ==========================================
  // VENDOR MOBILE APP VIEW (Moniepoint Business Style)
  // ==========================================
  vendorActiveTab: "dashboard",

  async renderVendorApp(container, user) {
    let profile = null;
    let products = [];
    let orders = [];
    let wallet = { balance: 0.0 };

    try {
      const pRes = await API.get("/api/vendors/store/profile", { silent: true });
      if (pRes) profile = pRes;
      const prRes = await API.get("/api/products/", { silent: true });
      if (prRes && prRes.products) products = prRes.products;
      const oRes = await API.get("/api/orders/", { silent: true });
      if (oRes && oRes.orders) orders = oRes.orders;
      const wRes = await API.get("/api/finance/wallet/me", { silent: true });
      if (wRes && wRes.wallet) wallet = wRes.wallet;
    } catch (e) {}

    const store = profile?.store;
    const vendor = profile?.vendor;

    const completedOrders = orders.filter(o => o.status === 'DELIVERED');
    const inTransitOrders = orders.filter(o => ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'].includes(o.status));
    const activeOrders = orders.filter(o => ['NEW', 'CONFIRMED'].includes(o.status));

    container.innerHTML = `
      <div class="mobile-app-shell">
        <!-- Moniepoint Business Header (Dark-Light Blood Theme) -->
        <div class="mobile-app-header" style="background: linear-gradient(135deg, #450A0A 0%, #7F1D1D 50%, #B91C1C 100%);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <button onclick="MobileApp.toggleVendorDrawer(true)" style="background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.25); color: #FFF; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; cursor: pointer;">
              ☰
            </button>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-weight: 900; font-size: 0.96rem;">${store?.store_name || 'Vendor Merchant'}</span>
                <span class="badge badge-${vendor?.kyc_status?.toLowerCase() || 'active'}" style="font-size: 0.58rem; padding: 2px 6px;">${vendor?.kyc_status || 'ACTIVE'}</span>
              </div>
              <div style="font-size: 0.65rem; opacity: 0.88; color: #FEE2E2;">🏪 ${vendor?.business_name || 'Store'} • 📍 ${store?.address || 'Katsina / Lagos'}</div>
            </div>
          </div>
          <button onclick="MobileApp.showRoleSwitchModal()" style="background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.25); color: #FFF; padding: 5px 9px; border-radius: 12px; font-size: 0.68rem; font-weight: 700; cursor: pointer;">
            Switch
          </button>
        </div>

        <div class="mobile-content-area">
          ${this.getVendorTabHtml(activeOrders, inTransitOrders, completedOrders, products, wallet, vendor, store, user)}
        </div>

        <!-- Moniepoint 4-Tab Bottom Navigation -->
        <div class="mobile-bottom-nav">
          <button class="bottom-tab-btn ${this.vendorActiveTab === 'dashboard' ? 'active' : ''}" onclick="MobileApp.vendorActiveTab = 'dashboard'; MobileApp.render();">
            <span class="bottom-tab-icon">📊</span>
            <span>Dashboard</span>
          </button>
          <button class="bottom-tab-btn ${this.vendorActiveTab === 'orders' ? 'active' : ''}" onclick="MobileApp.vendorActiveTab = 'orders'; MobileApp.render();">
            <span class="bottom-tab-icon">📦</span>
            <span>Orders (${activeOrders.length})</span>
          </button>
          <button class="bottom-tab-btn ${this.vendorActiveTab === 'products' ? 'active' : ''}" onclick="MobileApp.vendorActiveTab = 'products'; MobileApp.render();">
            <span class="bottom-tab-icon">🏷️</span>
            <span>Catalog</span>
          </button>
          <button class="bottom-tab-btn ${this.vendorActiveTab === 'account' ? 'active' : ''}" onclick="MobileApp.vendorActiveTab = 'account'; MobileApp.render();">
            <span class="bottom-tab-icon">👤</span>
            <span>Account</span>
          </button>
        </div>

        <!-- Vendor Drawer Sidebar -->
        <div class="mobile-drawer-overlay" id="vendor-sidebar-drawer" onclick="if(event.target === this) MobileApp.toggleVendorDrawer(false)">
          <div class="mobile-drawer">
            <div class="mobile-drawer-header">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div style="width: 44px; height: 44px; border-radius: 12px; background: #FFF; color: #B91C1C; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 900;">
                    🏪
                  </div>
                  <div>
                    <div style="font-weight: 900; font-size: 0.95rem; color: #FFF;">${store?.store_name}</div>
                    <div style="font-size: 0.68rem; opacity: 0.85; color: #FEE2E2;">${user.full_name} (${vendor?.kyc_status})</div>
                  </div>
                </div>
                <button onclick="MobileApp.toggleVendorDrawer(false)" style="background: rgba(255,255,255,0.2); border: none; color: #FFF; width: 26px; height: 26px; border-radius: 50%; cursor: pointer;">✕</button>
              </div>

              <div style="background: rgba(0,0,0,0.25); border-radius: 12px; padding: 10px; margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-size: 0.64rem; text-transform: uppercase; opacity: 0.85;">Net Earnings (100% Retained)</div>
                  <div style="font-size: 1.1rem; font-weight: 900; color: #FFF;">₦${wallet.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                </div>
                <button onclick="MobileApp.toggleVendorDrawer(false); MobileApp.showWithdrawalModal(${wallet.balance}, '${vendor?.bank_name || 'GTBank'}', '${vendor?.account_number || '0128847112'}', '${vendor?.account_name || user.full_name}')" style="background: #FFF; color: #B91C1C; border: none; padding: 4px 10px; border-radius: 8px; font-size: 0.68rem; font-weight: 800; cursor: pointer;">
                  Withdraw
                </button>
              </div>
            </div>

            <div class="mobile-drawer-menu">
              <!-- Vendor Profile Summary Card -->
              <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:0.72rem;font-weight:800;color:var(--blood-dark);">🏪 Merchant Stall</span>
                  <span class="badge badge-${vendor?.kyc_status?.toLowerCase() || 'active'}" style="font-size:0.58rem;">${vendor?.kyc_status || 'APPROVED'}</span>
                </div>
                <div style="font-size:0.68rem;color:#64748B;margin-top:4px;">
                  Owner: <strong>${user.full_name}</strong> • Bank: <code>${vendor?.bank_name || 'GTBank'}</code>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px;">
                  <button onclick="MobileApp.toggleVendorDrawer(false); MobileApp.showUserProfileModal();" class="btn-secondary btn-sm" style="flex:1;font-size:0.65rem;padding:4px;justify-content:center;">
                    👤 View Profile
                  </button>
                  <button onclick="MobileApp.toggleVendorDrawer(false); MobileApp.showChangePasswordModal();" class="btn-secondary btn-sm" style="flex:1;font-size:0.65rem;padding:4px;justify-content:center;color:var(--blood-primary);border-color:var(--blood-border);">
                    🔒 Password
                  </button>
                </div>
              </div>

              <div class="mobile-drawer-section-title">Merchant Management</div>
              <div class="mobile-drawer-item ${this.vendorActiveTab === 'dashboard' ? 'active' : ''}" onclick="MobileApp.toggleVendorDrawer(false); MobileApp.vendorActiveTab = 'dashboard'; MobileApp.render();">
                <span class="mobile-drawer-icon">📊</span> <span>Sales Dashboard</span>
              </div>
              <div class="mobile-drawer-item ${this.vendorActiveTab === 'orders' ? 'active' : ''}" onclick="MobileApp.toggleVendorDrawer(false); MobileApp.vendorActiveTab = 'orders'; MobileApp.render();">
                <span class="mobile-drawer-icon">📦</span> <span>Order Fulfillment (${activeOrders.length})</span>
              </div>
              <div class="mobile-drawer-item ${this.vendorActiveTab === 'products' ? 'active' : ''}" onclick="MobileApp.toggleVendorDrawer(false); MobileApp.vendorActiveTab = 'products'; MobileApp.render();">
                <span class="mobile-drawer-icon">🏷️</span> <span>Product Shelves & Stock</span>
              </div>
              <div class="mobile-drawer-item ${this.vendorActiveTab === 'account' ? 'active' : ''}" onclick="MobileApp.toggleVendorDrawer(false); MobileApp.vendorActiveTab = 'account'; MobileApp.render();">
                <span class="mobile-drawer-icon">🏦</span> <span>Bank Settlement Profile</span>
              </div>

              <div class="mobile-drawer-section-title">Security & Controls</div>
              <div class="mobile-drawer-item" onclick="MobileApp.toggleVendorDrawer(false); MobileApp.showChangePasswordModal();">
                <span class="mobile-drawer-icon">🔒</span> <span>Change Password</span>
              </div>
              <div class="mobile-drawer-item" onclick="MobileApp.toggleVendorDrawer(false); MobileApp.showHelpModal();">
                <span class="mobile-drawer-icon">💬</span> <span>Merchant Support</span>
              </div>
            </div>

            <div style="padding: 12px 14px; border-top: 1px solid #E2E8F0; background: #F8FAFC;">
              <button onclick="API.logout(); window.location.reload();" class="btn-danger btn-sm" style="width: 100%; justify-content: center; padding: 9px; border-radius: 10px; font-weight: 800;">
                🚪 Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  toggleVendorDrawer(open) {
    const drawer = document.getElementById("vendor-sidebar-drawer");
    if (drawer) {
      if (open) {
        drawer.classList.add("open");
      } else {
        drawer.classList.remove("open");
      }
    }
  },

  getVendorTabHtml(activeOrders, inTransitOrders, completedOrders, products, wallet, vendor, store, user) {
    if (this.vendorActiveTab === "dashboard") {
      return `
        <!-- Top Branded RushPoint Bar -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding: 2px 4px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <img src="/static/img/rushpoint-logo-white-badge.png" onerror="this.onerror=null;this.src='img/rushpoint-logo.png'" style="height: 38px; width: 38px; border-radius: 10px; object-fit: contain; background: #FFFFFF; padding: 3px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" alt="RushPoint">
            <span style="font-weight:900;font-size:1.05rem;color:#881337;">Rush<span style="color:#BE123C;">Point</span></span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button onclick="MobileApp.toggleStoreOpenStatus()" style="display: flex; align-items: center; gap: 4px; font-size: 0.68rem; font-weight: 800; color: ${MobileApp.isStoreClosed ? '#DC2626' : '#15803D'}; background: ${MobileApp.isStoreClosed ? '#FEF2F2' : '#DCFCE7'}; border: 1px solid ${MobileApp.isStoreClosed ? '#FCA5A5' : '#86EFAC'}; padding: 3px 8px; border-radius: 10px; cursor: pointer;">
              ${MobileApp.isStoreClosed ? '🔴 Store Paused' : '🟢 Open for Orders'}
            </button>
            <div style="font-size: 0.68rem; font-weight: 800; color: #7F1D1D; background: #FEF2F2; padding: 3px 8px; border-radius: 10px;">🏪 Merchant</div>
          </div>
        </div>

        <!-- Commercial Sequence Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: #FFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.72rem; font-weight: 800; color: #1E293B; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
          <span>📦 Orders (${activeOrders.length})</span>
          <span style="color:#CBD5E1;">→</span>
          <span>🛵 Deliveries (${inTransitOrders.length})</span>
          <span style="color:#CBD5E1;">→</span>
          <span>📈 Revenue</span>
          <span style="color:#CBD5E1;">→</span>
          <span>💳 Payouts</span>
        </div>

        <!-- Moniepoint Net Merchant Earnings Card — Darklight Blood / Maroon Theme -->
        <div class="blood-wallet-card" style="background: linear-gradient(135deg, #2b0008 0%, #4a0011 35%, #70001a 75%, #990024 100%); border: 1px solid rgba(255, 59, 86, 0.4); box-shadow: 0 12px 28px -6px rgba(128, 0, 32, 0.5), 0 0 15px rgba(255, 59, 86, 0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.72rem; font-weight: 700; opacity: 0.9; text-transform: uppercase; color: #FEE2E2;">💰 Net Merchant Earnings</span>
            <span style="background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3); color: #FFF; padding: 2px 8px; border-radius: 12px; font-size: 0.65rem; font-weight: 800;">100% Product Price (0% Loss)</span>
          </div>
          <div style="font-size: 1.65rem; font-weight: 900; margin: 6px 0 8px; color: #FFF; text-shadow: 0 2px 10px rgba(0,0,0,0.3);">
            ₦${wallet.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
          <div style="font-size: 0.68rem; opacity: 0.9; margin-bottom: 10px; border-top: 1px solid rgba(255,255,255,0.18); padding-top: 6px; color: #FECACA;">
            🏦 Settlement Bank: <strong>${vendor?.bank_name || 'GTBank'}</strong> • <code>${vendor?.account_number || '0128847112'}</code>
          </div>
          <button onclick="MobileApp.showWithdrawalModal(${wallet.balance}, '${vendor?.bank_name || 'GTBank'}', '${vendor?.account_number || '0128847112'}', '${vendor?.account_name || user.full_name}')" style="background: #FFF; color: #7F1D1D; width: 100%; justify-content: center; font-weight: 900; padding: 9px; border-radius: 10px; border: none; cursor: pointer; font-size: 0.78rem; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
            💳 Withdraw Earnings to Bank Account
          </button>
        </div>

        <!-- 4 Quick Operational Stats -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px;">
          <div class="monie-stat-card">
            <div style="font-size: 0.68rem; font-weight: 700; color: #64748B;">Pending Orders</div>
            <div style="font-size: 1.25rem; font-weight: 900; color: #B91C1C; margin-top: 2px;">${activeOrders.length}</div>
          </div>
          <div class="monie-stat-card">
            <div style="font-size: 0.68rem; font-weight: 700; color: #64748B;">In Transit</div>
            <div style="font-size: 1.25rem; font-weight: 900; color: #2563EB; margin-top: 2px;">${inTransitOrders.length}</div>
          </div>
          <div class="monie-stat-card">
            <div style="font-size: 0.68rem; font-weight: 700; color: #64748B;">Delivered Goods</div>
            <div style="font-size: 1.25rem; font-weight: 900; color: #059669; margin-top: 2px;">${completedOrders.length}</div>
          </div>
          <div class="monie-stat-card">
            <div style="font-size: 0.68rem; font-weight: 700; color: #64748B;">Catalog Items</div>
            <div style="font-size: 1.25rem; font-weight: 900; color: #7C3AED; margin-top: 2px;">${products.length}</div>
          </div>
        </div>

        <!-- 1. Orders Requiring Preparation -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size: 0.85rem; font-weight: 800; color: #1E293B;">Store Orders (${activeOrders.length})</div>
          ${activeOrders.length > 1 ? `
            <div style="display:flex;gap:4px;">
              <button onclick="MobileApp.bulkConfirmVendorOrders()" class="btn-primary btn-sm" style="font-size:0.65rem;padding:4px 8px;background:#059669;">⚡ Bulk Confirm All</button>
              <button onclick="MobileApp.bulkCancelVendorOrders()" class="btn-secondary btn-sm" style="font-size:0.65rem;padding:4px 8px;color:#DC2626;border-color:#FCA5A5;">💸 Bulk Refund</button>
            </div>
          ` : ''}
        </div>

        ${activeOrders.length === 0 ? `
          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; text-align: center; font-size: 0.72rem; color: #64748B; margin-bottom: 12px;">
            No pending orders right now. Products are live in the marketplace! 🎉
          </div>
        ` : activeOrders.map(o => `
          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 12px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
            <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 0.82rem;">
              <span>${o.order_ref}</span>
              <span class="badge badge-${o.status.toLowerCase()}">${o.status}</span>
            </div>
            <div style="font-size: 0.74rem; color: #64748B; margin: 4px 0;">Total: <strong style="color: #B91C1C;">₦${o.total_amount.toLocaleString()}</strong> • Customer: ${o.customer_name}</div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px;">
              ${o.status === 'NEW' ? `
                <button onclick="MobileApp.confirmVendorOrder('${o.id}')" class="btn-primary btn-sm" style="justify-content: center; border-radius: 8px; background: #059669; font-weight: 800; padding: 7px;">
                  ✓ Confirm Order
                </button>
              ` : `
                <div style="font-size: 0.68rem; color: #059669; font-weight: 800; display:flex; align-items:center;">✓ Confirmed</div>
              `}
              <button onclick="MobileApp.showVendorCancelModal('${o.id}', '${o.order_ref}', ${o.total_amount})" class="btn-secondary btn-sm" style="justify-content: center; border-radius: 8px; color: #DC2626; border-color: #FECACA; font-weight: 800; padding: 7px;">
                ❌ Out of Stock (Refund)
              </button>
            </div>
          </div>
        `).join('')}
      `;
    }

    if (this.vendorActiveTab === "orders") {
      return `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div style="font-size: 0.95rem; font-weight: 800; color: #1E293B;">📦 Order Fulfillment Center</div>
            ${activeOrders.length > 1 ? `
              <button onclick="MobileApp.bulkConfirmVendorOrders()" class="btn-primary btn-sm" style="font-size:0.68rem;padding:5px 10px;background:#059669;">⚡ Bulk Confirm (${activeOrders.length})</button>
            ` : ''}
          </div>
          
          <div style="font-size: 0.8rem; font-weight: 800; color: #1E293B; margin-bottom: 6px;">Active Orders (${activeOrders.length})</div>
          ${activeOrders.map(o => `
            <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 12px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 0.82rem;">
                <span>${o.order_ref}</span>
                <span class="badge badge-${o.status.toLowerCase()}">${o.status}</span>
              </div>
              <div style="font-size: 0.72rem; color: #64748B; margin: 4px 0;">Customer: ${o.customer_name} • ${o.customer_phone || ''}</div>
              <div style="font-size: 0.75rem; color: #B91C1C; font-weight: 800;">Amount: ₦${o.total_amount.toLocaleString()}</div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px;">
                ${o.status === 'NEW' ? `
                  <button onclick="MobileApp.confirmVendorOrder('${o.id}')" class="btn-primary btn-sm" style="justify-content: center; border-radius: 8px; background: #059669; font-weight: 800;">
                    ✓ Accept & Prepare
                  </button>
                ` : `
                  <div style="font-size:0.7rem;color:#059669;font-weight:800;display:flex;align-items:center;">✓ In Preparation</div>
                `}
                <button onclick="MobileApp.showVendorCancelModal('${o.id}', '${o.order_ref}', ${o.total_amount})" class="btn-secondary btn-sm" style="justify-content: center; border-radius: 8px; color: #DC2626; border-color: #FECACA; font-weight: 800;">
                  ❌ Out of Stock (Refund)
                </button>
              </div>
            </div>
          `).join('')}

          <div style="font-size: 0.8rem; font-weight: 800; color: #1E293B; margin: 14px 0 6px;">In Transit & Delivered</div>
          ${[...inTransitOrders, ...completedOrders].map(o => `
            <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 12px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 0.78rem; font-weight: 800;">${o.order_ref}</div>
                <div style="font-size: 0.68rem; color: #64748B;">${o.rider_name ? `Rider: ${o.rider_name}` : 'Dispatched'} • ₦${o.total_amount.toLocaleString()}</div>
              </div>
              <span class="badge badge-${o.status.toLowerCase()}">${o.status}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    if (this.vendorActiveTab === "products") {
      return `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 0.95rem; font-weight: 800; color: #1E293B;">🏷️ Store Product Catalog (${products.length})</div>
            <div style="display: flex; gap: 6px;">
              <button onclick="MobileApp.showVendorBulkModal()" class="btn-secondary btn-sm" style="color: var(--blood-primary); border-color: var(--blood-border); font-weight: 800; border-radius: 8px; font-size: 0.7rem; padding: 4px 8px;">
                ⚡ Bulk Edit
              </button>
              <button onclick="MobileApp.showVendorAddProductModal()" class="btn-primary btn-sm" style="border-radius: 8px; font-size: 0.7rem; padding: 4px 10px; font-weight: 800;">
                + Add Item 📦
              </button>
            </div>
          </div>

          <!-- Selection Action Bar -->
          <div id="vnd-prod-selection-bar" style="display: none; background: linear-gradient(135deg, #450A0A 0%, #7F1D1D 100%); color: #FFF; border-radius: 12px; padding: 8px 12px; margin-bottom: 10px; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(127, 29, 29, 0.25);">
            <span style="font-weight: 800; font-size: 0.75rem;" id="vnd-selected-count">0 items selected</span>
            <div style="display: flex; gap: 4px;">
              <button onclick="MobileApp.showVendorBulkModal(true)" class="btn-secondary btn-sm" style="background: #FFF; color: var(--blood-dark); font-size: 0.65rem; padding: 3px 8px; font-weight: 800;">
                ⚡ Edit
              </button>
              <button onclick="MobileApp.executeVendorQuickBulk('DELETE')" class="btn-danger btn-sm" style="font-size: 0.65rem; padding: 3px 8px; font-weight: 800;">
                🗑️ Delete
              </button>
              <button onclick="MobileApp.toggleSelectAllVendorProducts(false)" class="btn-secondary btn-sm" style="background: rgba(255,255,255,0.2); color: #FFF; font-size: 0.65rem; padding: 3px 6px;">
                ✕
              </button>
            </div>
          </div>

          <!-- Select All Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; background: #FFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 6px 12px; margin-bottom: 8px; font-size: 0.72rem; color: #64748B;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 700;">
              <input type="checkbox" id="vnd-select-all" onchange="MobileApp.toggleSelectAllVendorProducts(this.checked)">
              Select All (${products.length})
            </label>
            <span>Tap checkbox to bulk update</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${products.map(p => `
              <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" class="vnd-prod-cb" value="${p.id}" onchange="MobileApp.updateVendorSelectionBar()">
                    <img src="${p.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100'}" style="width: 46px; height: 46px; object-fit: cover; border-radius: 8px; border: 1px solid var(--blood-border);" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100'">
                    <div>
                      <div style="font-size: 0.82rem; font-weight: 800; color: #1E293B;">${p.name}</div>
                      <div style="font-size: 0.68rem; color: #64748B;">SKU: <code>${p.sku || 'N/A'}</code> • ${p.category_name}</div>
                      <div style="font-size: 0.78rem; color: var(--blood-primary); font-weight: 900; margin-top: 2px;">
                        ₦${p.price.toLocaleString()}
                        ${p.discount_price ? `<span style="font-size: 0.65rem; color: var(--emerald); font-weight: 700; margin-left: 4px;">Promo: ₦${p.discount_price.toLocaleString()}</span>` : ''}
                      </div>
                    </div>
                  </div>
                  <span class="badge badge-${p.status.toLowerCase()}" style="font-size: 0.58rem;">${p.status}</span>
                </div>

                <!-- Stock & Actions Row -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #F1F5F9; padding-top: 8px;">
                  <div style="font-size: 0.72rem; color: #64748B;">
                    Stock: <strong style="color: ${p.stock_qty > 0 ? '#1E293B' : 'red'}; font-size: 0.82rem;">${p.stock_qty}</strong>
                  </div>
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <button onclick="MobileApp.toggleProductQuickStock('${p.id}', ${p.stock_qty > 0 ? 0 : 10})" class="btn-sm" style="font-size: 0.65rem; padding: 2px 6px; border-radius: 6px; font-weight: 800; cursor: pointer; background: ${p.stock_qty > 0 ? '#DCFCE7' : '#FEF2F2'}; color: ${p.stock_qty > 0 ? '#15803D' : '#DC2626'}; border: 1px solid ${p.stock_qty > 0 ? '#86EFAC' : '#FCA5A5'};" title="Toggle active/out-of-stock">
                      ${p.stock_qty > 0 ? 'Pause ✕' : 'Resume ✓'}
                    </button>
                    <button onclick="MobileApp.quickUpdateStock('${p.id}', Math.max(0, ${p.stock_qty} - 1))" class="btn-secondary btn-sm" style="font-size: 0.65rem; padding: 2px 6px; border-radius: 6px;" title="Reduce 1 stock">-1</button>
                    <button onclick="MobileApp.quickUpdateStock('${p.id}', ${p.stock_qty} + 5)" class="btn-secondary btn-sm" style="font-size: 0.65rem; padding: 2px 6px; border-radius: 6px; font-weight: 800;" title="Add 5 stock">+5</button>
                    <button onclick="MobileApp.showVendorEditProductModal('${p.id}')" class="btn-secondary btn-sm" style="font-size: 0.65rem; padding: 2px 8px; border-radius: 6px; font-weight: 700;">✏️ Edit</button>
                    <button onclick="MobileApp.deleteVendorProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}')" class="btn-danger btn-sm" style="font-size: 0.65rem; padding: 2px 6px; border-radius: 6px;">🗑️</button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (this.vendorActiveTab === "account") {
      return `
        <div>
          <div style="font-size: 0.95rem; font-weight: 800; color: #1E293B; margin-bottom: 12px;">👤 Merchant Store Profile</div>
          
          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 14px; margin-bottom: 12px;">
            <div style="font-weight: 800; font-size: 0.95rem;">${store?.store_name}</div>
            <div style="font-size: 0.72rem; color: #64748B; margin-top: 2px;">Owner: ${user.full_name} (${user.email})</div>
            <div style="font-size: 0.72rem; color: #64748B; margin-top: 2px;">📍 Stall: ${store?.address}</div>
            <div style="margin-top: 8px;">
              <span class="badge badge-active">KYC: ${vendor?.kyc_status || 'APPROVED'}</span>
            </div>
          </div>

          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 14px; margin-bottom: 12px;">
            <div style="font-weight: 800; font-size: 0.8rem; color: #1E293B; margin-bottom: 6px;">Bank Settlement Account</div>
            <div style="font-size: 0.75rem;">Bank: <strong>${vendor?.bank_name || 'GTBank'}</strong></div>
            <div style="font-size: 0.75rem;">Account Number: <code>${vendor?.account_number || '0128847112'}</code></div>
            <div style="font-size: 0.75rem;">Account Name: <strong>${vendor?.account_name || user.full_name}</strong></div>
          </div>


          <button onclick="API.logout(); window.location.reload();" class="btn-danger" style="width: 100%; justify-content: center; padding: 11px; border-radius: 12px; font-weight: 800;">
            Sign Out
          </button>
        </div>
      `;
    }
  },

  async confirmVendorOrder(orderId) {
    try {
      await API.post(`/api/orders/${orderId}/transition`, { status: "CONFIRMED", notes: "Vendor confirmed and accepted order" });
      API.showToast("Order Confirmed! Ready for Dispatch.", "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {}
  },

  showVendorCancelModal(orderId, orderRef, totalAmount) {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 360px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1.05rem; font-weight: 800; color: #7F1D1D;">❌ Out of Stock — Refund Customer</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 12px; margin-bottom: 12px; font-size: 0.75rem;">
          <div style="font-weight: 800; color: #991B1B; margin-bottom: 4px;">Instant Customer Refund Protection:</div>
          <div style="color: #7F1D1D;">
            Cancelling order <strong>${orderRef}</strong> will immediately and automatically refund <strong>₦${totalAmount.toLocaleString()}</strong> directly back into the customer's wallet.
          </div>
        </div>

        <div class="rp-form-group">
          <label class="rp-label">Reason for Cancellation</label>
          <select id="vnd-cancel-reason" class="rp-select">
            <option value="Item completely out of stock in stall">Item completely out of stock in stall</option>
            <option value="Product damaged or expired">Product damaged or expired</option>
            <option value="Store temporarily closed">Store temporarily closed</option>
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px;">
          <button onclick="this.closest('.modal-backdrop').remove()" class="btn-secondary" style="justify-content: center; border-radius: 10px; padding: 10px;">
            Keep Order
          </button>
          <button onclick="MobileApp.executeVendorCancel('${orderId}')" class="btn-danger" style="justify-content: center; border-radius: 10px; padding: 10px; background: #DC2626; font-weight: 800;">
            Confirm & Refund 💸
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async executeVendorCancel(orderId) {
    const reason = document.getElementById("vnd-cancel-reason")?.value || "Item out of stock";
    try {
      const res = await API.post(`/api/orders/${orderId}/vendor-cancel`, { reason });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message, "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {}
  },

  async bulkConfirmVendorOrders() {
    try {
      const oRes = await API.get("/api/orders/", { silent: true });
      const pendingIds = (oRes?.orders || []).filter(o => o.status === 'NEW').map(o => o.id);
      if (pendingIds.length === 0) {
        API.showToast("No pending orders to confirm", "info");
        return;
      }
      const res = await API.post("/api/orders/vendor/bulk-confirm", { order_ids: pendingIds });
      API.showToast(res.message, "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {}
  },

  async bulkCancelVendorOrders() {
    if (!confirm("Are you sure you want to cancel all active orders and refund the money instantly to customers?")) return;
    try {
      const oRes = await API.get("/api/orders/", { silent: true });
      const activeIds = (oRes?.orders || []).filter(o => ['NEW', 'CONFIRMED'].includes(o.status)).map(o => o.id);
      if (activeIds.length === 0) {
        API.showToast("No active orders to cancel", "info");
        return;
      }
      const res = await API.post("/api/orders/vendor/bulk-cancel", { order_ids: activeIds, reason: "Store Bulk Stock Clearance" });
      API.showToast(res.message, "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {}
  },

  async quickUpdateStock(productId, newQty) {
    try {
      await API.put(`/api/products/${productId}`, { stock_qty: newQty });
      API.showToast("Stock updated", "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {}
  },

  toggleSelectAllVendorProducts(checked) {
    document.querySelectorAll(".vnd-prod-cb").forEach(cb => cb.checked = checked);
    const selAll = document.getElementById("vnd-select-all");
    if (selAll) selAll.checked = checked;
    this.updateVendorSelectionBar();
  },

  updateVendorSelectionBar() {
    const selected = Array.from(document.querySelectorAll(".vnd-prod-cb:checked")).map(cb => cb.value);
    const bar = document.getElementById("vnd-prod-selection-bar");
    const countSpan = document.getElementById("vnd-selected-count");
    if (!bar) return;
    if (selected.length > 0) {
      bar.style.display = "flex";
      if (countSpan) countSpan.innerText = `${selected.length} items selected`;
    } else {
      bar.style.display = "none";
    }
  },

  async executeVendorQuickBulk(action) {
    const selected = Array.from(document.querySelectorAll(".vnd-prod-cb:checked")).map(cb => cb.value);
    if (selected.length === 0) {
      API.showToast("Please select at least one product", "warning");
      return;
    }
    if (!confirm(`Are you sure you want to ${action === 'DELETE' ? 'permanently delete' : action} ${selected.length} selected product(s)?`)) return;

    try {
      const res = await API.post("/api/products/bulk-stock-price", { action, product_ids: selected });
      API.showToast(res.message, "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {}
  },

  async deleteVendorProduct(productId, prodName) {
    if (!confirm(`Are you sure you want to delete '${prodName}' from your store catalog?`)) return;
    try {
      const res = await API.delete(`/api/products/${productId}`);
      API.showToast(res.message || "Product deleted", "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {}
  },

  async showVendorAddProductModal() {
    let categories = [];
    try {
      const cRes = await API.get("/api/categories/");
      if (cRes && cRes.categories) categories = cRes.categories;
    } catch (e) {}

    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 440px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--blood-dark);">📦 Add New Product to Store</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="MobileApp.handleVendorCreateProduct(event)">
          <div class="rp-form-group">
            <label class="rp-label">Product Name *</label>
            <input type="text" id="vnd-p-name" class="rp-input" placeholder="e.g. Fresh Yam Tuber (Large)" required>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div class="rp-form-group">
              <label class="rp-label">Category *</label>
              <select id="vnd-p-cat" class="rp-select" required>
                ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="rp-form-group">
              <label class="rp-label">SKU (Optional)</label>
              <input type="text" id="vnd-p-sku" class="rp-input" placeholder="e.g. YAM-01">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div class="rp-form-group">
              <label class="rp-label">Price (NGN) *</label>
              <input type="number" id="vnd-p-price" class="rp-input" placeholder="3500" required min="10">
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Initial Stock *</label>
              <input type="number" id="vnd-p-stock" class="rp-input" placeholder="20" required min="0">
            </div>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Product Image * (2 Options)</label>
            <div style="display: flex; gap: 6px; margin-bottom: 8px;">
              <button type="button" id="vnd-p-tab-upload" onclick="MobileApp.switchVndImgTab('vnd-p', 'upload')" style="flex: 1; padding: 6px; background: var(--blood-primary); color: #FFF; border: none; border-radius: 8px; font-size: 0.72rem; font-weight: 800; cursor: pointer;">
                📁 Option 1: Upload (Auto-Compressed)
              </button>
              <button type="button" id="vnd-p-tab-url" onclick="MobileApp.switchVndImgTab('vnd-p', 'url')" style="flex: 1; padding: 6px; background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
                🔗 Option 2: Image URL
              </button>
            </div>

            <!-- Option 1: Upload -->
            <div id="vnd-p-upload-sec" style="display: block; border: 2px dashed #CBD5E1; border-radius: 12px; padding: 12px; text-align: center; background: #F8FAFC;">
              <input type="file" id="vnd-p-file" accept="image/*" style="display: none;" onchange="MobileApp.processAndUploadVendorImage(this, 'vnd-p-img', 'vnd-p-img-preview', 'vnd-p-img-status')">
              <button type="button" onclick="document.getElementById('vnd-p-file').click()" class="btn-secondary btn-sm" style="padding: 7px 14px; font-weight: 800; cursor: pointer;">
                📷 Choose Picture from Phone / System
              </button>
              <div style="font-size: 0.68rem; color: #64748B; margin-top: 4px;">Automatically compressed to small KB (< 150KB) with high quality.</div>
              <div id="vnd-p-img-status" style="margin-top: 4px;"></div>
            </div>

            <!-- Option 2: URL -->
            <div id="vnd-p-url-sec" style="display: none;">
              <input type="url" id="vnd-p-img" class="rp-input" placeholder="https://..." required value="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500" oninput="MobileApp.updateVndImagePreview(this.value, 'vnd-p-img-preview')">
              
              <!-- Quick Preset Buttons -->
              <div style="display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap;">
                <span style="font-size: 0.65rem; color: #64748B; align-self: center;">Presets:</span>
                <button type="button" class="product-preset-btn" style="font-size: 0.65rem; padding: 2px 6px;" onclick="MobileApp.applyVndImagePreset('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500', 'vnd-p-img', 'vnd-p-img-preview')">🍔 Food</button>
                <button type="button" class="product-preset-btn" style="font-size: 0.65rem; padding: 2px 6px;" onclick="MobileApp.applyVndImagePreset('https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500', 'vnd-p-img', 'vnd-p-img-preview')">💻 Tech</button>
                <button type="button" class="product-preset-btn" style="font-size: 0.65rem; padding: 2px 6px;" onclick="MobileApp.applyVndImagePreset('https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=500', 'vnd-p-img', 'vnd-p-img-preview')">🏗️ Building</button>
                <button type="button" class="product-preset-btn" style="font-size: 0.65rem; padding: 2px 6px;" onclick="MobileApp.applyVndImagePreset('https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=500', 'vnd-p-img', 'vnd-p-img-preview')">🌾 Agro</button>
                <button type="button" class="product-preset-btn" style="font-size: 0.65rem; padding: 2px 6px;" onclick="MobileApp.applyVndImagePreset('https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=500', 'vnd-p-img', 'vnd-p-img-preview')">👕 Fashion</button>
              </div>
            </div>

            <!-- Live Image Preview Thumbnail -->
            <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px; background: #FFF5F5; border: 1px solid #FECACA; border-radius: 10px; padding: 6px;">
              <img id="vnd-p-img-preview" src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px; border: 1px solid #FECACA;" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500'">
              <div style="font-size: 0.68rem; color: #7F1D1D;">
                <div style="font-weight: 800;">📷 Live Visual Preview</div>
                <div>Displays on marketplace catalog</div>
              </div>
            </div>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Description (Optional)</label>
            <textarea id="vnd-p-desc" class="rp-textarea" rows="2" placeholder="Item description..."></textarea>
          </div>

          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px; border-radius: 12px; font-weight: 800;">
            Publish to Storefront 🚀
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  updateVndImagePreview(url, previewId) {
    const img = document.getElementById(previewId);
    if (img && url) img.src = url.trim();
  },

  applyVndImagePreset(url, inputId, previewId) {
    const inp = document.getElementById(inputId);
    if (inp) inp.value = url;
    this.updateVndImagePreview(url, previewId);
  },

  async handleVendorCreateProduct(e) {
    e.preventDefault();
    const name = document.getElementById("vnd-p-name").value.trim();
    const category_id = document.getElementById("vnd-p-cat").value;
    const sku = document.getElementById("vnd-p-sku").value.trim() || undefined;
    const price = parseFloat(document.getElementById("vnd-p-price").value);
    const stock_qty = parseInt(document.getElementById("vnd-p-stock").value);
    const image_url = document.getElementById("vnd-p-img").value.trim();
    const description = document.getElementById("vnd-p-desc").value.trim();

    try {
      const res = await API.post("/api/products/", {
        name, category_id, sku, price, stock_qty, image_url, description
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message || "Product published successfully!", "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (err) {}
  },

  async showVendorEditProductModal(productId) {
    let p = null;
    let categories = [];
    try {
      const res = await API.get(`/api/products/${productId}`);
      if (res) p = res.product;
      const cRes = await API.get("/api/categories/");
      if (cRes && cRes.categories) categories = cRes.categories;
    } catch (e) {}

    if (!p) return;

    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 440px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--blood-dark);">✏️ Edit Product</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="MobileApp.handleVendorSaveProduct(event, '${productId}')">
          <div class="rp-form-group">
            <label class="rp-label">Product Name</label>
            <input type="text" id="edit-vp-name" class="rp-input" value="${p.name}" required>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div class="rp-form-group">
              <label class="rp-label">Category</label>
              <select id="edit-vp-cat" class="rp-select">
                ${categories.map(c => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="rp-form-group">
              <label class="rp-label">SKU</label>
              <input type="text" id="edit-vp-sku" class="rp-input" value="${p.sku || ''}">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div class="rp-form-group">
              <label class="rp-label">Price (NGN)</label>
              <input type="number" id="edit-vp-price" class="rp-input" value="${p.price}" required min="1">
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Stock Quantity</label>
              <input type="number" id="edit-vp-stock" class="rp-input" value="${p.stock_qty}" required min="0">
            </div>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Product Image URL *</label>
            <input type="url" id="edit-vp-img" class="rp-input" value="${p.image_url}" required oninput="MobileApp.updateVndImagePreview(this.value, 'edit-vp-img-preview')">
            
            <!-- Quick Preset Buttons -->
            <div style="display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap;">
              <span style="font-size: 0.65rem; color: #64748B; align-self: center;">Presets:</span>
              <button type="button" class="product-preset-btn" style="font-size: 0.65rem; padding: 2px 6px;" onclick="MobileApp.applyVndImagePreset('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500', 'edit-vp-img', 'edit-vp-img-preview')">🍔 Food</button>
              <button type="button" class="product-preset-btn" style="font-size: 0.65rem; padding: 2px 6px;" onclick="MobileApp.applyVndImagePreset('https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500', 'edit-vp-img', 'edit-vp-img-preview')">💻 Tech</button>
              <button type="button" class="product-preset-btn" style="font-size: 0.65rem; padding: 2px 6px;" onclick="MobileApp.applyVndImagePreset('https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=500', 'edit-vp-img', 'edit-vp-img-preview')">🏗️ Building</button>
              <button type="button" class="product-preset-btn" style="font-size: 0.65rem; padding: 2px 6px;" onclick="MobileApp.applyVndImagePreset('https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=500', 'edit-vp-img', 'edit-vp-img-preview')">🌾 Agro</button>
              <button type="button" class="product-preset-btn" style="font-size: 0.65rem; padding: 2px 6px;" onclick="MobileApp.applyVndImagePreset('https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=500', 'edit-vp-img', 'edit-vp-img-preview')">👕 Fashion</button>
            </div>

            <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px; background: #FFF5F5; border: 1px solid #FECACA; border-radius: 10px; padding: 6px;">
              <img id="edit-vp-img-preview" src="${p.image_url}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px; border: 1px solid #FECACA;" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500'">
              <div style="font-size: 0.68rem; color: #7F1D1D;">
                <div style="font-weight: 800;">📷 Live Visual Preview</div>
                <div>Visual identifier for customers and riders</div>
              </div>
            </div>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Description</label>
            <textarea id="edit-vp-desc" class="rp-textarea" rows="2">${p.description || ''}</textarea>
          </div>

          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px; border-radius: 12px; font-weight: 800;">
            Save Product Changes 💾
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleVendorSaveProduct(e, productId) {
    e.preventDefault();
    const name = document.getElementById("edit-vp-name").value.trim();
    const category_id = document.getElementById("edit-vp-cat").value;
    const sku = document.getElementById("edit-vp-sku").value.trim();
    const price = parseFloat(document.getElementById("edit-vp-price").value);
    const stock_qty = parseInt(document.getElementById("edit-vp-stock").value);
    const image_url = document.getElementById("edit-vp-img").value.trim();
    const description = document.getElementById("edit-vp-desc").value.trim();

    try {
      await API.put(`/api/products/${productId}`, {
        name, category_id, sku, price, stock_qty, image_url, description
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast("Product updated successfully!", "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (err) {}
  },

  showVendorBulkModal(onlySelected = false) {
    const selected = Array.from(document.querySelectorAll(".vnd-prod-cb:checked")).map(cb => cb.value);
    const targetList = onlySelected && selected.length > 0 ? selected : (selected.length > 0 ? selected : []);

    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 400px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--blood-dark);">⚡ Bulk Price & Stock Update</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 10px; padding: 8px 10px; margin-bottom: 12px; font-size: 0.72rem; color: #92400E;">
          <strong>Target:</strong> ${targetList.length > 0 ? `${targetList.length} items selected` : 'All store items'}
        </div>

        <form onsubmit="MobileApp.handleVendorBulkUpdate(event, ${JSON.stringify(targetList)})">
          <div class="rp-form-group">
            <label class="rp-label">Action</label>
            <select id="vnd-bulk-action" class="rp-select" onchange="MobileApp.updateVndBulkLabel(this.value)">
              <option value="PERCENT_INCREASE">Increase Price by Percentage (+%)</option>
              <option value="PERCENT_DECREASE">Decrease Price by Percentage (-%)</option>
              <option value="FIXED_INCREASE">Increase Price by Fixed Amount (+₦)</option>
              <option value="FIXED_DECREASE">Reduce Price by Fixed Amount (-₦)</option>
              <option value="SET_PRICE">Set Fixed Price (₦)</option>
              <option value="SET_STOCK">Set Stock Inventory</option>
              <option value="OUT_OF_STOCK">Mark as Out of Stock (0 Qty)</option>
              <option value="DELETE">Delete Items</option>
            </select>
          </div>

          <div class="rp-form-group" id="vnd-bulk-val-grp">
            <label class="rp-label" id="vnd-bulk-val-lbl">Percentage (%)</label>
            <input type="number" id="vnd-bulk-val" class="rp-input" placeholder="5" value="5" step="any">
          </div>

          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px; border-radius: 12px; font-weight: 800; margin-top: 10px;">
            Apply Bulk Changes ⚡
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  updateVndBulkLabel(action) {
    const lbl = document.getElementById("vnd-bulk-val-lbl");
    const grp = document.getElementById("vnd-bulk-val-grp");
    if (!lbl || !grp) return;

    if (action.includes("PERCENT")) {
      grp.style.display = "block";
      lbl.innerText = "Percentage Value (%)";
    } else if (action.includes("FIXED") || action === "SET_PRICE") {
      grp.style.display = "block";
      lbl.innerText = "Amount in NGN (₦)";
    } else if (action === "SET_STOCK") {
      grp.style.display = "block";
      lbl.innerText = "Stock Quantity Units";
    } else {
      grp.style.display = "none";
    }
  },

  async handleVendorBulkUpdate(e, selectedIds) {
    e.preventDefault();
    const action = document.getElementById("vnd-bulk-action").value;
    const value = parseFloat(document.getElementById("vnd-bulk-val")?.value || 0);

    const countLabel = selectedIds.length > 0 ? `${selectedIds.length} selected items` : 'all store products';
    if (!confirm(`Apply ${action} to ${countLabel}?`)) return;

    try {
      const res = await API.post("/api/products/bulk-stock-price", {
        action, value, product_ids: selectedIds.length > 0 ? selectedIds : undefined
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message, "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (err) {}
  },

  // ==========================================
  // RIDER MOBILE APP VIEW (OPay Courier Style with Native Phone GPS)
  // ==========================================
  riderActiveTab: "mission",
  deviceCoords: null,
  gpsWatchId: null,

  async renderRiderApp(container, user) {
    let profile = null;
    let wallet = { balance: 0.0 };

    try {
      const res = await API.get("/api/riders/profile", { silent: true });
      if (res) profile = res;
      const wRes = await API.get("/api/finance/wallet/me", { silent: true });
      if (wRes && wRes.wallet) wallet = wRes.wallet;
    } catch (e) {}

    const rider = profile?.rider;
    const activeOrder = profile?.active_order;

    // Start Native Device Phone GPS Tracking if Rider is Online
    if (rider?.operational_status === 'AVAILABLE') {
      this.startDeviceGpsTracking();
    }

    container.innerHTML = `
      <div class="mobile-app-shell">
        <!-- Rider Header (Dark-Light Blood Theme with Live Phone GPS) -->
        <div class="mobile-app-header" style="background: linear-gradient(135deg, #450A0A 0%, #7F1D1D 50%, #B91C1C 100%);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <button onclick="MobileApp.toggleRiderDrawer(true)" style="background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.25); color: #FFF; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; cursor: pointer;">
              ☰
            </button>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-weight: 900; font-size: 0.95rem;">${rider?.rider_ref || 'Rider'}</span>
                <span class="badge badge-${rider?.operational_status === 'AVAILABLE' ? 'active' : 'pending'}" style="font-size: 0.58rem; padding: 2px 6px;">${rider?.operational_status || 'AVAILABLE'}</span>
              </div>
              <div style="font-size: 0.65rem; opacity: 0.88; color: #FEE2E2;">
                ${rider?.vehicle_type === 'TRICYCLE' ? '🛺 Tricycle (Cargo Keke)' : '🛵 Motorcycle'} (${rider?.plate_number || 'KT-992-ABJ'})
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button onclick="MobileApp.toggleRiderShift('${rider?.operational_status === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE'}')" style="background: ${rider?.operational_status === 'AVAILABLE' ? '#059669' : 'rgba(255,255,255,0.25)'}; color: #FFF; border: none; padding: 5px 10px; border-radius: 14px; font-size: 0.68rem; font-weight: 800; cursor: pointer;">
              ${rider?.operational_status === 'AVAILABLE' ? '🟢 ONLINE' : '⚪ OFFLINE'}
            </button>
            <button onclick="MobileApp.showHelpModal()" style="background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.25); color: #FFF; padding: 5px 9px; border-radius: 12px; font-size: 0.68rem; font-weight: 700; cursor: pointer;">
              Help 💬
            </button>
          </div>
        </div>

        <!-- Phone Native GPS Telemetry Banner -->
        <div style="background: #1E1B4B; color: #E0E7FF; padding: 6px 12px; font-size: 0.68rem; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${this.deviceCoords ? '#10B981' : '#F59E0B'}; box-shadow: 0 0 8px ${this.deviceCoords ? '#10B981' : '#F59E0B'};"></span>
            <span>
              ${this.deviceCoords ? `📍 Device GPS: ${this.deviceCoords.lat.toFixed(4)}, ${this.deviceCoords.lng.toFixed(4)}` : '📍 Connecting to Device Location...'}
            </span>
          </div>
          <button onclick="MobileApp.syncDeviceGpsNow()" style="background: rgba(255,255,255,0.15); border: none; color: #FFF; font-size: 0.62rem; padding: 2px 6px; border-radius: 6px; cursor: pointer; font-weight: 700;">
            Sync GPS
          </button>
        </div>

        <div class="mobile-content-area">
          ${this.getRiderTabHtml(activeOrder, rider, wallet, user)}
        </div>

        <!-- Rider 3-Tab Bottom Navigation -->
        <div class="mobile-bottom-nav">
          <button class="bottom-tab-btn ${this.riderActiveTab === 'mission' ? 'active' : ''}" onclick="MobileApp.riderActiveTab = 'mission'; MobileApp.render();">
            <span class="bottom-tab-icon">🛵</span>
            <span>Mission</span>
          </button>
          <button class="bottom-tab-btn ${this.riderActiveTab === 'earnings' ? 'active' : ''}" onclick="MobileApp.riderActiveTab = 'earnings'; MobileApp.render();">
            <span class="bottom-tab-icon">💰</span>
            <span>Earnings</span>
          </button>
          <button class="bottom-tab-btn ${this.riderActiveTab === 'account' ? 'active' : ''}" onclick="MobileApp.riderActiveTab = 'account'; MobileApp.render();">
            <span class="bottom-tab-icon">👤</span>
            <span>Profile</span>
          </button>
        </div>

        <!-- Rider Drawer Sidebar -->
        <div class="mobile-drawer-overlay" id="rider-sidebar-drawer" onclick="if(event.target === this) MobileApp.toggleRiderDrawer(false)">
          <div class="mobile-drawer">
            <div class="mobile-drawer-header">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div style="width: 44px; height: 44px; border-radius: 12px; background: #FFF; color: #B91C1C; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 900;">
                    ${rider?.vehicle_type === 'TRICYCLE' ? '🛺' : '🛵'}
                  </div>
                  <div>
                    <div style="font-weight: 900; font-size: 0.95rem; color: #FFF;">${rider?.full_name || user.full_name}</div>
                    <div style="font-size: 0.68rem; opacity: 0.85; color: #FEE2E2;">${rider?.rider_ref} • ⭐ ${rider?.rating || '5.0'}</div>
                  </div>
                </div>
                <button onclick="MobileApp.toggleRiderDrawer(false)" style="background: rgba(255,255,255,0.2); border: none; color: #FFF; width: 26px; height: 26px; border-radius: 50%; cursor: pointer;">✕</button>
              </div>

              <div style="background: rgba(0,0,0,0.25); border-radius: 12px; padding: 10px; margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-size: 0.64rem; text-transform: uppercase; opacity: 0.85;">Trip Earnings</div>
                  <div style="font-size: 1.1rem; font-weight: 900; color: #FFF;">₦${wallet.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                </div>
                <button onclick="MobileApp.toggleRiderDrawer(false); MobileApp.showWithdrawalModal(${wallet.balance}, 'Access Bank', '0691128394', '${user.full_name}')" style="background: #FFF; color: #B91C1C; border: none; padding: 4px 10px; border-radius: 8px; font-size: 0.68rem; font-weight: 800; cursor: pointer;">
                  Withdraw
                </button>
              </div>
            </div>

            <div class="mobile-drawer-menu">
              <!-- Rider Profile Summary Card -->
              <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:0.72rem;font-weight:800;color:var(--blood-dark);">🛵 Fleet Rider Profile</span>
                  <span class="badge badge-${rider?.operational_status === 'AVAILABLE' ? 'active' : (rider?.operational_status === 'OFFLINE' ? 'cancelled' : 'pending')}" style="font-size:0.58rem;">
                    ${rider?.operational_status || 'AVAILABLE'}
                  </span>
                </div>
                <div style="font-size:0.68rem;color:#64748B;margin-top:4px;">
                  Vehicle: <strong>${rider?.vehicle_type || 'MOTORCYCLE'}</strong> • Plate: <code>${rider?.plate_number || 'LAG-123-XY'}</code>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px;">
                  <button onclick="MobileApp.toggleRiderDrawer(false); MobileApp.showUserProfileModal();" class="btn-secondary btn-sm" style="flex:1;font-size:0.65rem;padding:4px;justify-content:center;">
                    👤 View Profile
                  </button>
                  <button onclick="MobileApp.toggleRiderDrawer(false); MobileApp.showChangePasswordModal();" class="btn-secondary btn-sm" style="flex:1;font-size:0.65rem;padding:4px;justify-content:center;color:var(--blood-primary);border-color:var(--blood-border);">
                    🔒 Password
                  </button>
                </div>
              </div>

              <div class="mobile-drawer-section-title">Courier Logistics</div>
              <div class="mobile-drawer-item ${this.riderActiveTab === 'mission' ? 'active' : ''}" onclick="MobileApp.toggleRiderDrawer(false); MobileApp.riderActiveTab = 'mission'; MobileApp.render();">
                <span class="mobile-drawer-icon">🛵</span> <span>Active Delivery Mission</span>
              </div>
              <div class="mobile-drawer-item ${this.riderActiveTab === 'earnings' ? 'active' : ''}" onclick="MobileApp.toggleRiderDrawer(false); MobileApp.riderActiveTab = 'earnings'; MobileApp.render();">
                <span class="mobile-drawer-icon">💰</span> <span>Trip Earnings & Wallet</span>
              </div>
              <div class="mobile-drawer-item ${this.riderActiveTab === 'account' ? 'active' : ''}" onclick="MobileApp.toggleRiderDrawer(false); MobileApp.riderActiveTab = 'account'; MobileApp.render();">
                <span class="mobile-drawer-icon">👤</span> <span>Rider Profile & Vehicle</span>
              </div>

              <div class="mobile-drawer-section-title">Security & Controls</div>
              <div class="mobile-drawer-item" onclick="MobileApp.toggleRiderDrawer(false); MobileApp.showChangePasswordModal();">
                <span class="mobile-drawer-icon">🔒</span> <span>Change Password</span>
              </div>
              <div class="mobile-drawer-item" onclick="MobileApp.toggleRiderDrawer(false); MobileApp.showHelpModal();">
                <span class="mobile-drawer-icon">💬</span> <span>Rider Dispatch Help Desk</span>
              </div>
            </div>

            <div style="padding: 12px 14px; border-top: 1px solid #E2E8F0; background: #F8FAFC;">
              <button onclick="API.logout(); window.location.reload();" class="btn-danger btn-sm" style="width: 100%; justify-content: center; padding: 9px; border-radius: 10px; font-weight: 800;">
                🚪 Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  startDeviceGpsTracking() {
    if (navigator.geolocation && !this.gpsWatchId) {
      this.gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.deviceCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          API.post("/api/riders/telemetry", {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          }, { silent: true });
        },
        (err) => {
          // Fallback to default Katsina/Lagos hub coordinates
          if (!this.deviceCoords) {
            this.deviceCoords = { lat: 6.5244, lng: 3.3792 };
          }
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    }
  },

  syncDeviceGpsNow() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.deviceCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          API.post("/api/riders/telemetry", { lat: pos.coords.latitude, lng: pos.coords.longitude });
          API.showToast(`GPS Synced: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`, "success");
          this.render();
        },
        (err) => {
          this.deviceCoords = { lat: 6.5244, lng: 3.3792 };
          API.post("/api/riders/telemetry", { lat: 6.5244, lng: 3.3792 });
          API.showToast("Default GPS Hub locked (6.5244, 3.3792)", "info");
          this.render();
        }
      );
    } else {
      API.showToast("Device Geolocation not supported on this browser", "error");
    }
  },

  useCustomerDeviceGps(targetInputId) {
    if (navigator.geolocation) {
      API.showToast("📡 Requesting device GPS location...", "info");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(5);
          const lng = pos.coords.longitude.toFixed(5);
          const el = document.getElementById(targetInputId);
          if (el) {
            el.value = `📍 Device GPS (${lat}, ${lng}) - Exact Doorstep Dropoff`;
            API.showToast("Device GPS captured successfully!", "success");
          }
        },
        (err) => {
          const el = document.getElementById(targetInputId);
          if (el) {
            el.value = `📍 Katsina Central Hub (Bayajidda Road / Kofar Kaura)`;
            API.showToast("Location set to Katsina Central Hub", "info");
          }
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  },

  toggleRiderDrawer(open) {
    const drawer = document.getElementById("rider-sidebar-drawer");
    if (drawer) {
      if (open) {
        drawer.classList.add("open");
      } else {
        drawer.classList.remove("open");
      }
    }
  },

  getRiderTabHtml(activeOrder, rider, wallet, user) {
    if (this.riderActiveTab === "mission") {
      return `
        <!-- Rider Earnings Card — Darklight Blood / Maroon Theme -->
        <div class="blood-wallet-card" style="background: linear-gradient(135deg, #2b0008 0%, #4a0011 35%, #70001a 75%, #990024 100%); border: 1px solid rgba(255, 59, 86, 0.4); box-shadow: 0 12px 28px -6px rgba(128, 0, 32, 0.5), 0 0 15px rgba(255, 59, 86, 0.2);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.72rem; font-weight: 700; opacity: 0.9; text-transform: uppercase; color: #FEE2E2;">🛵 Trip Earnings (80% Commission)</span>
            <button onclick="MobileApp.toggleRiderOnlineStatus()" style="background: ${MobileApp.isRiderOnline ? '#22C55E' : '#94A3B8'}; color: #FFF; border: none; padding: 3px 9px; border-radius: 12px; font-size: 0.68rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 4px;">
              ${MobileApp.isRiderOnline ? '🟢 Online & Ready' : '⚪ Off-Duty'}
            </button>
          </div>
          <div style="font-size: 1.65rem; font-weight: 900; margin: 4px 0 8px; color: #FFF; text-shadow: 0 2px 10px rgba(0,0,0,0.3);">
            ₦${wallet.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
          <div style="font-size: 0.68rem; opacity: 0.9; margin-bottom: 10px; border-top: 1px solid rgba(255,255,255,0.18); padding-top: 6px; color: #FECACA;">
            🏦 Payout Bank: <strong>Access Bank</strong> • <code>0691128394</code> (${user.full_name})
          </div>
          <button onclick="MobileApp.showWithdrawalModal(${wallet.balance}, 'Access Bank', '0691128394', '${user.full_name}')" style="background: #FFF; color: #7F1D1D; width: 100%; justify-content: center; font-weight: 900; padding: 9px; border-radius: 10px; border: none; cursor: pointer; font-size: 0.78rem; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
            💳 Withdraw Earnings to Bank
          </button>
        </div>

        <!-- Active Mission Card -->
        ${activeOrder ? `
          <div style="background: #FFF; border: 2px solid #B91C1C; border-radius: 18px; padding: 16px; margin-bottom: 14px; box-shadow: 0 4px 14px rgba(185, 28, 28, 0.12);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-weight: 900; font-size: 0.95rem; color: #7F1D1D;">Active Mission: ${activeOrder.order_ref}</span>
              <span class="badge badge-${activeOrder.status.toLowerCase()}">${activeOrder.status}</span>
            </div>
            
            <div style="font-size: 0.75rem; margin-bottom: 4px;">🏪 Pickup: <strong>${activeOrder.store_name}</strong> (${activeOrder.store_address})</div>
            <div style="font-size: 0.75rem; margin-bottom: 8px;">📍 Dropoff: <strong>${activeOrder.delivery_address}</strong></div>

            <!-- 1-Tap Google Maps Navigation & Customer Contact -->
            <div style="display: flex; gap: 6px; margin-bottom: 12px;">
              <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(activeOrder.delivery_address)}" target="_blank" rel="noopener" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; background: #EFF6FF; border: 1px solid #93C5FD; color: #1D4ED8; padding: 8px 10px; border-radius: 10px; font-size: 0.72rem; font-weight: 800; text-decoration: none;">
                🗺️ Google Maps Navigation
              </a>
              ${activeOrder.customer_phone ? `
                <a href="tel:${activeOrder.customer_phone}" style="display: flex; align-items: center; justify-content: center; gap: 4px; background: #ECFDF5; border: 1px solid #A7F3D0; color: #059669; padding: 8px 10px; border-radius: 10px; font-size: 0.72rem; font-weight: 800; text-decoration: none;">
                  📞 Call
                </a>
              ` : ''}
            </div>

            <!-- Mission Action Steps -->
            ${activeOrder.status === 'ASSIGNED' ? `
              <button onclick="MobileApp.progressRiderOrder('${activeOrder.id}', 'PICKED_UP', 'Package collected from merchant')" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px; border-radius: 12px; background: #B91C1C; font-weight: 900;">
                Confirm Package Pickup 📦
              </button>
            ` : activeOrder.status === 'PICKED_UP' ? `
              <button onclick="MobileApp.progressRiderOrder('${activeOrder.id}', 'IN_TRANSIT', 'Heading to customer destination')" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px; border-radius: 12px; background: #B91C1C; font-weight: 900;">
                Start Trip (In Transit) 🛵
              </button>
            ` : activeOrder.status === 'IN_TRANSIT' ? `
              <button onclick="MobileApp.progressRiderOrder('${activeOrder.id}', 'ARRIVED', 'Arrived at customer doorstep')" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px; border-radius: 12px; background: #B91C1C; font-weight: 900;">
                I Have Arrived at Location 📍
              </button>
            ` : activeOrder.status === 'ARRIVED' ? `
              <div style="background: #FFF5F5; border: 1px solid #FECACA; border-radius: 12px; padding: 12px; margin-top: 6px;">
                <div style="font-size: 0.78rem; font-weight: 800; color: #7F1D1D; margin-bottom: 6px;">🔐 Enter Customer's 4-Digit OTP to Complete</div>
                <div style="display: flex; gap: 8px;">
                  <input type="text" id="pod-otp-input" class="rp-input" placeholder="4-digit OTP" maxlength="4" style="text-align: center; font-size: 1.2rem; font-weight: 900; letter-spacing: 3px; border-radius: 10px;">
                  <button onclick="MobileApp.submitPODVerification('${activeOrder.id}')" class="btn-primary" style="white-space: nowrap; border-radius: 10px; background: #B91C1C; font-weight: 800;">
                    Verify POD ✓
                  </button>
                </div>
              </div>
            ` : ''}
          </div>
        ` : `
          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 18px; padding: 30px 16px; text-align: center; color: #64748B; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
            <div style="font-size: 3rem; margin-bottom: 8px;">🛵</div>
            <div style="font-weight: 900; font-size: 0.95rem; color: #1E293B;">Waiting for Next Dispatch</div>
            <p style="font-size: 0.74rem; margin-top: 4px;">Stay online to receive automated nearby recommendations and station waybill dispatches.</p>
          </div>
        `}
      `;
    }

    if (this.riderActiveTab === "earnings") {
      return `
        <div>
          <div style="font-size: 0.95rem; font-weight: 800; color: #1E293B; margin-bottom: 12px;">💰 Rider Earnings & Wallet</div>
          
          <div class="blood-wallet-card" style="background: linear-gradient(135deg, #2b0008 0%, #4a0011 35%, #70001a 75%, #990024 100%); border: 1px solid rgba(255, 59, 86, 0.4); box-shadow: 0 12px 28px -6px rgba(128, 0, 32, 0.5), 0 0 15px rgba(255, 59, 86, 0.2);">
            <div style="font-size: 0.72rem; font-weight: 700; opacity: 0.9; text-transform: uppercase; color: #FEE2E2;">Available Balance</div>
            <div style="font-size: 1.65rem; font-weight: 900; margin: 4px 0 10px; color: #FFF; text-shadow: 0 2px 10px rgba(0,0,0,0.3);">
              ₦${wallet.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
            <button onclick="MobileApp.showWithdrawalModal(${wallet.balance}, 'Access Bank', '0691128394', '${user.full_name}')" style="background: #FFF; color: #7F1D1D; border: none; width: 100%; padding: 9px; border-radius: 10px; font-weight: 900; font-size: 0.78rem; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
              💳 Withdraw Earnings to Bank
            </button>
          </div>

          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 14px;">
            <div style="font-weight: 800; font-size: 0.82rem; color: #1E293B; margin-bottom: 6px;">Commission Model</div>
            <div style="font-size: 0.75rem; color: #64748B;">
              ${rider?.rider_type === 'INTERNAL' ? 
                '🏢 <strong>Internal Company Fleet</strong>: Transport fee retained for company asset operations.' : 
                '🤝 <strong>External Partner</strong>: You receive your configured % commission split automatically on every verified delivery.'}
            </div>
          </div>
        </div>
      `;
    }

    if (this.riderActiveTab === "account") {
      return `
        <div>
          <div style="font-size: 0.95rem; font-weight: 800; color: #1E293B; margin-bottom: 12px;">👤 Rider Profile</div>
          
          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 14px; margin-bottom: 12px;">
            <div style="font-weight: 900; font-size: 1rem;">${rider?.full_name || user.full_name}</div>
            <div style="font-size: 0.72rem; color: #64748B; margin-top: 2px;">Ref: <strong>${rider?.rider_ref}</strong> • ⭐ ${rider?.rating || '5.0'} Rating</div>
            <div style="font-size: 0.72rem; color: #64748B; margin-top: 2px;">Vehicle: ${rider?.vehicle_type} (Plate: ${rider?.plate_number})</div>
          </div>

          <div style="background: #FFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 14px; margin-bottom: 12px;">
            <div style="font-weight: 800; font-size: 0.8rem; margin-bottom: 6px;">Shift Status</div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.78rem;">Currently: <strong>${rider?.operational_status || 'AVAILABLE'}</strong></span>
              <button onclick="MobileApp.toggleRiderShift('${rider?.operational_status === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE'}')" class="btn-primary btn-sm" style="background: ${rider?.operational_status === 'AVAILABLE' ? '#059669' : '#64748B'}; border-radius: 8px;">
                ${rider?.operational_status === 'AVAILABLE' ? 'Go Offline' : 'Go Online'}
              </button>
            </div>
          </div>


          <button onclick="API.logout(); window.location.reload();" class="btn-danger" style="width: 100%; justify-content: center; padding: 11px; border-radius: 12px; font-weight: 800;">
            Sign Out
          </button>
        </div>
      `;
    }
  },

  async showTopUpModal(currentBalance) {
    let dedicatedAcc = null;
    try {
      const wRes = await API.get("/api/finance/wallet/dedicated-account");
      if (wRes && wRes.dedicated_account) dedicatedAcc = wRes.dedicated_account;
    } catch(e) {}

    const accNum = dedicatedAcc ? dedicatedAcc.account_number : "9901847291";
    const bankName = dedicatedAcc ? dedicatedAcc.bank_name : "Wema Bank (Flutterwave)";
    const accName = dedicatedAcc ? dedicatedAcc.account_name : "RushPoint - Fatima Abubakar";

    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 370px; border-radius: 20px; overflow: hidden; padding: 0;">
        <div style="background: linear-gradient(135deg, #7F1D1D 0%, #B91C1C 100%); color: #FFF; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-size: 1.1rem; font-weight: 900; margin: 0;">💰 Fund RushPoint Wallet</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; color: #FFF; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="padding: 16px;">
          <!-- Balance Display -->
          <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.75rem; color: #64748B; font-weight: 700;">Current Balance</span>
            <span style="font-size: 1.25rem; font-weight: 900; color: #991B1B;">₦${(currentBalance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
          </div>

          <!-- 1. DEDICATED VIRTUAL ACCOUNT CARD -->
          <div style="background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: 14px; padding: 12px; margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 0.8rem; font-weight: 900; color: #166534;">🏦 Your Dedicated Account Number</span>
              <span style="font-size: 0.6rem; background: #DCFCE7; color: #15803D; padding: 2px 6px; border-radius: 6px; font-weight: 800;">INSTANT CREDIT</span>
            </div>
            <div style="font-size: 0.68rem; color: #374151; margin-bottom: 8px;">Transfer from any bank app (OPay, Kuda, GTB, Zenith, PalmPay):</div>
            
            <div style="background: #FFF; border: 1px dashed #4ADE80; border-radius: 10px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 0.68rem; color: #64748B; font-weight: 700;">${bankName}</div>
                <div style="font-size: 1.25rem; font-weight: 900; color: #14532D; letter-spacing: 1.5px;">${accNum}</div>
                <div style="font-size: 0.68rem; color: #166534; font-weight: 600;">${accName}</div>
              </div>
              <button onclick="navigator.clipboard.writeText('${accNum}'); API.showToast('✅ Account Copied: ${accNum} (${bankName})! Paste in your bank app.', 'success')" style="background: #166534; color: #FFF; border: none; padding: 8px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">
                📋 Copy
              </button>
            </div>
          </div>

          <div style="text-align: center; color: #94A3B8; font-size: 0.72rem; font-weight: 700; margin-bottom: 10px;">— OR PAY WITH CARD / USSD —</div>

          <!-- 2. FLUTTERWAVE GATEWAY -->
          <form onsubmit="MobileApp.executeTopUp(event)">
            <div class="rp-form-group" style="margin-bottom: 8px;">
              <label class="rp-label" style="font-size: 0.75rem;">Top Up Amount (NGN)</label>
              <input type="number" id="topup-amount" class="rp-input" placeholder="e.g. 5000" min="100" required style="border-radius: 10px;">
              
              <!-- Quick Preset Amount Chips -->
              <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
                <button type="button" onclick="document.getElementById('topup-amount').value=1000" style="flex:1; background: #F1F5F9; border: 1px solid #CBD5E1; padding: 6px 4px; border-radius: 8px; font-size: 0.72rem; font-weight: 800; color: #1E293B; cursor: pointer;">+₦1,000</button>
                <button type="button" onclick="document.getElementById('topup-amount').value=2000" style="flex:1; background: #F1F5F9; border: 1px solid #CBD5E1; padding: 6px 4px; border-radius: 8px; font-size: 0.72rem; font-weight: 800; color: #1E293B; cursor: pointer;">+₦2,000</button>
                <button type="button" onclick="document.getElementById('topup-amount').value=5000" style="flex:1; background: #F1F5F9; border: 1px solid #CBD5E1; padding: 6px 4px; border-radius: 8px; font-size: 0.72rem; font-weight: 800; color: #1E293B; cursor: pointer;">+₦5,000</button>
                <button type="button" onclick="document.getElementById('topup-amount').value=10000" style="flex:1; background: #F1F5F9; border: 1px solid #CBD5E1; padding: 6px 4px; border-radius: 8px; font-size: 0.72rem; font-weight: 800; color: #1E293B; cursor: pointer;">+₦10,000</button>
              </div>
            </div>
            <button type="submit" id="btn-submit-topup" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px; border-radius: 12px; background: #B91C1C; font-weight: 800; font-size: 0.88rem;">
              Pay with Flutterwave (Card / USSD) 💳
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async executeTopUp(e) {
    if (e && e.preventDefault) e.preventDefault();
    const amount = parseFloat(document.getElementById("topup-amount").value);
    if (!amount || amount <= 0) {
      API.showToast("Please enter a valid deposit amount", "error");
      return;
    }

    const btn = document.getElementById("btn-submit-topup");
    if (btn) { btn.disabled = true; btn.textContent = "Connecting Flutterwave Gateway… 🔐"; }

    try {
      const res = await API.post("/api/finance/payment/initialize", {
        amount,
        payment_type: "WALLET_TOPUP",
        redirect_url: window.location.origin + "/app"
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      if (res.payment_link && res.gateway === "FLUTTERWAVE_LIVE") {
        API.showToast("Redirecting to Flutterwave checkout…", "info");
        window.location.href = res.payment_link;
      } else {
        API.showToast("Deposit reference generated: " + res.reference, "info");
        this.render();
      }
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = "Pay with Flutterwave 💳"; }
    }
  },

  showWithdrawalModal(currentBalance, bankName, accNumber, accName) {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 360px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: #1E293B;">💳 Withdraw Wallet Earnings</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="background: #FFF5F5; border: 1px solid #FECACA; border-radius: 12px; padding: 12px; margin-bottom: 12px; font-size: 0.75rem;">
          <div style="color: #64748B; margin-bottom: 4px;">Available Balance: <strong style="font-size: 1rem; color: #B91C1C;">₦${currentBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></div>
          <div style="border-top: 1px dashed #FECACA; padding-top: 6px; margin-top: 6px;">
            <div>Bank: <strong>${bankName}</strong></div>
            <div>Account: <code>${accNumber}</code> (${accName})</div>
          </div>
        </div>

        <form onsubmit="MobileApp.executeWithdrawal(event, ${currentBalance})">
          <div class="rp-form-group">
            <label class="rp-label">Withdrawal Amount (NGN)</label>
            <input type="number" id="wdr-amount" class="rp-input" placeholder="e.g. 10000" max="${currentBalance}" min="100" required value="${Math.min(currentBalance, 10000)}" style="border-radius: 10px;">
          </div>
          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px; border-radius: 12px; background: #B91C1C; font-weight: 800;">
            Confirm Bank Transfer 💸
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async executeWithdrawal(e, currentBalance) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById("wdr-amount").value);
    if (!amount || amount <= 0 || amount > currentBalance) {
      API.showToast("Invalid withdrawal amount", "error");
      return;
    }

    try {
      const res = await API.post("/api/finance/wallet/withdraw", { amount });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(`Transfer of ₦${amount.toLocaleString()} initiated! Ref: ${res.reference}`, "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (err) {}
  },

  async toggleRiderShift(status) {
    try {
      await API.post("/api/riders/status-toggle", { status });
      API.showToast(`Shift status: ${status}`, "info");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {}
  },

  async progressRiderOrder(orderId, nextStatus, notes) {
    try {
      await API.post(`/api/orders/${orderId}/transition`, { status: nextStatus, notes });
      API.showToast(`Order updated to ${nextStatus}`, "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {}
  },

  async submitPODVerification(orderId) {
    const otp = document.getElementById("pod-otp-input").value.trim();
    if (!otp) {
      API.showToast("Please enter the 4-digit OTP", "error");
      return;
    }
    try {
      const res = await API.post(`/api/orders/${orderId}/verify-delivery`, { otp, notes: "Delivered & OTP verified at door" });
      API.showToast("Delivery Verified! 4-Way settlement cleared & funds deposited.", "success");
      this.render();
      if (window.AdminPortal) window.AdminPortal.init();
    } catch (e) {}
  },

  renderAdminMobileApp(container, user) {
    container.innerHTML = `
      <div style="padding: 30px 20px; text-align: center;">
        <div style="font-size: 2.5rem;">👑</div>
        <h3 style="font-size: 1.1rem; font-weight: 800; color: #7F1D1D; margin-top: 10px;">Master Admin Console</h3>
        <p style="font-size: 0.8rem; color: #64748B; margin-top: 6px;">You have full master authority over Operations, Dispatch, Finance, Vendors, Products, and Management Delegation.</p>
        <button onclick="MobileApp.showRoleSwitchModal()" class="btn-primary" style="margin-top: 14px; border-radius: 12px; padding: 10px 20px; background: #B91C1C;">Switch to Mobile Role</button>
      </div>
    `;
  },

  switchVndImgTab(prefix, tab) {
    const uploadSec = document.getElementById(prefix + "-upload-sec");
    const urlSec = document.getElementById(prefix + "-url-sec");
    const uploadBtn = document.getElementById(prefix + "-tab-upload");
    const urlBtn = document.getElementById(prefix + "-tab-url");

    if (tab === 'upload') {
      if (uploadSec) uploadSec.style.display = "block";
      if (urlSec) urlSec.style.display = "none";
      if (uploadBtn) {
        uploadBtn.style.background = "var(--blood-primary)";
        uploadBtn.style.color = "#FFF";
      }
      if (urlBtn) {
        urlBtn.style.background = "#F1F5F9";
        urlBtn.style.color = "#475569";
      }
    } else {
      if (uploadSec) uploadSec.style.display = "none";
      if (urlSec) urlSec.style.display = "block";
      if (urlBtn) {
        urlBtn.style.background = "var(--blood-primary)";
        urlBtn.style.color = "#FFF";
      }
      if (uploadBtn) {
        uploadBtn.style.background = "#F1F5F9";
        uploadBtn.style.color = "#475569";
      }
    }
  },

  async processAndUploadVendorImage(fileInput, urlInputId, previewImgId, statusElId) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    const statusEl = document.getElementById(statusElId);
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#2563EB;">⏳ Processing & compressing image...</span>';
    }

    try {
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = async function() {
          const maxDim = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDim) {
              height = Math.round(height * (maxDim / width));
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round(width * (maxDim / height));
              height = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.82);
          const origSizeKb = (file.size / 1024).toFixed(0);

          try {
            const res = await API.post("/api/products/upload-image", {
              image_data: compressedDataUrl
            });

            const finalUrl = res.url || compressedDataUrl;
            const finalSizeKb = res.size_kb || (compressedDataUrl.length * 0.75 / 1024).toFixed(1);

            const urlInput = document.getElementById(urlInputId);
            if (urlInput) urlInput.value = finalUrl;

            const preview = document.getElementById(previewImgId);
            if (preview) preview.src = finalUrl;

            if (statusEl) {
              statusEl.innerHTML = `<span style="color:#059669; font-weight:800;">✅ Uploaded & Compressed: ${finalSizeKb} KB (Reduced from ${origSizeKb} KB)</span>`;
            }
            API.showToast("Product image compressed and set (" + finalSizeKb + " KB)", "success");
          } catch (uploadErr) {
            const finalSizeKb = (compressedDataUrl.length * 0.75 / 1024).toFixed(1);
            const urlInput = document.getElementById(urlInputId);
            if (urlInput) urlInput.value = compressedDataUrl;
            const preview = document.getElementById(previewImgId);
            if (preview) preview.src = compressedDataUrl;
            if (statusEl) {
              statusEl.innerHTML = `<span style="color:#059669; font-weight:800;">✅ Compressed: ${finalSizeKb} KB (Reduced from ${origSizeKb} KB)</span>`;
            }
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      if (statusEl) statusEl.innerHTML = '<span style="color:#DC2626;">❌ Image processing failed</span>';
    }
  },

};

window.MobileApp = MobileApp;
