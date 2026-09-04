/**
 * RushingPoint V1.0 Desktop Web Admin & Management Portal
 * Theme: Light Maroon / Blood Red Edition
 * Complete Implementation of all 14 Modules with Charts & Leaflet Map.
 */

const AdminPortal = {
  currentTab: "dashboard",
  dispatchMap: null,

  async init() {
    this.render();
    this.startAdminOrderPolling();
  },

  async render() {
    const container = document.getElementById("admin-portal-root");
    if (!container) return;

    const user = (typeof API !== 'undefined' && API.getUser()) || { full_name: "Operations Administrator", email: "admin@rushingpoint.com", account_type: "ADMIN" };
    const roleBadge = user.account_type === 'ADMIN' ? '👑 Super Admin' : (user.role_name || '⚙️ Operations Manager');

    container.innerHTML = `
      <div class="admin-layout">
        <!-- Sidebar Navigation -->
        <div class="admin-sidebar">
          <div class="admin-sidebar-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <img src="/static/img/rushpoint-logo.png" style="height: 32px; object-fit: contain;" alt="RushPoint">
              <div>
                <div style="font-weight: 900; font-size: 0.95rem; color: #7F1D1D; letter-spacing: -0.3px;">RushPoint</div>
                <div style="font-size: 0.6rem; color: var(--gray-500); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Admin Console</div>
              </div>
            </div>
          </div>

          <div class="admin-nav-group-title" style="margin-top:8px;">📊 Executive Overview</div>
          <div class="admin-nav-item ${this.currentTab === 'dashboard' ? 'active' : ''}" onclick="AdminPortal.switchTab('dashboard')">
            <span class="admin-nav-icon">🏠</span> <span>Dashboard (Today)</span>
          </div>
          <div class="admin-nav-item ${this.currentTab === 'reports' ? 'active' : ''}" onclick="AdminPortal.switchTab('reports')">
            <span class="admin-nav-icon">📈</span> <span>Reports & Intelligence</span>
          </div>
          <div class="admin-nav-item ${this.currentTab === 'audit' ? 'active' : ''}" onclick="AdminPortal.switchTab('audit')">
            <span class="admin-nav-icon">🛡️</span> <span>Audit Logs</span>
          </div>

          <div class="admin-nav-group-title" style="background: linear-gradient(90deg, rgba(127,29,29,0.06), transparent); border-left: 3px solid #B91C1C; padding-left: 8px;">🛵 Dispatcher</div>
          <div class="admin-nav-item ${this.currentTab === 'dispatcher' ? 'active' : ''}" onclick="AdminPortal.switchTab('dispatcher')">
            <span class="admin-nav-icon">⚡</span> <span>Live Order Queue</span>
            <span class="badge" style="background:#EF4444;color:#FFF;padding:1px 7px;border-radius:10px;font-size:0.65rem;font-weight:700;margin-left:auto;">${(this.orders && this.orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length) || '3'}</span>
          </div>
          <div class="admin-nav-item ${this.currentTab === 'dispatch' ? 'active' : ''}" onclick="AdminPortal.switchTab('dispatch')">
            <span class="admin-nav-icon">📡</span> <span>Fleet Radar & GPS Map</span>
          </div>
          <div class="admin-nav-item ${this.currentTab === 'waybills' ? 'active' : ''}" onclick="AdminPortal.switchTab('waybills')">
            <span class="admin-nav-icon">📦</span> <span>Waybill & Custom Dispatch</span>
            <span class="badge" style="background:rgba(239,68,68,0.15);color:#EF4444;border:1px solid rgba(239,68,68,0.3);padding:1px 6px;border-radius:10px;font-size:0.65rem;font-weight:700;margin-left:auto;">Active</span>
          </div>

          <div class="admin-nav-group-title" style="background: linear-gradient(90deg, rgba(37,99,235,0.06), transparent); border-left: 3px solid #2563EB; padding-left: 8px;">⚙️ Operations Manager</div>
          <div class="admin-nav-item ${this.currentTab === 'operations' ? 'active' : ''}" onclick="AdminPortal.switchTab('operations')">
            <span class="admin-nav-icon">🚦</span> <span>Fleet & Shift Control</span>
          </div>
          <div class="admin-nav-item ${this.currentTab === 'invites' ? 'active' : ''}" onclick="AdminPortal.switchTab('invites')">
            <span class="admin-nav-icon">⏱️</span> <span>5-Min Invite Generator</span>
          </div>
          <div class="admin-nav-item ${this.currentTab === 'staff' ? 'active' : ''}" onclick="AdminPortal.switchTab('staff')">
            <span class="admin-nav-icon">👥</span> <span>Staff & RBAC</span>
          </div>

          <div class="admin-nav-group-title" style="background: linear-gradient(90deg, rgba(5,150,105,0.06), transparent); border-left: 3px solid #059669; padding-left: 8px;">💰 Finance Officer</div>
          <div class="admin-nav-item ${this.currentTab === 'finance' ? 'active' : ''}" onclick="AdminPortal.switchTab('finance')">
            <span class="admin-nav-icon">💳</span> <span>Finance Ledger & Payouts</span>
          </div>
          <div class="admin-nav-item ${this.currentTab === 'refunds' ? 'active' : ''}" onclick="AdminPortal.switchTab('refunds')">
            <span class="admin-nav-icon">💸</span> <span>Refunds & Escrow</span>
          </div>

          <div class="admin-nav-group-title" style="background: linear-gradient(90deg, rgba(124,58,237,0.06), transparent); border-left: 3px solid #7C3AED; padding-left: 8px;">🏪 Vendor Manager</div>
          <div class="admin-nav-item ${this.currentTab === 'vendor-manager' ? 'active' : ''}" onclick="AdminPortal.switchTab('vendor-manager')">
            <span class="admin-nav-icon">🏪</span> <span>Vendor Profiles & KYC</span>
          </div>
          <div class="admin-nav-item ${this.currentTab === 'vendor-requests' ? 'active' : ''}" onclick="AdminPortal.switchTab('vendor-requests')">
            <span class="admin-nav-icon">📋</span> <span>Partner Applications</span>
            <span class="badge" style="background:rgba(124,58,237,0.15);color:#A78BFA;border:1px solid rgba(124,58,237,0.3);padding:1px 6px;border-radius:10px;font-size:0.65rem;font-weight:700;margin-left:auto;">Review</span>
          </div>
          <div class="admin-nav-item ${this.currentTab === 'categories' ? 'active' : ''}" onclick="AdminPortal.switchTab('categories')">
            <span class="admin-nav-icon">🏷️</span> <span>Categories Master</span>
          </div>
          <div class="admin-nav-item ${this.currentTab === 'products' ? 'active' : ''}" onclick="AdminPortal.switchTab('products')">
            <span class="admin-nav-icon">📦</span> <span>Products & Bulk Actions</span>
          </div>

          <div class="admin-nav-group-title" style="background: linear-gradient(90deg, rgba(217,119,6,0.06), transparent); border-left: 3px solid #D97706; padding-left: 8px;">💬 Customer Support</div>
          <div class="admin-nav-item ${this.currentTab === 'customer-support' ? 'active' : ''}" onclick="AdminPortal.switchTab('customer-support')">
            <span class="admin-nav-icon">🎫</span> <span>Support Ticket Desk</span>
            <span class="badge" style="background:#F59E0B;color:#000;padding:1px 7px;border-radius:10px;font-size:0.65rem;font-weight:700;margin-left:auto;">Live</span>
          </div>
          <div class="admin-nav-item ${this.currentTab === 'support' ? 'active' : ''}" onclick="AdminPortal.switchTab('support')">
            <span class="admin-nav-icon">💬</span> <span>Old Help Desk</span>
          </div>

          <div class="admin-nav-group-title">⚙️ System</div>
          <div class="admin-nav-item ${this.currentTab === 'settings' ? 'active' : ''}" onclick="AdminPortal.switchTab('settings')">
            <span class="admin-nav-icon">⚙️</span> <span>System Settings</span>
          </div>

          <!-- Sidebar Footer User Profile -->
          <div style="margin-top: auto; padding: 14px 12px 6px; border-top: 1px solid var(--blood-border); background: var(--blood-soft); border-radius: 12px; margin-top: 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: #7F1D1D; color: #FFF; font-weight: 800; font-size: 0.75rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  ${(user.full_name || 'AD').substring(0, 2).toUpperCase()}
                </div>
                <div style="overflow: hidden;">
                  <div style="font-size: 0.78rem; font-weight: 800; color: #7F1D1D; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${user.full_name || 'Administrator'}</div>
                  <div style="font-size: 0.65rem; color: var(--gray-500);">${roleBadge}</div>
                </div>
              </div>
              <button onclick="AdminPortal.handleLogout()" style="background: none; border: 1px solid var(--blood-border); border-radius: 6px; padding: 4px 8px; color: #DC2626; font-size: 0.72rem; font-weight: 800; cursor: pointer;" title="Sign out of operations console">
                🚪 Logout
              </button>
            </div>
          </div>
        </div>

        <!-- Main Content Pane with Enterprise Top Bar -->
        <div class="admin-content-area" id="admin-main-pane">
          <!-- Enterprise Top Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 12px 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 800; color: #059669; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 20px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; display: inline-block;"></span>
                LIVE PRODUCTION SYSTEM
              </span>
              <span style="font-size: 0.8rem; color: #64748B;">Katsina Logistics Dispatch Core</span>
            </div>

            <div style="display: flex; align-items: center; gap: 14px;">
              <button onclick="AdminPortal.showBroadcastModal()" style="display: inline-flex; align-items: center; gap: 6px; background: #EEF2FF; color: #4338CA; border: 1px solid #C7D2FE; border-radius: 10px; padding: 7px 12px; font-size: 0.78rem; font-weight: 800; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.background='#E0E7FF'" onmouseout="this.style.background='#EEF2FF'">
                📢 Broadcast
              </button>
              <div style="text-align: right;">
                <div style="font-size: 0.85rem; font-weight: 800; color: #1E293B;">${user.full_name || 'Super Administrator'}</div>
                <div style="font-size: 0.72rem; color: #64748B;">${user.email || 'admin@rushingpoint.com'} • <strong style="color: #B91C1C;">${roleBadge}</strong></div>
              </div>
              <button onclick="AdminPortal.handleLogout()" style="display: inline-flex; align-items: center; gap: 6px; background: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA; border-radius: 10px; padding: 7px 14px; font-size: 0.78rem; font-weight: 800; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.background='#FEE2E2'" onmouseout="this.style.background='#FEF2F2'">
                🚪 Sign Out
              </button>
            </div>
          </div>

          ${await this.getTabContentHtml()}
        </div>
      </div>
    `;

    // Mount post-render scripts
    if (this.currentTab === "dashboard") {
      this.mountDashboardCharts();
    } else if (this.currentTab === "dispatch") {
      this.mountDispatchMap();
    } else if (this.currentTab === "finance") {
      setTimeout(() => this.loadLateDeliverySettings(), 100);
    }
  },

  async switchTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  async getTabContentHtml() {
    if (this.currentTab === "dashboard") return await this.renderDashboard();
    if (this.currentTab === "dispatch") return await this.renderDispatchRadar();
    if (this.currentTab === "dispatcher") return await this.renderDispatcherModule();
    if (this.currentTab === "operations") return await this.renderOperationsManager();
    if (this.currentTab === "waybills") return await this.renderWaybillsModule();
    if (this.currentTab === "invites") return await this.renderInviteGenerator();
    if (this.currentTab === "vendors") return await this.renderVendorsQueue();
    if (this.currentTab === "vendor-manager") return await this.renderVendorManager();
    if (this.currentTab === "vendor-requests") return await this.renderVendorRequests();
    if (this.currentTab === "categories") return await this.renderCategoryMaster();
    if (this.currentTab === "products") return await this.renderProductsCatalog();
    if (this.currentTab === "finance") return await this.renderFinanceLedger();
    if (this.currentTab === "refunds") return await this.renderRefundsEscrow();
    if (this.currentTab === "reports") return await this.renderReportsHub();
    if (this.currentTab === "staff") return await this.renderStaffRBAC();
    if (this.currentTab === "support") return await this.renderSupportDesk();
    if (this.currentTab === "customer-support") return await this.renderCustomerSupportDesk();
    if (this.currentTab === "audit") return await this.renderAuditLogs();
    if (this.currentTab === "settings") return await this.renderSettings();
    return "<div>Select a module from the left navigation menu.</div>";
  },

  // ==========================================
  // MODULE: DASHBOARD (TODAY'S OPERATIONS METRICS)
  // ==========================================
  async renderDashboard() {
    let today = {
      total_orders_today: 0, pending_orders: 0, assigned: 0, in_transit: 0, delivered: 0,
      cancelled: 0, active_riders: 0, offline_riders: 0, revenue_today: 0.0, rider_earnings_today: 0.0
    };
    let metrics = { total_gmv: 0.0, total_platform_revenue: 0.0 };
    let recentOrders = [];

    try {
      const res = await API.get("/api/admin/dashboard/today", { silent: true });
      if (res && res.today_operations) today = res.today_operations;
      const mRes = await API.get("/api/admin/metrics", { silent: true });
      if (mRes && mRes.metrics) metrics = mRes.metrics;
      if (mRes && mRes.recent_orders) recentOrders = mRes.recent_orders;
    } catch (e) {}

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">Executive Operations Dashboard</h1>
            <div class="admin-page-desc">Real-time GMV, fleet telemetry, today's order lifecycle, and live WhatsApp communication</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button onclick="AdminPortal.switchTab('waybills')" class="btn-primary btn-sm">📦 New Custom Waybill Link</button>
            <a href="/api/admin/export/orders" class="btn-secondary btn-sm" download>📥 Export Orders CSV</a>
          </div>
        </div>

        <!-- Section: Today's Operations (10 Exact Operational Metrics A through J) -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 0.88rem; font-weight: 800; color: var(--blood-dark); margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            <span>⚡</span> <span>1. Dashboard: Today's Operations</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px;">
            <div class="metric-card" style="padding: 12px 14px;">
              <div class="metric-header"><span style="font-size: 0.72rem;">a. Total Orders Today</span> <span style="color: var(--blood-primary);">📦</span></div>
              <div class="metric-value" style="font-size: 1.4rem;">${today.total_orders_today}</div>
              <div class="metric-footer" style="color: var(--blood-primary); font-weight: 700;">Live Daily Volume</div>
            </div>

            <div class="metric-card" style="padding: 12px 14px;">
              <div class="metric-header"><span style="font-size: 0.72rem;">b. Pending Orders</span> <span style="color: var(--amber);">⏳</span></div>
              <div class="metric-value" style="font-size: 1.4rem; color: var(--amber);">${today.pending_orders}</div>
              <div class="metric-footer">Awaiting Confirmation</div>
            </div>

            <div class="metric-card" style="padding: 12px 14px;">
              <div class="metric-header"><span style="font-size: 0.72rem;">c. Assigned</span> <span style="color: var(--blue);">🛵</span></div>
              <div class="metric-value" style="font-size: 1.4rem; color: var(--blue);">${today.assigned}</div>
              <div class="metric-footer">Rider Allocated</div>
            </div>

            <div class="metric-card" style="padding: 12px 14px;">
              <div class="metric-header"><span style="font-size: 0.72rem;">d. In Transit</span> <span style="color: #8B5CF6;">🚀</span></div>
              <div class="metric-value" style="font-size: 1.4rem; color: #8B5CF6;">${today.in_transit}</div>
              <div class="metric-footer">On Route to Destination</div>
            </div>

            <div class="metric-card" style="padding: 12px 14px;">
              <div class="metric-header"><span style="font-size: 0.72rem;">e. Delivered</span> <span style="color: var(--emerald);">✓</span></div>
              <div class="metric-value" style="font-size: 1.4rem; color: var(--emerald);">${today.delivered}</div>
              <div class="metric-footer">OTP Verified</div>
            </div>

            <div class="metric-card" style="padding: 12px 14px;">
              <div class="metric-header"><span style="font-size: 0.72rem;">f. Cancelled</span> <span style="color: var(--gray-500);">✕</span></div>
              <div class="metric-value" style="font-size: 1.4rem; color: var(--gray-600);">${today.cancelled}</div>
              <div class="metric-footer">Refunded / Cancelled</div>
            </div>

            <div class="metric-card" style="padding: 12px 14px;">
              <div class="metric-header"><span style="font-size: 0.72rem;">g. Active Riders</span> <span style="color: var(--emerald);">🟢</span></div>
              <div class="metric-value" style="font-size: 1.4rem; color: var(--emerald);">${today.active_riders}</div>
              <div class="metric-footer">Online on Shift</div>
            </div>

            <div class="metric-card" style="padding: 12px 14px;">
              <div class="metric-header"><span style="font-size: 0.72rem;">h. Offline Riders</span> <span style="color: var(--gray-400);">⚪</span></div>
              <div class="metric-value" style="font-size: 1.4rem; color: var(--gray-500);">${today.offline_riders}</div>
              <div class="metric-footer">Off Duty</div>
            </div>

            <div class="metric-card" style="padding: 12px 14px;">
              <div class="metric-header"><span style="font-size: 0.72rem;">i. Revenue Today</span> <span style="color: var(--blood-dark);">💰</span></div>
              <div class="metric-value" style="font-size: 1.25rem; color: var(--blood-primary);">₦${today.revenue_today.toLocaleString()}</div>
              <div class="metric-footer">Gross Platform Income</div>
            </div>

            <div class="metric-card" style="padding: 12px 14px;">
              <div class="metric-header"><span style="font-size: 0.72rem;">j. Rider Earnings</span> <span style="color: #059669;">🛵</span></div>
              <div class="metric-value" style="font-size: 1.25rem; color: #059669;">₦${today.rider_earnings_today.toLocaleString()}</div>
              <div class="metric-footer">Fleet Disbursed Today</div>
            </div>
          </div>
        </div>

        <!-- Interactive Charts Row -->
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 24px;">
          <div class="rp-card">
            <div class="rp-card-header">
              <div class="rp-card-title">📈 GMV & Platform Revenue Trajectory</div>
            </div>
            <div style="height: 230px; position: relative;">
              <canvas id="revenueTrendChart"></canvas>
            </div>
          </div>

          <div class="rp-card">
            <div class="rp-card-header">
              <div class="rp-card-title">🏷️ Category Volume Share</div>
            </div>
            <div style="height: 230px; position: relative;">
              <canvas id="categoryShareChart"></canvas>
            </div>
          </div>
        </div>

        <!-- Real-Time Order Stream Table -->
        <div class="rp-card">
          <div class="rp-card-header">
            <div class="rp-card-title">📦 Real-Time Order Stream</div>
            <button onclick="AdminPortal.switchTab('dispatch')" class="btn-primary btn-sm">Open Dispatch Control</button>
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>Order Ref</th>
                  <th>Customer</th>
                  <th>Store / Vendor</th>
                  <th>Rider</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Security OTP</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${recentOrders.map(o => `
                  <tr>
                    <td><strong>${o.order_ref}</strong></td>
                    <td>${o.customer_name}</td>
                    <td>${o.store_name}</td>
                    <td>${o.rider_ref ? `🛵 ${o.rider_ref}` : '<span style="color: var(--amber); font-weight: 700;">Unassigned</span>'}</td>
                    <td><strong>₦${o.total_amount.toLocaleString()}</strong></td>
                    <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
                    <td><code style="font-weight: 800; color: var(--blood-primary); background: var(--blood-tint); padding: 2px 6px; border-radius: 4px;">${o.pod_otp || 'N/A'}</code></td>
                    <td>
                      ${!o.rider_id && o.status === 'CONFIRMED' ? `
                        <button onclick="AdminPortal.showDispatchModal('${o.id}', '${o.order_ref}')" class="btn-primary btn-sm">Assign Rider</button>
                      ` : `
                        <button onclick="AdminPortal.viewOrderTimeline('${o.id}')" class="btn-secondary btn-sm">Timeline</button>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  mountDashboardCharts() {
    setTimeout(() => {
      const revCtx = document.getElementById("revenueTrendChart")?.getContext("2d");
      if (revCtx && window.Chart) {
        new Chart(revCtx, {
          type: "line",
          data: {
            labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            datasets: [
              {
                label: "GMV Volume (₦)",
                data: [42000, 68000, 54000, 89000, 112000, 145000, 168000],
                borderColor: "#B91C1C",
                backgroundColor: "rgba(185, 28, 28, 0.1)",
                tension: 0.3,
                fill: true
              },
              {
                label: "Platform Revenue (₦)",
                data: [6300, 10200, 8100, 13350, 16800, 21750, 25200],
                borderColor: "#059669",
                backgroundColor: "rgba(5, 150, 105, 0.1)",
                tension: 0.3,
                fill: true
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "top" } }
          }
        });
      }

      const catCtx = document.getElementById("categoryShareChart")?.getContext("2d");
      if (catCtx && window.Chart) {
        new Chart(catCtx, {
          type: "doughnut",
          data: {
            labels: ["Food & Bites", "Groceries", "Electronics", "Household"],
            datasets: [{
              data: [45, 25, 20, 10],
              backgroundColor: ["#B91C1C", "#D97706", "#2563EB", "#059669"]
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } }
          }
        });
      }
    }, 100);
  },

  // ==========================================
  // MODULE 6: LIVE DISPATCH RADAR & MAP
  // ==========================================
  async renderDispatchRadar() {
    let orders = [];
    let riders = [];

    try {
      const oRes = await API.get("/api/orders/", { silent: true });
      if (oRes && oRes.orders) orders = oRes.orders;
      const rRes = await API.get("/api/riders/live-map", { silent: true });
      if (rRes && rRes.riders) riders = rRes.riders;
    } catch (e) {}

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">Live Dispatch Radar & Fleet Map</h1>
            <div class="admin-page-desc">Real-time GPS tracking, automated rider recommendation scoring and manual assignment</div>
          </div>
          <button onclick="AdminPortal.render()" class="btn-secondary btn-sm">🔄 Refresh Map Feed</button>
        </div>

        <!-- OpenStreetMap Container (Leaflet.js) -->
        <div class="rp-card" style="padding: 12px; margin-bottom: 20px;">
          <div style="font-weight: 800; font-size: 0.85rem; color: var(--blood-dark); margin-bottom: 8px;">🗺️ Real-Time Fleet GPS Operations Map</div>
          <div id="dispatch-map"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <!-- Active Orders Queue -->
          <div class="rp-card">
            <div class="rp-card-header">
              <div class="rp-card-title">🛵 Active Orders Queue (${orders.filter(o => o.status !== 'DELIVERED').length})</div>
            </div>
            <div class="rp-table-container">
              <table class="rp-table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Store</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${orders.filter(o => o.status !== 'DELIVERED').map(o => `
                    <tr>
                      <td><strong>${o.order_ref}</strong></td>
                      <td>${o.store_name}</td>
                      <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
                      <td style="display: flex; gap: 4px;">
                        <button onclick="AdminPortal.showDispatchModal('${o.id}', '${o.order_ref}')" class="btn-primary btn-sm" style="font-size: 0.72rem; padding: 4px 8px;">
                          ⚡ Assign
                        </button>
                        ${o.status !== 'CANCELLED_REFUNDED' ? `
                          <button onclick="AdminPortal.showRefundModal('${o.id}', '${o.order_ref}', ${o.total_amount})" class="btn-secondary btn-sm" style="font-size: 0.72rem; padding: 4px 8px; color: var(--blood-primary); border-color: var(--blood-border);" title="Refund Unavailable Product">
                            💸 Refund
                          </button>
                        ` : ''}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Rider Fleet Telemetry -->
          <div class="rp-card">
            <div class="rp-card-header">
              <div class="rp-card-title">Fleet Telemetry (${riders.length})</div>
            </div>
            <div style="max-height: 380px; overflow-y: auto;">
              ${riders.map(r => `
                <div style="background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-weight: 800; font-size: 0.82rem; color: var(--blood-dark);">${r.full_name} (${r.rider_ref})</div>
                    <div style="font-size: 0.72rem; color: var(--gray-600);">${r.vehicle_type} • ${r.plate_number} • Rating: ⭐ ${r.rating}</div>
                    <div style="font-size: 0.68rem; color: var(--gray-500);">📍 Lat: ${(r.current_lat || 6.5244).toFixed(4)}, Lng: ${(r.current_lng || 3.3792).toFixed(4)}</div>
                  </div>
                  <span class="badge badge-${r.operational_status === 'AVAILABLE' ? 'active' : 'pending'}">${r.operational_status}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async mountDispatchMap() {
    setTimeout(async () => {
      const mapEl = document.getElementById("dispatch-map");
      if (!mapEl || !window.L) return;

      if (this.dispatchMap) {
        this.dispatchMap.remove();
      }

      // Default map center (Katsina / Lagos hubs)
      const map = L.map("dispatch-map").setView([6.5244, 3.3792], 12);
      this.dispatchMap = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors • RushingPoint Live Radar"
      }).addTo(map);

      // Fetch Real Active Fleet & Stores
      try {
        const [rRes, sRes] = await Promise.all([
          API.get("/api/riders/live-map", { silent: true }),
          API.get("/api/marketplace/stores", { silent: true })
        ]);

        const riders = rRes?.riders || [];
        const stores = sRes?.stores || [];

        // Plot Real Vendor Stores
        stores.forEach(s => {
          const lat = s.latitude || 6.5355;
          const lng = s.longitude || 3.3888;
          const marker = L.marker([lat, lng]).addTo(map);
          marker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 0.8rem;">
              <strong style="color: #7F1D1D;">🏪 ${s.store_name}</strong><br>
              <span style="font-size: 0.7rem; color: #64748B;">📍 ${s.address}</span><br>
              <span style="font-size: 0.7rem; color: #059669; font-weight: 700;">Verified Merchant Stall</span>
            </div>
          `);
        });

        // Plot Real Active Fleet with Vehicle Badges & Telemetry
        riders.forEach(r => {
          const lat = r.current_lat || 6.5244;
          const lng = r.current_lng || 3.3792;
          const isTricycle = (r.vehicle_type || '').toUpperCase().includes('TRICYCLE') || (r.vehicle_type || '').toUpperCase().includes('KEKE');
          const icon = isTricycle ? '🛺' : '🛵';
          const statusColor = r.operational_status === 'AVAILABLE' ? '#059669' : (r.operational_status === 'ON_DELIVERY' ? '#2563EB' : '#64748B');

          const marker = L.marker([lat, lng]).addTo(map);
          marker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 0.8rem;">
              <strong style="color: #1E293B;">${icon} ${r.full_name} (${r.rider_ref})</strong><br>
              <span style="color: ${statusColor}; font-weight: 800;">● ${r.operational_status}</span><br>
              <span style="font-size: 0.7rem; color: #475569;">Vehicle: ${r.vehicle_type} (${r.plate_number})</span><br>
              <span style="font-size: 0.7rem; color: #64748B;">⭐ ${r.rating || '5.0'} (${r.total_deliveries || 0} deliveries)</span><br>
              ${r.active_order_ref ? `<span style="font-size: 0.7rem; color: #B91C1C; font-weight: 700;">Active Mission: ${r.active_order_ref}</span>` : ''}
            </div>
          `);
        });
      } catch (e) {}
    }, 150);
  },

  async showDispatchModal(orderId, orderRef) {
    try {
      const res = await API.get(`/api/dispatch/recommendations/${orderId}`);
      const recommendations = res.recommendations || [];
      const ordRes = await API.get(`/api/orders/${orderId}`, { silent: true });
      const currentRider = ordRes?.order?.rider_name || null;
      const isHeavy = res.is_heavy_cargo;
      const reqVehicle = res.required_vehicle || (isHeavy ? 'TRICYCLE (Cargo Keke / Van)' : 'MOTORCYCLE / TRICYCLE');

      const modal = document.createElement("div");
      modal.className = "modal-backdrop rp-modal-overlay";
      modal.innerHTML = `
        <div class="modal-dialog" style="max-width: 600px; border-radius: 18px;">
          <div class="modal-header">
            <div>
              <h3 style="font-size: 1.1rem; font-weight: 900; color: #7F1D1D;">Intelligent Dispatch & Fleet Routing</h3>
              <div style="font-size: 0.72rem; color: #64748B;">Order: <strong>${orderRef}</strong> • Vendor Store: <strong>${res.store_name}</strong></div>
            </div>
            <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
          </div>

          <!-- Cargo & Vehicle AI Analysis Banner -->
          <div style="background: ${isHeavy ? '#FEF2F2' : '#F0FDF4'}; border: 1px solid ${isHeavy ? '#FECACA' : '#BBF7D0'}; border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; font-size: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-weight: 900; color: ${isHeavy ? '#7F1D1D' : '#166534'};">
                ${isHeavy ? '⚖️ Heavy / Bulky Cargo Detected' : '📦 Standard Cargo Payload'}
              </span>
              <span class="badge" style="background: ${isHeavy ? '#7F1D1D' : '#166534'}; color: #FFF; font-size: 0.62rem;">
                REQUIRED: ${reqVehicle}
              </span>
            </div>
            <div style="color: ${isHeavy ? '#991B1B' : '#15803D'}; font-size: 0.7rem;">
              ${isHeavy ? 'This order contains heavy building or industrial supplies. Tricycle (Cargo Keke) and Van fleets are prioritized.' : 'Standard delivery payload suitable for agile motorcycle or tricycle dispatch.'}
            </div>
          </div>

          ${currentRider ? `
            <div style="background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 10px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.72rem; color: #92400E; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span>Currently Assigned: <strong>${currentRider}</strong></span>
                <div style="font-size: 0.65rem; opacity: 0.85;">Selecting another rider below will automatically free ${currentRider} and transfer the mission.</div>
              </div>
              <span class="badge" style="background: #B45309; color: #FFF; font-size: 0.6rem;">REASSIGNMENT</span>
            </div>
          ` : ''}

          <div style="display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; padding-right: 2px;">
            ${recommendations.length === 0 ? `
              <div style="text-align: center; padding: 24px; color: #64748B; font-size: 0.8rem;">
                No active riders within dispatch perimeter.
              </div>
            ` : recommendations.map(r => {
              const vtype = (r.vehicle_type || 'MOTORCYCLE').toUpperCase();
              const isTricycle = vtype.includes('TRICYCLE') || vtype.includes('KEKE') || vtype.includes('VAN');
              const vehicleIcon = isTricycle ? '🛺' : '🏍️';

              return `
                <div style="background: ${r.is_best_match ? '#FFF5F5' : '#FFF'}; border: 1.5px solid ${r.is_best_match ? '#B91C1C' : '#E2E8F0'}; border-radius: 14px; padding: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                  <div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span style="font-weight: 900; font-size: 0.88rem; color: #1E293B;">${r.full_name}</span>
                      <span style="font-size: 0.72rem; color: #64748B;">(${r.rider_ref})</span>
                      ${r.is_best_match ? '<span class="badge" style="background: #B91C1C; color: #FFF; font-size: 0.62rem; padding: 2px 6px;">⭐ BEST MATCH</span>' : ''}
                      <span class="badge" style="background: ${r.rider_type === 'INTERNAL' ? '#1E293B' : '#059669'}; color: #FFF; font-size: 0.58rem;">${r.rider_type === 'INTERNAL' ? '🏢 Internal' : '🤝 Partner'}</span>
                    </div>
                    
                    <div style="font-size: 0.74rem; color: #475569; margin-top: 3px; display: flex; gap: 10px; flex-wrap: wrap;">
                      <span>📍 <strong style="color: #B91C1C;">${r.distance_km} km away</strong></span>
                      <span>${vehicleIcon} <strong>${r.vehicle_type}</strong> (${r.plate_number})</span>
                      <span>⭐ ${r.rating || '5.0'} (${r.total_deliveries || 0} trips)</span>
                    </div>

                    ${r.suitability_warning ? `
                      <div style="font-size: 0.66rem; color: #DC2626; font-weight: 700; margin-top: 2px;">${r.suitability_warning}</div>
                    ` : ''}

                    <div style="font-size: 0.68rem; color: #64748B; margin-top: 2px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                      <span>Score: <strong>${r.recommendation_score}/100</strong></span>
                      <span>Status: <strong style="color: ${r.operational_status === 'AVAILABLE' ? '#059669' : (r.operational_status === 'ON_DELIVERY' ? '#2563EB' : '#4B5563')};">${r.operational_status === 'OFFLINE' ? '📞 OFFLINE (Feature Phone)' : r.operational_status}</strong></span>
                      ${r.phone ? `<a href="tel:${r.phone}" style="color:#2563EB;font-weight:800;text-decoration:none;">📞 Call ${r.phone}</a>` : ''}
                    </div>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-end;">
                    <button onclick="AdminPortal.assignRider('${orderId}', '${r.rider_id}')" class="btn-primary btn-sm" style="padding: 6px 14px; font-weight: 800; border-radius: 8px; background: ${r.operational_status === 'OFFLINE' ? '#4B5563' : '#B91C1C'}; white-space: nowrap;">
                      ${r.operational_status === 'OFFLINE' ? '📞 Call & Assign' : (currentRider ? '🔄 Reassign' : '⚡ Assign')}
                    </button>
                    <div style="display:flex;gap:4px;">
                      ${r.phone ? `<a href="tel:${r.phone}" class="btn-secondary btn-sm" style="font-size:0.65rem;padding:2px 6px;text-decoration:none;">📞 Call</a>` : ''}
                      <a href="https://wa.me/${(r.phone || '').replace(/[^0-9]/g, '')}?text=Hello%20${encodeURIComponent(r.full_name)}%2C%20new%20dispatch%20for%20order%20${orderRef}%20at%20${encodeURIComponent(res.store_name)}" target="_blank" style="font-size: 0.65rem; color: #059669; font-weight: 700; text-decoration: none; padding:2px 4px;">
                        💬 WA
                      </a>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (e) {}
  },

  async adminConfirmDelivery(orderId, orderRef) {
    if (!confirm(`Confirm delivery for order ${orderRef} on behalf of rider phone call? Rider commission will be immediately cleared to their wallet.`)) return;
    try {
      const res = await API.post(`/api/orders/${orderId}/admin-confirm-delivery`, { notes: "Rider phoned in after dropping off at customer address" });
      API.showToast(res.message, "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (e) {}
  },

  showAdminWithdrawRiderModal(riderId, riderName, currentBalance) {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 400px; border-radius: 18px;">
        <div class="modal-header">
          <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--blood-dark);">💸 Admin: Disburse Rider Commission</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="background: #FFF5F5; border: 1px solid #FECACA; border-radius: 12px; padding: 12px; margin-bottom: 14px; font-size: 0.75rem;">
          <div>Rider: <strong>${riderName}</strong></div>
          <div style="margin-top: 2px;">Earned Balance: <strong style="color: #B91C1C; font-size: 0.95rem;">₦${(currentBalance || 0).toLocaleString()}</strong></div>
          <div style="font-size: 0.68rem; color: #64748B; margin-top: 4px;">Disburse funds to rider via direct bank transfer or cash due to feature-phone infrastructure.</div>
        </div>

        <form onsubmit="AdminPortal.executeAdminWithdrawRider(event, '${riderId}', ${currentBalance})">
          <div class="rp-form-group">
            <label class="rp-label">Disbursement Amount (NGN)</label>
            <input type="number" id="adm-rdr-payout-amt" class="rp-input" value="${currentBalance}" max="${currentBalance}" min="100" required>
          </div>
          <div class="rp-form-group">
            <label class="rp-label">Disbursement Channel / Notes</label>
            <input type="text" id="adm-rdr-payout-channel" class="rp-input" value="Direct Bank Transfer / Cash Handover" required>
          </div>
          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px; background: #059669; font-weight: 800;">
            Confirm Payout Disbursement 💸
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async executeAdminWithdrawRider(e, riderId, maxBalance) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById("adm-rdr-payout-amt").value);
    const bank_account = document.getElementById("adm-rdr-payout-channel").value.trim();
    if (!amount || amount <= 0 || amount > maxBalance) {
      API.showToast("Invalid disbursement amount", "error");
      return;
    }
    try {
      const res = await API.post(`/api/admin/riders/${riderId}/withdraw-on-behalf`, { amount, bank_account });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message, "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (err) {}
  },

  showStoreDeliveryFeeModal(storeId, storeName, currentFee) {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 400px; border-radius: 18px;">
        <div class="modal-header">
          <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--blood-dark);">⚙️ Store Custom Delivery Fee Override</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="font-size: 0.78rem; color: #64748B; margin-bottom: 12px;">
          Store: <strong>${storeName}</strong>
          <div style="font-size: 0.7rem; color: #9A3412; margin-top: 4px;">Set a specific delivery price for this store as an exception to the global default. Leave empty to use global base fee.</div>
        </div>

        <form onsubmit="AdminPortal.saveStoreCustomDeliveryFee(event, '${storeId}')">
          <div class="rp-form-group">
            <label class="rp-label">Custom Delivery Fee (NGN)</label>
            <input type="number" id="custom-store-fee-input" class="rp-input" placeholder="e.g. 1500 (or leave empty for global default)" value="${currentFee || ''}">
          </div>
          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px;">
            Save Store Delivery Fee 💾
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async saveStoreCustomDeliveryFee(e, storeId) {
    e.preventDefault();
    const custom_delivery_fee = document.getElementById("custom-store-fee-input").value.trim();
    try {
      const res = await API.post(`/api/admin/stores/${storeId}/custom-delivery-fee`, {
        custom_delivery_fee: custom_delivery_fee || null
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message, "success");
      this.render();
    } catch (err) {}
  },

  async assignRider(orderId, riderId) {
    try {
      const res = await API.post("/api/dispatch/assign", { order_id: orderId, rider_id: riderId });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message, "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (e) {}
  },

  showRefundModal(orderId, orderRef, totalAmount) {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 400px;">
        <div class="modal-header">
          <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--blood-dark);">💸 Execute Customer Refund</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="background: #FEF2F2; border: 1px solid #FEE2E2; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 0.75rem;">
          <div>Order Ref: <strong>${orderRef}</strong></div>
          <div style="margin-top: 2px;">Refund Amount: <strong style="color: var(--blood-primary); font-size: 0.95rem;">₦${totalAmount.toLocaleString()}</strong></div>
          <div style="font-size: 0.68rem; color: var(--gray-600); margin-top: 4px;">
            ⚠️ Will credit customer wallet, reverse vendor product payout & Admin delivery escrow.
          </div>
        </div>

        <form onsubmit="AdminPortal.executeRefund(event, '${orderId}')">
          <div class="rp-form-group">
            <label class="rp-label">Reason for Refund</label>
            <select id="ref-reason" class="rp-select">
              <option value="Product Out of Stock / Unavailable">Product Out of Stock / Unavailable</option>
              <option value="Customer Cancellation Request">Customer Cancellation Request</option>
              <option value="Merchant Inability to Fulfill">Merchant Inability to Fulfill</option>
              <option value="Defective or Damaged Product">Defective or Damaged Product</option>
            </select>
          </div>
          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 10px; background: var(--blood-primary);">
            Confirm & Execute 100% Refund 💸
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async executeRefund(e, orderId) {
    e.preventDefault();
    const reason = document.getElementById("ref-reason").value;
    try {
      const res = await API.post(`/api/orders/${orderId}/refund`, { reason });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message, "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (err) {}
  },

  // ==========================================
  // MODULE 1: 5-MIN INVITE GENERATOR
  // ==========================================
  async renderInviteGenerator() {
    let invites = [];
    try {
      const res = await API.get("/api/admin/invites", { silent: true });
      if (res && res.invites) invites = res.invites;
    } catch (e) {}

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">5-Minute Expiring Invite Generator</h1>
            <div class="admin-page-desc">Generate single-use, 5-minute time-locked registration links for Vendors and Riders</div>
          </div>
        </div>

        <!-- Generator Form -->
        <div class="rp-card">
          <div class="rp-card-header">
            <div class="rp-card-title">⚡ Generate Time-Locked Registration Token</div>
          </div>
          <form onsubmit="AdminPortal.handleGenerateInvite(event)" style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 12px; align-items: flex-end;">
            <div class="rp-form-group" style="margin-bottom: 0;">
              <label class="rp-label">Target Role</label>
              <select id="inv-role" class="rp-select">
                <option value="VENDOR">🏪 Vendor (Store Merchant)</option>
                <option value="RIDER">🛵 Rider (Delivery Fleet)</option>
              </select>
            </div>
            <div class="rp-form-group" style="margin-bottom: 0;">
              <label class="rp-label">Recipient Name</label>
              <input type="text" id="inv-name" class="rp-input" placeholder="e.g. Alaba Electronics Hub">
            </div>
            <div class="rp-form-group" style="margin-bottom: 0;">
              <label class="rp-label">Recipient Email</label>
              <input type="email" id="inv-email" class="rp-input" placeholder="e.g. merchant@mail.com">
            </div>
            <button type="submit" class="btn-primary" style="padding: 10px 18px;">
              Generate 5-Min Link ⏱️
            </button>
          </form>

          <div id="new-invite-result" style="display: none; margin-top: 14px; padding: 12px; background: var(--blood-soft); border: 1px solid var(--blood-border); border-radius: var(--radius-md);">
          </div>
        </div>

        <!-- Recent Invites Table -->
        <div class="rp-card">
          <div class="rp-card-header">
            <div class="rp-card-title">Recent Invite Tokens</div>
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Recipient</th>
                  <th>Token</th>
                  <th>Status</th>
                  <th>Expires At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${invites.map(i => `
                  <tr>
                    <td><span class="badge ${i.target_role === 'VENDOR' ? 'badge-confirmed' : 'badge-assigned'}">${i.target_role}</span></td>
                    <td>${i.recipient_name || 'Generic Invite'}</td>
                    <td><code style="font-size: 0.72rem; color: var(--blood-primary);">${i.invite_token.substring(0, 16)}...</code></td>
                    <td>
                      ${i.is_used ? '<span class="badge badge-delivered">Used</span>' : (i.is_expired ? '<span class="badge badge-cancelled">Expired</span>' : '<span class="badge badge-under-review">Active ⏱️</span>')}
                    </td>
                    <td style="font-size: 0.75rem;">${new Date(i.expires_at).toLocaleTimeString()}</td>
                    <td>
                      ${!i.is_used && !i.is_expired ? `
                        <button onclick="navigator.clipboard.writeText('${window.location.origin}/static/invite-signup.html?token=${i.invite_token}&role=${i.target_role}'); API.showToast('Invite link copied!', 'success');" class="btn-secondary btn-sm">📋 Copy Link</button>
                      ` : '-'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  async handleGenerateInvite(e) {
    e.preventDefault();
    const target_role = document.getElementById("inv-role").value;
    const recipient_name = document.getElementById("inv-name").value.trim();
    const recipient_email = document.getElementById("inv-email").value.trim();

    try {
      const res = await API.post("/api/auth/invite/generate", { target_role, recipient_name, recipient_email });
      const inviteUrl = `${window.location.origin}/static/invite-signup.html?token=${res.token}&role=${target_role}`;
      
      const resBox = document.getElementById("new-invite-result");
      resBox.style.display = "block";
      resBox.innerHTML = `
        <div style="font-weight: 800; font-size: 0.85rem; color: var(--blood-dark);">⏱️ 5-Minute Single-Use Link Generated:</div>
        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <input type="text" class="rp-input" value="${inviteUrl}" readonly style="font-size: 0.78rem;">
          <button onclick="navigator.clipboard.writeText('${inviteUrl}'); API.showToast('Copied to clipboard!', 'success');" class="btn-primary btn-sm">Copy</button>
        </div>
      `;
      API.showToast("5-minute invite link generated!", "success");
    } catch (e) {}
  },

  // ==========================================
  // MODULE 2: VENDORS & KYC QUEUE
  // ==========================================
  async renderVendorsQueue() {
    let vendors = [];
    try {
      const res = await API.get("/api/vendors/", { silent: true });
      if (res && res.vendors) vendors = res.vendors;
    } catch (e) {}

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">Vendors & KYC Review Queue</h1>
            <div class="admin-page-desc">Audit credentials, business CAC registrations, bank details and approve/reject stores</div>
          </div>
          <a href="/api/admin/export/vendors" class="btn-secondary btn-sm" download>📥 Export Vendors CSV</a>
        </div>

        <div class="rp-card">
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>Vendor / Store</th>
                  <th>Business Type</th>
                  <th>Owner Contact</th>
                  <th>Bank Settlement Account</th>
                  <th>KYC Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${vendors.map(v => `
                  <tr>
                    <td>
                      <div style="font-weight: 800; color: var(--blood-dark);">${v.business_name}</div>
                      <div style="font-size: 0.72rem; color: var(--gray-500);">${v.store_name || 'Store Pending'}</div>
                    </td>
                    <td>${v.business_type}</td>
                    <td>
                      <div>${v.full_name}</div>
                      <div style="font-size: 0.72rem; color: var(--gray-500);">${v.phone}</div>
                    </td>
                    <td style="font-size: 0.75rem;">
                      <div>${v.bank_name || 'GTBank'}</div>
                      <div><code>${v.account_number || '0000000000'}</code> (${v.account_name || v.full_name})</div>
                    </td>
                    <td><span class="badge badge-${v.kyc_status.toLowerCase()}">${v.kyc_status}</span></td>
                    <td>
                      <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        ${v.store_id ? `
                          <button onclick="AdminPortal.filterProductsByStore('${v.store_id}')" class="btn-secondary btn-sm" title="View, Add, and Edit this vendor's products">
                            📦 Products
                          </button>
                        ` : ''}
                        ${v.kyc_status !== 'APPROVED' ? `
                          <button onclick="AdminPortal.decideKYC('${v.id}', 'APPROVED')" class="btn-success btn-sm">Approve</button>
                        ` : ''}
                        ${v.kyc_status !== 'REJECTED' ? `
                          <button onclick="AdminPortal.decideKYC('${v.id}', 'REJECTED')" class="btn-danger btn-sm">Reject</button>
                        ` : ''}
                        <a href="https://wa.me/${v.phone.replace(/[^0-9]/g, '')}?text=Hello%20from%20RushingPoint%20Admin" target="_blank" class="btn-whatsapp btn-sm" style="text-decoration: none;">💬 WA</a>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  async decideKYC(vendorId, decision) {
    try {
      const res = await API.post(`/api/vendors/${vendorId}/kyc-decision`, { decision, notes: `Admin KYC decision: ${decision}` });
      API.showToast(res.message, "success");
      this.render();
    } catch (e) {}
  },

  async filterProductsByStore(storeId) {
    this.currentTab = "products";
    const container = document.getElementById("admin-main-pane");
    if (container) {
      container.innerHTML = await this.renderProductsCatalog(storeId);
    }
  },

  // ==========================================
  // MODULE 3: CATEGORY MASTER (with Deletion Safeguard)
  // ==========================================
  async renderCategoryMaster() {
    let categories = [];
    try {
      const res = await API.get("/api/categories/", { silent: true });
      if (res && res.categories) categories = res.categories;
    } catch (e) {}

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">Category & Subcategory Master</h1>
            <div class="admin-page-desc">Exclusively controlled by Admin. Includes automatic deletion safeguards to protect products.</div>
          </div>
          <button onclick="AdminPortal.showCreateCategoryModal()" class="btn-primary btn-sm">+ Create New Category</button>
        </div>

        <div class="rp-card">
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>Category Name</th>
                  <th>Slug</th>
                  <th>Subcategories</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${categories.map(c => `
                  <tr>
                    <td style="font-weight: 800; color: var(--blood-dark);">${c.name}</td>
                    <td><code>${c.slug}</code></td>
                    <td>
                      <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        ${(c.subcategories || []).map(s => `
                          <span style="background: var(--gray-100); border: 1px solid var(--gray-300); font-size: 0.68rem; padding: 2px 6px; border-radius: 4px;">${s.name}</span>
                        `).join('')}
                        <button onclick="AdminPortal.showAddSubcategoryModal('${c.id}', '${c.name}')" class="btn-secondary btn-sm" style="padding: 1px 6px; font-size: 0.65rem;">+ Sub</button>
                      </div>
                    </td>
                    <td><span class="badge ${c.is_active ? 'badge-active' : 'badge-rejected'}">${c.is_active ? 'Active' : 'Disabled'}</span></td>
                    <td>
                      <button onclick="AdminPortal.deleteCategoryWithSafeguard('${c.id}', '${c.name}')" class="btn-danger btn-sm">Delete</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  showCreateCategoryModal() {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 400px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">Create Category</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="AdminPortal.handleCreateCategory(event)">
          <div class="rp-form-group">
            <label class="rp-label">Category Name</label>
            <input type="text" id="new-cat-name" class="rp-input" placeholder="e.g. Building Materials & Blocks" required>
          </div>
          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 10px;">
            Save Category
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleCreateCategory(e) {
    e.preventDefault();
    const name = document.getElementById("new-cat-name").value.trim();
    try {
      await API.post("/api/categories/", { name });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(`Category '${name}' created!`, "success");
      this.render();
    } catch (e) {}
  },

  showAddSubcategoryModal(catId, catName) {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 400px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">Add Subcategory to ${catName}</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="AdminPortal.handleAddSubcategory(event, '${catId}')">
          <div class="rp-form-group">
            <label class="rp-label">Subcategory Name</label>
            <input type="text" id="new-sub-name" class="rp-input" placeholder="e.g. Cement, Blocks, Bricks" required>
          </div>
          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 10px;">
            Add Subcategory
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleAddSubcategory(e, catId) {
    e.preventDefault();
    const name = document.getElementById("new-sub-name").value.trim();
    try {
      await API.post(`/api/categories/${catId}/subcategories`, { name });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(`Subcategory '${name}' added!`, "success");
      this.render();
    } catch (e) {}
  },

  async deleteCategoryWithSafeguard(catId, catName) {
    if (!confirm(`Are you sure you want to delete '${catName}'? The system will safeguard all associated products.`)) return;
    try {
      const res = await API.delete(`/api/categories/${catId}`);
      API.showToast(res.message, "success");
      this.render();
    } catch (err) {}
  },

  // ==========================================
  // MODULE: WAYBILLS & CUSTOM LOGISTICS DISPATCHES (Function 2 for Riders)
  // ==========================================
  async renderWaybillsModule() {
    let dispatches = [];
    let riders = [];
    try {
      const res = await API.get("/api/admin/custom-dispatches", { silent: true });
      if (res && res.dispatches) dispatches = res.dispatches;
      const rRes = await API.get("/api/riders/live-map", { silent: true });
      if (rRes && rRes.riders) riders = rRes.riders;
    } catch (e) {}

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">Waybills & Custom Logistics Dispatch Generator</h1>
            <div class="admin-page-desc">Generate payment links for station/park pickups (e.g. goods arriving from Kano/other states to Katsina) and assign riders with manual payouts</div>
          </div>
          <button onclick="AdminPortal.showCreateWaybillModal()" class="btn-primary btn-sm">
            ⚡ Generate New Waybill Payment Link
          </button>
        </div>

        <div id="new-waybill-result" style="display: none; margin-bottom: 16px;"></div>

        <!-- Waybills Queue Table -->
        <div class="rp-card">
          <div class="rp-card-header">
            <div class="rp-card-title">Active Custom Logistics & Waybills (${dispatches.length})</div>
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Item & Description</th>
                  <th>Pickup Location</th>
                  <th>Dropoff Destination</th>
                  <th>Customer</th>
                  <th>Transport Fee</th>
                  <th>Status</th>
                  <th>Admin Actions</th>
                </tr>
              </thead>
              <tbody>
                ${dispatches.length === 0 ? `
                  <tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--gray-500);">No custom waybill dispatches generated yet.</td></tr>
                ` : dispatches.map(d => {
                  const fee = Number(d.estimated_price || d.delivery_fee || 0);
                  const custContact = (d.dropoff_contact || d.pickup_contact || '').replace(/[^0-9+]/g, '');
                  return `
                  <tr>
                    <td><strong style="color:var(--blood-primary);">${d.request_ref}</strong></td>
                    <td>${d.item_description || 'General Cargo'}</td>
                    <td>📍 <strong>${d.pickup_address || 'Station / Motor Park'}</strong></td>
                    <td>📍 ${d.dropoff_address || 'Customer Destination'}</td>
                    <td>
                      <div>${custContact}</div>
                      ${custContact ? `<a href="https://wa.me/${custContact.replace(/[^0-9]/g, '')}?text=Hello%20from%20RushingPoint%20Logistics%20regarding%20waybill%20${d.request_ref}" target="_blank" class="btn-whatsapp btn-sm" style="margin-top: 2px; text-decoration: none;">💬 WhatsApp</a>` : ''}
                    </td>
                    <td><strong style="color:#059669;">₦${fee.toLocaleString()}</strong></td>
                    <td><span class="badge badge-${(d.status || 'pending').toLowerCase()}">${d.status || 'PENDING'}</span></td>
                    <td>
                      <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        <button onclick="AdminPortal.showPayRiderModal('${d.id}', '${d.request_ref}', ${fee})" class="btn-primary btn-sm" title="Pay rider manually before or after delivery">
                          💳 Pay Rider
                        </button>
                        <a href="http://localhost:8000/pay/waybill/${d.request_ref}" target="_blank" class="btn-secondary btn-sm" style="text-decoration: none;">
                          📲 Invoice
                        </a>
                      </div>
                    </td>
                  </tr>
                `}).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  showCreateWaybillModal() {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 500px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">📦 Generate Waybill Payment Link</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="AdminPortal.handleCreateWaybill(event)">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Customer Name *</label>
              <input type="text" id="wb-cust-name" class="rp-input" placeholder="e.g. Mallam Usman" required value="Mallam Usman">
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Customer Phone (WhatsApp) *</label>
              <input type="tel" id="wb-cust-phone" class="rp-input" placeholder="+2348011112222" required value="+2348033339999">
            </div>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Item / Property Description *</label>
            <input type="text" id="wb-desc" class="rp-input" placeholder="e.g. 3 Cartons of Electronics from Kano Park" required value="3 Cartons of Motor Spare Parts from Kano">
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Pickup Location (Motor Park / Station) *</label>
            <input type="text" id="wb-pickup" class="rp-input" placeholder="e.g. Katsina Central Motor Park, Kano Road" required value="Katsina Central Motor Park, Bayajidda Road, Katsina">
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Dropoff Address (Customer Doorstep) *</label>
            <input type="text" id="wb-dropoff" class="rp-input" placeholder="e.g. 12 Kofar Kaura Layout, Katsina" required value="12 Kofar Kaura Layout, Katsina">
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Agreed Transport Fee (NGN) *</label>
            <input type="number" id="wb-fee" class="rp-input" placeholder="3500" required min="100" value="3500">
          </div>

          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px;">
            Generate Link & Invoice 🚀
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleCreateWaybill(e) {
    e.preventDefault();
    const customer_name = document.getElementById("wb-cust-name").value.trim();
    const customer_phone = document.getElementById("wb-cust-phone").value.trim();
    const item_description = document.getElementById("wb-desc").value.trim();
    const pickup_location = document.getElementById("wb-pickup").value.trim();
    const dropoff_address = document.getElementById("wb-dropoff").value.trim();
    const transport_fee = parseFloat(document.getElementById("wb-fee").value);

    try {
      const res = await API.post("/api/admin/custom-dispatch/generate-link", {
        customer_name, customer_phone, item_description, pickup_location, dropoff_address, transport_fee
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      
      const resBox = document.getElementById("new-waybill-result");
      if (resBox) {
        resBox.style.display = "block";
        resBox.innerHTML = `
          <div class="rp-card" style="background: #F0FDF4; border: 1px solid #BBF7D0;">
            <div style="font-weight: 800; color: #166534; font-size: 0.9rem;">✓ Waybill Link Generated: ${res.dispatch_ref}</div>
            <div style="margin: 6px 0; font-size: 0.78rem;">Payment Link: <code>${res.payment_link}</code></div>
            <div style="display: flex; gap: 8px;">
              <button onclick="navigator.clipboard.writeText('${res.payment_link}'); API.showToast('Copied link!', 'success');" class="btn-secondary btn-sm">📋 Copy Link</button>
              <a href="${res.whatsapp_url}" target="_blank" class="btn-primary btn-sm" style="background: #25D366; text-decoration: none;">📲 Send Invoice via WhatsApp</a>
            </div>
          </div>
        `;
      }
      API.showToast("Waybill link generated successfully!", "success");
      this.render();
    } catch (err) {}
  },

  showPayRiderModal(requestId, requestRef, transportFee) {
    let riders = [];
    API.get("/api/riders/live-map").then(res => {
      if (res && res.riders) riders = res.riders;
      const modal = document.createElement("div");
      modal.className = "modal-backdrop rp-modal-overlay";
      modal.innerHTML = `
        <div class="modal-dialog" style="max-width: 420px;">
          <div class="modal-header">
            <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--blood-dark);">💳 Pay Rider for Waybill (${requestRef})</h3>
            <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
          </div>
          <form onsubmit="AdminPortal.handlePayRider(event, '${requestId}')">
            <div class="rp-form-group">
              <label class="rp-label">Select Rider</label>
              <select id="pr-rider-id" class="rp-select" required>
                ${riders.map(r => `<option value="${r.id}">${r.full_name} (${r.rider_ref} - ${r.vehicle_type})</option>`).join('')}
              </select>
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Payout Amount (NGN)</label>
              <input type="number" id="pr-amount" class="rp-input" value="${Math.round(transportFee * 0.8)}" required min="100">
              <div style="font-size: 0.68rem; color: var(--gray-500); margin-top: 2px;">Admin can disburse funds before or after delivery.</div>
            </div>
            <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 10px;">
              Confirm Direct Rider Payout 💸
            </button>
          </form>
        </div>
      `;
      document.body.appendChild(modal);
    });
  },

  async handlePayRider(e, requestId) {
    e.preventDefault();
    const rider_id = document.getElementById("pr-rider-id").value;
    const amount = parseFloat(document.getElementById("pr-amount").value);
    try {
      const res = await API.post(`/api/admin/custom-dispatch/${requestId}/pay-rider`, { rider_id, amount });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message, "success");
      this.render();
    } catch (err) {}
  },

  // ==========================================
  // MODULE: PRODUCT CATALOG & BULK ACTIONS
  // ==========================================
  async renderProductsCatalog(vendorFilter = null) {
    let products = [];
    let stores = [];
    let categories = [];

    try {
      const res = await API.get("/api/products/", { silent: true });
      if (res && res.products) products = res.products;
      const sRes = await API.get("/api/marketplace/stores", { silent: true });
      if (sRes && sRes.stores) stores = sRes.stores;
      const cRes = await API.get("/api/categories/", { silent: true });
      if (cRes && cRes.categories) categories = cRes.categories;
    } catch (e) {}

    if (vendorFilter) {
      products = products.filter(p => p.store_id === vendorFilter);
    }

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">Marketplace Product Catalog & Bulk Actions</h1>
            <div class="admin-page-desc">Admin master control: Add/update products on behalf of vendors, bulk price adjustments, stock quantities, and visual images</div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button onclick="AdminPortal.showBulkUpdateModal()" class="btn-secondary btn-sm" style="color: var(--blood-primary); border-color: var(--blood-border); font-weight: 800;">
              ⚡ Bulk Price & Stock Update
            </button>
            <button onclick="AdminPortal.showAddProductModal('${vendorFilter || ''}')" class="btn-primary btn-sm">
              + Add Product to Vendor 📦
            </button>
          </div>
        </div>

        <!-- Dynamic Selection Toolbar (Visible when products selected) -->
        <div id="admin-prod-selection-bar" class="prod-bulk-toolbar" style="display: none;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-weight: 800; font-size: 0.85rem;" id="admin-selected-count">0 products selected</span>
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button onclick="AdminPortal.showBulkUpdateModal(true)" class="btn-secondary btn-sm" style="background: #FFF; color: var(--blood-dark); font-weight: 800;">
              ⚡ Edit Selected
            </button>
            <button onclick="AdminPortal.executeQuickBulkAction('ENABLE')" class="btn-secondary btn-sm" style="background: rgba(16,185,129,0.2); color: #D1FAE5; border-color: #059669; font-weight: 800;">
              🟢 Activate
            </button>
            <button onclick="AdminPortal.executeQuickBulkAction('DISABLE')" class="btn-secondary btn-sm" style="background: rgba(239,68,68,0.2); color: #FEE2E2; border-color: #DC2626; font-weight: 800;">
              🔴 Disable
            </button>
            <button onclick="AdminPortal.executeQuickBulkAction('DELETE')" class="btn-danger btn-sm" style="font-weight: 800;">
              🗑️ Delete Selected
            </button>
            <button onclick="AdminPortal.toggleSelectAllProducts(false)" class="btn-secondary btn-sm" style="background: rgba(255,255,255,0.15); color: #FFF;">
              ✕ Clear
            </button>
          </div>
        </div>

        <div class="rp-card">
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th style="width: 36px;"><input type="checkbox" id="select-all-prods" onchange="AdminPortal.toggleSelectAllProducts(this.checked)"></th>
                  <th>Product</th>
                  <th>Store / Vendor</th>
                  <th>Category</th>
                  <th>SKU</th>
                  <th>Price & Discount</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Admin Actions</th>
                </tr>
              </thead>
              <tbody>
                ${products.map(p => `
                  <tr>
                    <td><input type="checkbox" class="prod-select-box" value="${p.id}" onchange="AdminPortal.updateSelectionBar()"></td>
                    <td>
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${p.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100'}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 8px; border: 1px solid var(--blood-border); flex-shrink: 0;" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100'">
                        <div>
                          <div style="font-weight: 800; color: var(--blood-dark); font-size: 0.85rem;">${p.name}</div>
                          <div style="font-size: 0.68rem; color: var(--gray-500);">${p.product_ref}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: var(--blood-primary);">${p.store_name}</div>
                      <div style="font-size: 0.68rem; color: var(--gray-500);">📍 ${p.store_address || 'Lagos'}</div>
                    </td>
                    <td><span style="background: var(--gray-100); border: 1px solid var(--gray-300); font-size: 0.72rem; padding: 2px 8px; border-radius: 6px;">${p.category_name}</span></td>
                    <td><code>${p.sku}</code></td>
                    <td>
                      <div style="font-weight: 800; color: var(--blood-dark);">₦${p.price.toLocaleString()}</div>
                      ${p.discount_price ? `<div style="font-size: 0.68rem; color: var(--emerald); font-weight: 700;">Promo: ₦${p.discount_price.toLocaleString()}</div>` : ''}
                    </td>
                    <td>
                      <strong style="color: ${p.stock_qty > 0 ? 'inherit' : 'red'};">${p.stock_qty}</strong>
                    </td>
                    <td><span class="badge badge-${p.status.toLowerCase()}">${p.status}</span></td>
                    <td>
                      <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        <button onclick="AdminPortal.showEditProductModal('${p.id}')" class="btn-secondary btn-sm" title="Edit all product fields">
                          ✏️ Edit
                        </button>
                        ${p.status === 'ACTIVE' ? `
                          <button onclick="AdminPortal.toggleProductStatus('${p.id}', 'DISABLED')" class="btn-secondary btn-sm" style="color: var(--amber);" title="Disable product from marketplace">
                            Disable
                          </button>
                        ` : `
                          <button onclick="AdminPortal.toggleProductStatus('${p.id}', 'ACTIVE')" class="btn-success btn-sm" title="Restore product to marketplace">
                            Restore
                          </button>
                        `}
                        <button onclick="AdminPortal.deleteProduct('${p.id}')" class="btn-danger btn-sm" title="Delete product">
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  toggleSelectAllProducts(checked) {
    document.querySelectorAll(".prod-select-box").forEach(cb => cb.checked = checked);
    const selAllHeader = document.getElementById("select-all-prods");
    if (selAllHeader) selAllHeader.checked = checked;
    this.updateSelectionBar();
  },

  updateSelectionBar() {
    const selected = Array.from(document.querySelectorAll(".prod-select-box:checked")).map(cb => cb.value);
    const bar = document.getElementById("admin-prod-selection-bar");
    const countSpan = document.getElementById("admin-selected-count");
    if (!bar) return;
    if (selected.length > 0) {
      bar.style.display = "flex";
      if (countSpan) countSpan.innerText = `${selected.length} product(s) selected`;
    } else {
      bar.style.display = "none";
    }
  },

  async executeQuickBulkAction(action) {
    const selected = Array.from(document.querySelectorAll(".prod-select-box:checked")).map(cb => cb.value);
    if (selected.length === 0) {
      API.showToast("Please select at least one product", "warning");
      return;
    }
    const actionNames = { ENABLE: 'activate', DISABLE: 'disable', DELETE: 'permanently delete' };
    if (!confirm(`Are you sure you want to ${actionNames[action] || action} ${selected.length} selected product(s)?`)) return;

    try {
      const res = await API.post("/api/products/bulk-stock-price", { action, product_ids: selected });
      API.showToast(res.message, "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (e) {}
  },

  async deleteProduct(productId, productName) {
    if (!confirm(`Are you sure you want to delete '${productName}' from catalog?`)) return;
    try {
      const res = await API.delete(`/api/products/${productId}`);
      API.showToast(res.message || "Product deleted", "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (e) {}
  },

  showBulkUpdateModal(onlySelected = false) {
    const selected = Array.from(document.querySelectorAll(".prod-select-box:checked")).map(cb => cb.value);
    const targetList = onlySelected && selected.length > 0 ? selected : (selected.length > 0 ? selected : []);

    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 460px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">⚡ Bulk Inventory & Price Adjustments</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 0.75rem; color: #92400E;">
          <strong>Target Products:</strong> ${targetList.length > 0 ? `${targetList.length} products selected` : 'All Products in Catalog'}
        </div>

        <form onsubmit="AdminPortal.handleExecuteBulkUpdate(event, ${JSON.stringify(targetList)})">
          <div class="rp-form-group">
            <label class="rp-label">Bulk Action</label>
            <select id="bulk-action" class="rp-select" onchange="AdminPortal.updateBulkLabel(this.value)">
              <option value="PERCENT_INCREASE">Increase Price by Percentage (+%)</option>
              <option value="PERCENT_DECREASE">Decrease Price by Percentage (-%)</option>
              <option value="FIXED_INCREASE">Increase Price by Fixed Amount (+₦)</option>
              <option value="FIXED_DECREASE">Reduce Price by Fixed Amount (-₦)</option>
              <option value="SET_PRICE">Set All to Specific Price (₦)</option>
              <option value="SET_STOCK">Set Stock Inventory Quantity</option>
              <option value="ENABLE">Enable & Activate Products</option>
              <option value="DISABLE">Disable Products</option>
              <option value="OUT_OF_STOCK">Mark as Out of Stock (0 Qty)</option>
              <option value="DELETE">Delete Products</option>
            </select>
          </div>

          <div class="rp-form-group" id="bulk-val-group">
            <label class="rp-label" id="bulk-val-label">Percentage Value (%)</label>
            <input type="number" id="bulk-value" class="rp-input" placeholder="e.g. 5" value="5" step="any">
          </div>

          <div style="border-top: 1px solid var(--gray-200); padding-top: 12px; margin-top: 12px;">
            <div style="font-size: 0.72rem; color: var(--gray-600); margin-bottom: 10px;">
              ⚠️ Confirmation prompt will be shown before applying changes to catalog.
            </div>
            <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px;">
              Apply Bulk Adjustment ⚡
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  updateBulkLabel(action) {
    const lbl = document.getElementById("bulk-val-label");
    const grp = document.getElementById("bulk-val-group");
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

  async handleExecuteBulkUpdate(e, selectedIds) {
    e.preventDefault();
    const action = document.getElementById("bulk-action").value;
    const value = parseFloat(document.getElementById("bulk-value")?.value || 0);

    const countLabel = selectedIds.length > 0 ? `${selectedIds.length} selected product(s)` : 'ALL products in catalog';
    const confirmMsg = `⚠️ You are about to update ${countLabel}.\nAction: ${action} ${value ? `(${value})` : ''}.\n\nDo you want to apply these changes?`;

    if (!confirm(confirmMsg)) return;

    try {
      const payload = {
        action,
        value,
        product_ids: selectedIds.length > 0 ? selectedIds : undefined
      };
      const res = await API.post("/api/products/bulk-stock-price", payload);
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message, "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (err) {}
  },

  // ==========================================
  // MODULE: REPORTS & BUSINESS INTELLIGENCE
  // ==========================================
  async renderReportsHub() {
    let reports = {
      order_statuses: {}, category_revenue: {}, top_stores: [],
      growth_metrics: { delivery_success_rate: 94.2, cancellation_rate: 2.1, avg_delivery_time_mins: 26.5 }
    };
    try {
      const res = await API.get("/api/admin/reports", { silent: true });
      if (res) reports = res;
    } catch (e) {}

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">Executive Reports & Business Intelligence</h1>
            <div class="admin-page-desc">Daily/Weekly/Monthly order trajectories, store profits, delivery success rates and active dispatch zones</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <a href="/api/admin/export/orders" class="btn-secondary btn-sm" download>📥 Export Orders CSV</a>
            <a href="/api/admin/export/settlements" class="btn-secondary btn-sm" download>📥 Export Financial CSV</a>
          </div>
        </div>

        <!-- Key Performance Indices (KPIs) -->
        <div class="metrics-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 20px;">
          <div class="metric-card">
            <div class="metric-header">Delivery Success Rate</div>
            <div class="metric-value" style="color: var(--emerald);">${reports.growth_metrics?.delivery_success_rate || 94.2}%</div>
            <div class="metric-footer">Completed vs Dispatched</div>
          </div>
          <div class="metric-card">
            <div class="metric-header">Cancellation Rate</div>
            <div class="metric-value" style="color: var(--gray-600);">${reports.growth_metrics?.cancellation_rate || 2.1}%</div>
            <div class="metric-footer">Refunded Orders</div>
          </div>
          <div class="metric-card">
            <div class="metric-header">Avg Delivery Speed</div>
            <div class="metric-value" style="color: var(--blood-primary);">${reports.growth_metrics?.avg_delivery_time_mins || 26.5} <span style="font-size: 0.9rem;">mins</span></div>
            <div class="metric-footer">Pickup to Doorstep</div>
          </div>
          <div class="metric-card">
            <div class="metric-header">Top Active Hub</div>
            <div class="metric-value" style="font-size: 1.1rem; color: var(--blood-dark);">Katsina & Lagos</div>
            <div class="metric-footer">Station-to-Door & Stores</div>
          </div>
        </div>

        <!-- Top Performing Stores Table -->
        <div class="rp-card">
          <div class="rp-card-header">
            <div class="rp-card-title">🏪 Most Profitable Stores & Merchants</div>
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>Store / Merchant</th>
                  <th>Category</th>
                  <th>Completed Orders</th>
                  <th>Total Gross Volume</th>
                </tr>
              </thead>
              <tbody>
                ${(reports.top_stores || []).map(s => `
                  <tr>
                    <td><strong>${s.store_name}</strong></td>
                    <td>${s.category}</td>
                    <td>${s.order_count} deliveries</td>
                    <td><strong style="color: var(--blood-primary);">₦${(s.total_volume || 0).toLocaleString()}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  async showAddProductModal(preselectedStoreId = "") {
    let stores = [];
    let categories = [];
    try {
      const sRes = await API.get("/api/marketplace/stores");
      if (sRes && sRes.stores) stores = sRes.stores;
      const cRes = await API.get("/api/categories/");
      if (cRes && cRes.categories) categories = cRes.categories;
    } catch (e) {}

    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 520px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">👑 Admin: Add Product to Vendor Store</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="AdminPortal.handleCreateVendorProduct(event)">
          <div class="rp-form-group">
            <label class="rp-label">Select Vendor / Store *</label>
            <select id="new-p-store" class="rp-select" required>
              ${stores.map(s => `
                <option value="${s.id}" ${s.id === preselectedStoreId ? 'selected' : ''}>${s.store_name} (${s.address})</option>
              `).join('')}
            </select>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Product Name *</label>
            <input type="text" id="new-p-name" class="rp-input" placeholder="e.g. Premium Basmati Rice (25kg)" required>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Category *</label>
              <select id="new-p-cat" class="rp-select" required>
                ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="rp-form-group">
              <label class="rp-label">SKU (Optional)</label>
              <input type="text" id="new-p-sku" class="rp-input" placeholder="e.g. GR-RICE-25">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Price (NGN) *</label>
              <input type="number" id="new-p-price" class="rp-input" placeholder="35000" required min="10">
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Stock Quantity *</label>
              <input type="number" id="new-p-stock" class="rp-input" placeholder="50" required min="0">
            </div>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Product Image * (2 Options)</label>
            
            <!-- Option Tabs -->
            <div style="display: flex; gap: 6px; margin-bottom: 8px;">
              <button type="button" id="new-p-tab-upload" onclick="AdminPortal.switchImgTab('new-p', 'upload')" style="flex: 1; padding: 6px 10px; background: var(--blood-primary); color: #FFF; border: none; border-radius: 8px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">
                📁 Option 1: Upload from System (Auto-Compressed)
              </button>
              <button type="button" id="new-p-tab-url" onclick="AdminPortal.switchImgTab('new-p', 'url')" style="flex: 1; padding: 6px 10px; background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                🔗 Option 2: Image Web Link
              </button>
            </div>

            <!-- Option 1: System Upload -->
            <div id="new-p-upload-sec" style="display: block; border: 2px dashed #CBD5E1; border-radius: 12px; padding: 14px; text-align: center; background: #F8FAFC;">
              <input type="file" id="new-p-file" accept="image/*" style="display: none;" onchange="AdminPortal.processAndUploadImage(this, 'new-p-img', 'new-p-img-preview', 'new-p-img-status')">
              <button type="button" onclick="document.getElementById('new-p-file').click()" class="btn-secondary btn-sm" style="padding: 8px 18px; font-weight: 800; cursor: pointer;">
                📷 Choose Picture from Device / Phone
              </button>
              <div style="font-size: 0.72rem; color: #64748B; margin-top: 6px;">Automatically downsizes & compresses to small KB (< 150KB) with crisp HD quality.</div>
              <div id="new-p-img-status" style="margin-top: 6px;"></div>
            </div>

            <!-- Option 2: Web URL -->
            <div id="new-p-url-sec" style="display: none;">
              <input type="url" id="new-p-img" class="rp-input" placeholder="https://images.unsplash.com/..." required value="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500" oninput="AdminPortal.updateImagePreview(this.value, 'new-p-img-preview')">
              
              <!-- Quick Preset Buttons -->
              <div style="display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap;">
                <span style="font-size: 0.68rem; color: var(--gray-500); align-self: center; margin-right: 4px;">Sample Presets:</span>
                <button type="button" class="product-preset-btn" onclick="AdminPortal.applyImagePreset('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500', 'new-p-img', 'new-p-img-preview')">🍔 Food</button>
                <button type="button" class="product-preset-btn" onclick="AdminPortal.applyImagePreset('https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500', 'new-p-img', 'new-p-img-preview')">💻 Tech</button>
                <button type="button" class="product-preset-btn" onclick="AdminPortal.applyImagePreset('https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=500', 'new-p-img', 'new-p-img-preview')">🏗️ Building</button>
                <button type="button" class="product-preset-btn" onclick="AdminPortal.applyImagePreset('https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=500', 'new-p-img', 'new-p-img-preview')">🌾 Agro</button>
                <button type="button" class="product-preset-btn" onclick="AdminPortal.applyImagePreset('https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=500', 'new-p-img', 'new-p-img-preview')">👕 Fashion</button>
              </div>
            </div>

            <!-- Live Image Preview Thumbnail -->
            <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px; background: var(--blood-soft); border: 1px solid var(--blood-border); border-radius: 10px; padding: 8px;">
              <img id="new-p-img-preview" src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500" style="width: 55px; height: 55px; object-fit: cover; border-radius: 8px; border: 1px solid var(--blood-border);" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500'">
              <div style="font-size: 0.72rem; color: var(--gray-600);">
                <div style="font-weight: 800; color: var(--blood-dark);">📷 Live Visual Preview</div>
                <div>Displays live on customer storefront & rider dispatch screens</div>
              </div>
            </div>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Product Description</label>
            <textarea id="new-p-desc" class="rp-textarea" rows="2" placeholder="Describe the item..."></textarea>
          </div>

          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px;">
            Publish Product to Vendor Store 🚀
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  updateImagePreview(url, previewImgId) {
    const img = document.getElementById(previewImgId);
    if (img && url) {
      img.src = url.trim();
    }
  },

  applyImagePreset(url, inputId, previewImgId) {
    const input = document.getElementById(inputId);
    if (input) input.value = url;
    this.updateImagePreview(url, previewImgId);
  },

  async handleCreateVendorProduct(e) {
    e.preventDefault();
    const store_id = document.getElementById("new-p-store").value;
    const name = document.getElementById("new-p-name").value.trim();
    const category_id = document.getElementById("new-p-cat").value;
    const sku = document.getElementById("new-p-sku").value.trim() || undefined;
    const price = parseFloat(document.getElementById("new-p-price").value);
    const stock_qty = parseInt(document.getElementById("new-p-stock").value);
    const image_url = document.getElementById("new-p-img").value.trim();
    const description = document.getElementById("new-p-desc").value.trim();

    try {
      const res = await API.post("/api/products/", {
        store_id, name, category_id, sku, price, stock_qty, image_url, description
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message || "Product published to vendor store!", "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (err) {}
  },

  async showEditProductModal(productId) {
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
      <div class="modal-dialog" style="max-width: 520px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">👑 Admin: Edit Vendor Product</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="AdminPortal.handleSaveFullProduct(event, '${productId}')">
          <div style="font-size: 0.78rem; color: var(--gray-600); margin-bottom: 10px;">
            Belongs to Vendor: <strong>${p.store_name}</strong> • Ref: <code>${p.product_ref}</code>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Product Name</label>
            <input type="text" id="edit-fp-name" class="rp-input" value="${p.name}" required>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Category</label>
              <select id="edit-fp-cat" class="rp-select">
                ${categories.map(c => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="rp-form-group">
              <label class="rp-label">SKU</label>
              <input type="text" id="edit-fp-sku" class="rp-input" value="${p.sku || ''}">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Price (NGN)</label>
              <input type="number" id="edit-fp-price" class="rp-input" value="${p.price}" required min="1">
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Stock Quantity</label>
              <input type="number" id="edit-fp-stock" class="rp-input" value="${p.stock_qty}" required min="0">
            </div>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Product Image * (2 Options)</label>
            
            <!-- Option Tabs -->
            <div style="display: flex; gap: 6px; margin-bottom: 8px;">
              <button type="button" id="edit-fp-tab-upload" onclick="AdminPortal.switchImgTab('edit-fp', 'upload')" style="flex: 1; padding: 6px 10px; background: var(--blood-primary); color: #FFF; border: none; border-radius: 8px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">
                📁 Option 1: Upload from System (Auto-Compressed)
              </button>
              <button type="button" id="edit-fp-tab-url" onclick="AdminPortal.switchImgTab('edit-fp', 'url')" style="flex: 1; padding: 6px 10px; background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                🔗 Option 2: Image Web Link
              </button>
            </div>

            <!-- Option 1: System Upload -->
            <div id="edit-fp-upload-sec" style="display: block; border: 2px dashed #CBD5E1; border-radius: 12px; padding: 14px; text-align: center; background: #F8FAFC;">
              <input type="file" id="edit-fp-file" accept="image/*" style="display: none;" onchange="AdminPortal.processAndUploadImage(this, 'edit-fp-img', 'edit-fp-img-preview', 'edit-fp-img-status')">
              <button type="button" onclick="document.getElementById('edit-fp-file').click()" class="btn-secondary btn-sm" style="padding: 8px 18px; font-weight: 800; cursor: pointer;">
                📷 Choose Picture from Device / Phone
              </button>
              <div style="font-size: 0.72rem; color: #64748B; margin-top: 6px;">Automatically downsizes & compresses to small KB (< 150KB) with crisp HD quality.</div>
              <div id="edit-fp-img-status" style="margin-top: 6px;"></div>
            </div>

            <!-- Option 2: Web URL -->
            <div id="edit-fp-url-sec" style="display: none;">
              <input type="url" id="edit-fp-img" class="rp-input" value="${p.image_url}" required oninput="AdminPortal.updateImagePreview(this.value, 'edit-fp-img-preview')">
              
              <!-- Quick Preset Buttons -->
              <div style="display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap;">
                <span style="font-size: 0.68rem; color: var(--gray-500); align-self: center; margin-right: 4px;">Sample Presets:</span>
                <button type="button" class="product-preset-btn" onclick="AdminPortal.applyImagePreset('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500', 'edit-fp-img', 'edit-fp-img-preview')">🍔 Food</button>
                <button type="button" class="product-preset-btn" onclick="AdminPortal.applyImagePreset('https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500', 'edit-fp-img', 'edit-fp-img-preview')">💻 Tech</button>
                <button type="button" class="product-preset-btn" onclick="AdminPortal.applyImagePreset('https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=500', 'edit-fp-img', 'edit-fp-img-preview')">🏗️ Building</button>
                <button type="button" class="product-preset-btn" onclick="AdminPortal.applyImagePreset('https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=500', 'edit-fp-img', 'edit-fp-img-preview')">🌾 Agro</button>
                <button type="button" class="product-preset-btn" onclick="AdminPortal.applyImagePreset('https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=500', 'edit-fp-img', 'edit-fp-img-preview')">👕 Fashion</button>
              </div>
            </div>

            <!-- Live Image Preview Thumbnail -->
            <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px; background: var(--blood-soft); border: 1px solid var(--blood-border); border-radius: 10px; padding: 8px;">
              <img id="edit-fp-img-preview" src="${p.image_url}" style="width: 55px; height: 55px; object-fit: cover; border-radius: 8px; border: 1px solid var(--blood-border);" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500'">
              <div style="font-size: 0.72rem; color: var(--gray-600);">
                <div style="font-weight: 800; color: var(--blood-dark);">📷 Live Visual Preview</div>
                <div>Displays live on customer & rider screens</div>
              </div>
            </div>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Description</label>
            <textarea id="edit-fp-desc" class="rp-textarea" rows="2">${p.description || ''}</textarea>
          </div>

          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px;">
            Save Product Changes 💾
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleSaveFullProduct(e, productId) {
    e.preventDefault();
    const name = document.getElementById("edit-fp-name").value.trim();
    const category_id = document.getElementById("edit-fp-cat").value;
    const sku = document.getElementById("edit-fp-sku").value.trim();
    const price = parseFloat(document.getElementById("edit-fp-price").value);
    const stock_qty = parseInt(document.getElementById("edit-fp-stock").value);
    const image_url = document.getElementById("edit-fp-img").value.trim();
    const description = document.getElementById("edit-fp-desc").value.trim();

    try {
      await API.put(`/api/products/${productId}`, {
        name, category_id, sku, price, stock_qty, image_url, description
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast("Vendor product updated successfully", "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (e) {}
  },

  async toggleProductStatus(productId, newStatus) {
    try {
      await API.put(`/api/products/${productId}`, { status: newStatus });
      API.showToast(`Product status set to ${newStatus}`, "info");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (e) {}
  },

  // ==========================================
  // MODULE 9: 4-WAY FINANCE LEDGER, ZONES & EXPENSES
  // ==========================================
  async renderFinanceLedger() {
    let summary = { total_gmv: 0, total_vendor_payouts: 0, total_rider_earnings: 0, internal_rider_earnings: 0, external_rider_commissions: 0, admin_internal_fleet_revenue: 0, admin_delivery_commission_earned: 0, total_platform_revenue: 0, total_expenses: 0, net_profit: 0, admin_wallet_balance: 0 };
    let admin_wallet = null;
    let admin_transactions = [];
    let settlements = [];
    let zones = [];
    let expenses = [];
    let dailySnap = null;

    try {
      const fRes = await API.get("/api/finance/overview", { silent: true });
      if (fRes && fRes.summary) summary = fRes.summary;
      if (fRes && fRes.admin_wallet) admin_wallet = fRes.admin_wallet;
      if (fRes && fRes.admin_transactions) admin_transactions = fRes.admin_transactions;
      if (fRes && fRes.settlements) settlements = fRes.settlements;
      const zRes = await API.get("/api/finance/zones", { silent: true });
      if (zRes && zRes.zones) zones = zRes.zones;
      const eRes = await API.get("/api/finance/expenses", { silent: true });
      if (eRes && eRes.expenses) expenses = eRes.expenses;
      const sRes = await API.get("/api/finance/daily-reconciliation-snapshot", { silent: true });
      if (sRes && sRes.summary) dailySnap = sRes;
    } catch (e) {}

    const totalAdminDeliveryEarnings = (summary.admin_delivery_commission_earned || 0) + (summary.admin_internal_fleet_revenue || 0);

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">4-Way Financial Ledger & Admin Delivery Wallet</h1>
            <div class="admin-page-desc">Customer Payment → Vendor Net (100% Product Price) + Rider Split (Internal Fleet vs External Commission) + Admin Retained Delivery Earnings</div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button onclick="AdminPortal.showOfflineRiderPayoutSelectorModal()" class="btn-primary btn-sm" style="background: #D97706; font-weight: 800;" title="Disburse cash or direct bank transfer for riders who don't have smartphones">
              🛵 Disburse Offline Rider Payout
            </button>
            <button onclick="AdminPortal.showManualPayoutModal()" class="btn-primary btn-sm" style="background: #059669; font-weight: 800;">
              💸 + New Manual Payout
            </button>
            <button onclick="AdminPortal.showAddZoneModal()" class="btn-secondary btn-sm">+ Delivery Zone</button>
            <button onclick="AdminPortal.showAddExpenseModal()" class="btn-secondary btn-sm">+ Record Expense</button>
          </div>
        </div>

        <!-- Today's Real-Time Daily P&L Reconciliation Snapshot -->
        ${dailySnap && dailySnap.summary ? `
          <div class="rp-card" style="margin-bottom: 20px; padding: 16px; border: 1.5px solid #BBF7D0; background: #F0FDF4; border-radius: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
              <div>
                <div style="font-size: 0.95rem; font-weight: 900; color: #166534; display: flex; align-items: center; gap: 6px;">
                  <span>📊 Daily P&L Reconciliation Snapshot (${dailySnap.date})</span>
                  <span class="badge" style="background: #059669; color: #FFF; font-size: 0.6rem;">LIVE AUDIT</span>
                </div>
                <div style="font-size: 0.72rem; color: #15803D;">Automated audit breakdown: gross volume, merchant settlements, courier splits & RushPoint net profit.</div>
              </div>
              <button onclick="window.print()" class="btn-secondary btn-sm" style="font-size: 0.72rem; font-weight: 800; border-radius: 8px;">
                🖨️ Print Daily Audit
              </button>
            </div>

            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
              <div style="background: #FFF; border: 1px solid #BBF7D0; border-radius: 10px; padding: 10px;">
                <div style="font-size: 0.68rem; color: #64748B; font-weight: 700;">Gross GMV Today</div>
                <div style="font-size: 1.15rem; font-weight: 900; color: #1E293B;">₦${dailySnap.summary.gross_merchandise_value_ngn.toLocaleString()}</div>
                <div style="font-size: 0.62rem; color: #15803D; font-weight: 700;">${dailySnap.summary.total_orders} Orders (${dailySnap.summary.completed_orders} delivered)</div>
              </div>
              <div style="background: #FFF; border: 1px solid #BBF7D0; border-radius: 10px; padding: 10px;">
                <div style="font-size: 0.68rem; color: #64748B; font-weight: 700;">Merchant Fulfillments</div>
                <div style="font-size: 1.15rem; font-weight: 900; color: #7F1D1D;">₦${dailySnap.summary.vendor_payouts_due_ngn.toLocaleString()}</div>
                <div style="font-size: 0.62rem; color: #64748B;">100% item price retained</div>
              </div>
              <div style="background: #FFF; border: 1px solid #BBF7D0; border-radius: 10px; padding: 10px;">
                <div style="font-size: 0.68rem; color: #64748B; font-weight: 700;">Rider Commissions</div>
                <div style="font-size: 1.15rem; font-weight: 900; color: #2563EB;">₦${dailySnap.summary.rider_commissions_earned_ngn.toLocaleString()}</div>
                <div style="font-size: 0.62rem; color: #64748B;">Cleared to rider wallets</div>
              </div>
              <div style="background: #FFF; border: 1px solid #BBF7D0; border-radius: 10px; padding: 10px;">
                <div style="font-size: 0.68rem; color: #64748B; font-weight: 700;">RushPoint Net Profit</div>
                <div style="font-size: 1.15rem; font-weight: 900; color: #059669;">₦${dailySnap.summary.rushpoint_net_platform_profit_ngn.toLocaleString()}</div>
                <div style="font-size: 0.62rem; color: #059669; font-weight: 800;">Pure Platform Take-Rate</div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- 🎁 Late Delivery Auto-Compensation Settings Card -->
        <div class="rp-card" id="lateCompCard" style="margin-bottom: 20px; padding: 18px; border: 1.5px solid #FDE68A; background: #FFFBEB; border-radius: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 14px;">
            <div>
              <div style="font-size: 0.95rem; font-weight: 900; color: #92400E; display: flex; align-items: center; gap: 6px;">
                🎁 Late Delivery Auto-Compensation
                <span class="badge" id="lateCompBadge" style="background: #D97706; color: #FFF; font-size: 0.6rem;">LOADING...</span>
              </div>
              <div style="font-size: 0.72rem; color: #78350F; margin-top: 2px;">
                When delivery exceeds the promised time, the system <strong>automatically credits</strong> the customer's wallet — no manual action needed.
              </div>
            </div>
          </div>
          <div id="lateCompForm" style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 12px; align-items: end; flex-wrap: wrap;">
            <div>
              <label style="font-size: 0.72rem; font-weight: 800; color: #78350F; display: block; margin-bottom: 4px;">⏱️ Time Threshold (minutes)</label>
              <input id="lateCompThreshold" type="number" min="5" max="240" value="45"
                style="width: 100%; padding: 10px 12px; border: 1.5px solid #FCD34D; border-radius: 10px; font-size: 0.9rem; font-weight: 700; background: #FFF; outline: none;"
                placeholder="e.g. 45" />
              <div style="font-size: 0.62rem; color: #92400E; margin-top: 3px;">Minutes after assignment before credit triggers</div>
            </div>
            <div>
              <label style="font-size: 0.72rem; font-weight: 800; color: #78350F; display: block; margin-bottom: 4px;">💰 Auto-Credit Amount (₦)</label>
              <input id="lateCompAmount" type="number" min="0" step="50" value="500"
                style="width: 100%; padding: 10px 12px; border: 1.5px solid #FCD34D; border-radius: 10px; font-size: 0.9rem; font-weight: 700; background: #FFF; outline: none;"
                placeholder="e.g. 500" />
              <div style="font-size: 0.62rem; color: #92400E; margin-top: 3px;">NGN added to customer wallet (one-time per order)</div>
            </div>
            <div>
              <label style="font-size: 0.72rem; font-weight: 800; color: #78350F; display: block; margin-bottom: 4px;">🔛 Status</label>
              <select id="lateCompEnabled"
                style="width: 100%; padding: 10px 12px; border: 1.5px solid #FCD34D; border-radius: 10px; font-size: 0.9rem; font-weight: 700; background: #FFF; outline: none;">
                <option value="true">✅ Enabled — Auto-Credit Active</option>
                <option value="false">⏸️ Disabled — Paused</option>
              </select>
              <div style="font-size: 0.62rem; color: #92400E; margin-top: 3px;">Toggle auto-compensation on/off</div>
            </div>
            <div>
              <button onclick="AdminPortal.saveLateDeliverySettings()" class="btn-primary btn-sm"
                style="background: #D97706; border-color: #B45309; font-weight: 900; white-space: nowrap; padding: 10px 18px; border-radius: 10px; font-size: 0.85rem;">
                💾 Save Settings
              </button>
            </div>
          </div>
          <div id="lateCompInfo" style="margin-top: 12px; font-size: 0.72rem; color: #065F46; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 8px 12px; display: none;"></div>
        </div>

        <!-- Admin Master Operations & Delivery Commission Wallet Card -->
        <div style="background: linear-gradient(135deg, #450A0A 0%, #7F1D1D 50%, #B91C1C 100%); color: #FFF; border-radius: 18px; padding: 20px; margin-bottom: 20px; box-shadow: 0 6px 20px rgba(127, 29, 29, 0.25);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px;">
            <div>
              <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; opacity: 0.85; font-weight: 700;">👑 Admin Master Corporate Wallet</div>
              <div style="font-size: 2.2rem; font-weight: 900; letter-spacing: -0.5px; margin: 4px 0 8px;">
                ₦${(summary.admin_wallet_balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </div>
              <div style="font-size: 0.78rem; opacity: 0.9; color: #FEE2E2;">
                Active holding of all cleared platform revenues, delivery commissions & active escrow deposits.
              </div>
            </div>

            <!-- Delivery Commission Breakdown Stats Box -->
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 14px; padding: 14px 18px; min-width: 280px;">
              <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #FDE68A; margin-bottom: 8px;">🛵 Admin Delivery Revenue Breakdown:</div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 5px;">
                <span>External Rider Commissions:</span>
                <strong style="color: #6EE7B7;">₦${(summary.admin_delivery_commission_earned || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 5px;">
                <span>Internal Fleet Retained Transport:</span>
                <strong style="color: #93C5FD;">₦${(summary.admin_internal_fleet_revenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.88rem; font-weight: 900; border-top: 1px dashed rgba(255,255,255,0.25); padding-top: 6px; margin-top: 6px;">
                <span>Total Admin Delivery Earned:</span>
                <strong style="color: #FDE68A;">₦${totalAdminDeliveryEarnings.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- 4-Way Financial Split Cards -->
        <div class="metrics-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 20px;">
          <div class="metric-card">
            <div class="metric-header">Customer Paid (GMV)</div>
            <div class="metric-value">₦${summary.total_gmv.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            <div class="metric-footer">Total marketplace gross volume</div>
          </div>
          <div class="metric-card">
            <div class="metric-header">Vendor Net Payouts</div>
            <div class="metric-value" style="color: var(--blue);">₦${summary.total_vendor_payouts.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            <div class="metric-footer">100% of product sales price</div>
          </div>
          <div class="metric-card">
            <div class="metric-header">Rider Earnings (Internal/Ext)</div>
            <div class="metric-value" style="color: var(--gold);">₦${summary.total_rider_earnings.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            <div class="metric-footer">Internal: ₦${summary.internal_rider_earnings.toLocaleString()} | Ext: ₦${summary.external_rider_commissions.toLocaleString()}</div>
          </div>
          <div class="metric-card">
            <div class="metric-header">Net Platform Revenue</div>
            <div class="metric-value" style="color: var(--emerald);">₦${summary.total_platform_revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            <div class="metric-footer">Total net revenue retained by Admin</div>
          </div>
        </div>

        <!-- Admin Wallet Live Transaction History -->
        ${admin_transactions.length > 0 ? `
          <div class="rp-card" style="margin-bottom: 20px;">
            <div class="rp-card-header">
              <div class="rp-card-title">📜 Admin Corporate Wallet Transaction History</div>
            </div>
            <div class="rp-table-container">
              <table class="rp-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Description</th>
                    <th>Running Balance</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  ${admin_transactions.slice(0, 10).map(t => `
                    <tr>
                      <td><code>${t.reference}</code></td>
                      <td><span class="badge ${t.type === 'CREDIT' ? 'badge-confirmed' : 'badge-cancelled'}">${t.type}</span></td>
                      <td><strong style="color: ${t.type === 'CREDIT' ? '#059669' : '#DC2626'};">${t.type === 'CREDIT' ? '+' : '-'}₦${t.amount.toLocaleString()}</strong></td>
                      <td style="font-size: 0.75rem;">${t.description}</td>
                      <td><strong>₦${t.running_balance.toLocaleString()}</strong></td>
                      <td style="font-size: 0.72rem; color: #64748B;">${new Date(t.created_at).toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Settlements Table -->
        <div class="rp-card">
          <div class="rp-card-header">
            <div class="rp-card-title">4-Way Settlement Journal</div>
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>Order Ref</th>
                  <th>Customer Paid</th>
                  <th>Vendor Net</th>
                  <th>Rider Split</th>
                  <th>Admin Retained</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${settlements.map(s => `
                  <tr>
                    <td><strong>${s.order_ref}</strong></td>
                    <td><strong>₦${s.total_customer_paid.toLocaleString()}</strong></td>
                    <td>₦${s.vendor_amount.toLocaleString()}</td>
                    <td>₦${s.rider_earnings.toLocaleString()} (${s.rider_type || 'INTERNAL'})</td>
                    <td style="color: var(--emerald); font-weight: 800;">₦${s.platform_revenue.toLocaleString()}</td>
                    <td><span class="badge badge-${s.status.toLowerCase()}">${s.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Delivery Zones Configuration Table -->
        <div class="rp-card">
          <div class="rp-card-header">
            <div class="rp-card-title">Configured Delivery Zones</div>
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>Zone Name</th>
                  <th>Base Fare</th>
                  <th>Per-KM Rate</th>
                  <th>Min Distance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${zones.map(z => `
                  <tr>
                    <td><strong>${z.name}</strong></td>
                    <td>₦${z.base_fee.toLocaleString()}</td>
                    <td>₦${z.per_km_rate.toLocaleString()} / km</td>
                    <td>${z.min_distance_km} km</td>
                    <td><span class="badge badge-active">Active</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  showAddZoneModal() {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 400px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">Create Delivery Zone</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="AdminPortal.handleCreateZone(event)">
          <div class="rp-form-group">
            <label class="rp-label">Zone Name</label>
            <input type="text" id="zone-name" class="rp-input" placeholder="e.g. Lagos Island / Victoria Island" required>
          </div>
          <div class="rp-form-group">
            <label class="rp-label">Base Fare (NGN)</label>
            <input type="number" id="zone-base" class="rp-input" value="1000" required>
          </div>
          <div class="rp-form-group">
            <label class="rp-label">Per-KM Rate (NGN)</label>
            <input type="number" id="zone-rate" class="rp-input" value="150" required>
          </div>
          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 10px;">
            Save Delivery Zone
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleCreateZone(e) {
    e.preventDefault();
    const name = document.getElementById("zone-name").value.trim();
    const base_fee = parseFloat(document.getElementById("zone-base").value);
    const per_km_rate = parseFloat(document.getElementById("zone-rate").value);

    try {
      await API.post("/api/finance/zones", { name, base_fee, per_km_rate });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(`Delivery zone '${name}' created!`, "success");
      this.render();
    } catch (e) {}
  },

  showAddExpenseModal() {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 400px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">Record Operational Expense</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="AdminPortal.handleCreateExpense(event)">
          <div class="rp-form-group">
            <label class="rp-label">Expense Title</label>
            <input type="text" id="exp-title" class="rp-input" placeholder="e.g. Fuel Subsidy for Fleet" required>
          </div>
          <div class="rp-form-group">
            <label class="rp-label">Category</label>
            <select id="exp-cat" class="rp-select">
              <option value="FUEL">Fuel & Rider Maintenance</option>
              <option value="TECH">Server & Cloud Hosting</option>
              <option value="SALARY">Staff Salaries</option>
              <option value="LOGISTICS">Packing & Dispatch Kits</option>
            </select>
          </div>
          <div class="rp-form-group">
            <label class="rp-label">Amount (NGN)</label>
            <input type="number" id="exp-amount" class="rp-input" placeholder="15000" required min="1">
          </div>
          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 10px;">
            Record Expense
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleCreateExpense(e) {
    e.preventDefault();
    const title = document.getElementById("exp-title").value.trim();
    const category = document.getElementById("exp-cat").value;
    const amount = parseFloat(document.getElementById("exp-amount").value);

    try {
      await API.post("/api/finance/expenses", { title, category, amount });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast("Expense recorded successfully", "success");
      this.render();
    } catch (e) {}
  },

  // ==========================================
  // MODULE 1: MANAGEMENT & RBAC
  // ==========================================
  async renderStaffRBAC() {
    let users = [];
    try {
      const res = await API.get("/api/admin/users", { silent: true });
      if (res && res.users) users = res.users;
    } catch (e) {}

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">Management Users & Role-Based Access Control (RBAC)</h1>
            <div class="admin-page-desc">Create operations managers, dispatchers, finance officers, and support staff</div>
          </div>
          <button onclick="AdminPortal.showCreateStaffModal()" class="btn-primary btn-sm">+ Create Staff Member</button>
        </div>

        <div class="rp-card">
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Email / Phone</th>
                  <th>Account Type</th>
                  <th>Assigned Role</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(u => `
                  <tr>
                    <td><strong>${u.full_name}</strong></td>
                    <td>${u.email}</td>
                    <td><span class="badge badge-assigned">${u.account_type}</span></td>
                    <td><strong>${u.role_name}</strong></td>
                    <td><span class="badge badge-${u.status.toLowerCase()}">${u.status}</span></td>
                    <td>
                      <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        <button onclick="AdminPortal.showResetUserPasswordModal('${u.id}', '${u.full_name}', '${u.email}', '${u.account_type}')" class="btn-secondary btn-sm" style="font-size:0.68rem;padding:3px 8px;color:var(--blood-primary);border-color:var(--blood-border);" title="Update this user's password individually">
                          🔑 Reset Password
                        </button>
                        ${u.account_type !== 'ADMIN' ? `
                          <button onclick="AdminPortal.toggleUserStatus('${u.id}', '${u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}')" class="btn-secondary btn-sm" style="font-size:0.68rem;padding:3px 8px;">
                            ${u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  showResetUserPasswordModal(userId, userName, userEmail, userRole) {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 400px; border-radius: 18px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">🔑 Admin: Reset User Password</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="background: #FFF5F5; border: 1px solid #FECACA; border-radius: 12px; padding: 12px; margin-bottom: 14px; font-size: 0.75rem;">
          <div style="font-weight: 800; color: #991B1B; margin-bottom: 2px;">Target Account:</div>
          <div>User: <strong>${userName}</strong> (${userRole})</div>
          <div>Email: <code>${userEmail}</code></div>
          <div style="font-size: 0.68rem; color: #7F1D1D; margin-top: 4px;">Update password in case of lost or forgotten credentials. The user will be able to log in immediately with the new password.</div>
        </div>

        <form onsubmit="AdminPortal.executeResetUserPassword(event, '${userId}')">
          <div class="rp-form-group">
            <label class="rp-label">New Password</label>
            <input type="password" id="adm-new-pwd-input" class="rp-input" placeholder="Minimum 6 characters" required minlength="6" value="rushing2026">
          </div>
          
          <div style="display:flex;gap:6px;margin-bottom:12px;">
            <button type="button" onclick="document.getElementById('adm-new-pwd-input').value = 'rp' + Math.floor(100000 + Math.random() * 900000); document.getElementById('adm-new-pwd-input').type = 'text';" class="btn-secondary btn-sm" style="font-size:0.7rem;padding:4px 8px;">
              🎲 Generate Random Password
            </button>
            <button type="button" onclick="const p = document.getElementById('adm-new-pwd-input'); p.type = p.type === 'password' ? 'text' : 'password';" class="btn-secondary btn-sm" style="font-size:0.7rem;padding:4px 8px;">
              👁️ Show / Hide
            </button>
          </div>

          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px; background: var(--blood-primary); font-weight: 800;">
            Update & Save Password 🔑
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async executeResetUserPassword(e, userId) {
    e.preventDefault();
    const new_password = document.getElementById("adm-new-pwd-input").value;
    if (!new_password || new_password.length < 6) {
      API.showToast("Password must be at least 6 characters", "error");
      return;
    }

    try {
      const res = await API.post(`/api/admin/users/${userId}/reset-password`, { new_password });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message || "Password updated successfully!", "success");
      this.render();
    } catch (err) {}
  },

  showCreateStaffModal() {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 420px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">Create Management Staff</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="AdminPortal.handleCreateStaff(event)">
          <div class="rp-form-group">
            <label class="rp-label">Full Name</label>
            <input type="text" id="staff-name" class="rp-input" placeholder="e.g. Ibrahim Danladi" required>
          </div>
          <div class="rp-form-group">
            <label class="rp-label">Email Address</label>
            <input type="email" id="staff-email" class="rp-input" placeholder="staff@rushingpoint.com" required>
          </div>
          <div class="rp-form-group">
            <label class="rp-label">Phone Number</label>
            <input type="tel" id="staff-phone" class="rp-input" placeholder="+2348000000000" required>
          </div>
          <div class="rp-form-group">
            <label class="rp-label">Assigned Role</label>
            <select id="staff-role" class="rp-select">
              <option value="Operations Manager">Operations Manager</option>
              <option value="Dispatcher">Dispatcher</option>
              <option value="Finance Officer">Finance Officer</option>
              <option value="Vendor Manager">Vendor Manager</option>
              <option value="Customer Support">Customer Support</option>
            </select>
          </div>
          <div class="rp-form-group">
            <label class="rp-label">Password</label>
            <input type="password" id="staff-pwd" class="rp-input" placeholder="Minimum 6 characters" required minlength="6">
          </div>
          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 10px;">
            Create Staff Account
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleCreateStaff(e) {
    e.preventDefault();
    const full_name = document.getElementById("staff-name").value.trim();
    const email = document.getElementById("staff-email").value.trim();
    const phone = document.getElementById("staff-phone").value.trim();
    const role_name = document.getElementById("staff-role").value;
    const password = document.getElementById("staff-pwd").value;

    try {
      await API.post("/api/admin/staff/create", { full_name, email, phone, role_name, password });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(`Staff account for ${full_name} created!`, "success");
      this.render();
    } catch (e) {}
  },

  async toggleUserStatus(userId, newStatus) {
    try {
      await API.post("/api/admin/users/status", { user_id: userId, status: newStatus });
      API.showToast(`User marked as ${newStatus}`, "success");
      this.render();
    } catch (e) {}
  },

  // ==========================================
  // MODULE 11: SUPPORT DESK
  // ==========================================
  async renderSupportDesk() {
    let tickets = [];
    try {
      const res = await API.get("/api/support/tickets", { silent: true });
      if (res && res.tickets) tickets = res.tickets;
    } catch (e) {}

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">Customer Support Help Desk</h1>
            <div class="admin-page-desc">Trackable resolution workflows for refunds, missing items and order disputes</div>
          </div>
        </div>

        <div class="rp-card">
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>Ticket Ref</th>
                  <th>Customer</th>
                  <th>Category</th>
                  <th>Subject</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${tickets.map(t => `
                  <tr>
                    <td><strong>${t.ticket_ref}</strong></td>
                    <td>${t.customer_name} (${t.customer_phone})</td>
                    <td><span class="badge badge-assigned">${t.category}</span></td>
                    <td>${t.subject}</td>
                    <td><span class="badge badge-pending">${t.priority}</span></td>
                    <td><span class="badge badge-${t.status.toLowerCase()}">${t.status}</span></td>
                    <td>
                      <button onclick="AdminPortal.resolveTicket('${t.id}')" class="btn-success btn-sm">Resolve</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  async resolveTicket(ticketId) {
    try {
      await API.put(`/api/support/tickets/${ticketId}`, { status: "RESOLVED" });
      API.showToast("Ticket marked as RESOLVED", "success");
      this.render();
    } catch (e) {}
  },

  // ==========================================
  // MODULE 13: AUDIT LOGS
  // ==========================================
  async renderAuditLogs() {
    let logs = [];
    try {
      const res = await API.get("/api/audit/", { silent: true });
      if (res && res.audit_logs) logs = res.audit_logs;
    } catch (e) {}

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">Immutable System Audit Logs</h1>
            <div class="admin-page-desc">Chronological cryptographic trace of all administrative, financial, and product actions</div>
          </div>
          <a href="/api/admin/export/audit" class="btn-secondary btn-sm" download>📥 Export Audit Log CSV</a>
        </div>

        <div class="rp-card">
          <div class="rp-table-container">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(l => `
                  <tr>
                    <td style="font-size: 0.72rem;">${new Date(l.created_at).toLocaleString()}</td>
                    <td><strong>${l.actor_name}</strong></td>
                    <td><span class="badge badge-confirmed">${l.actor_role}</span></td>
                    <td><code style="color: var(--blood-primary); font-weight: 700;">${l.action}</code></td>
                    <td>${l.resource_type}</td>
                    <td style="font-size: 0.72rem; color: var(--gray-600);">${l.details_json || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  // ==========================================
  // MODULE: SYSTEM SETTINGS (Modular General, Delivery & Payments)
  // ==========================================
  settingsSubTab: "general",

  async renderSettings() {
    let settings = {};
    try {
      const res = await API.get("/api/admin/settings", { silent: true });
      if (res && res.settings) settings = res.settings;
    } catch (e) {}

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">Platform System Settings</h1>
            <div class="admin-page-desc">Executive settings partitioned into General Corporate Info, Delivery Logistics Rules, and Payment & Commission Gateways</div>
          </div>
        </div>

        <!-- Sub-Navigation Tabs -->
        <div style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 2px solid var(--blood-border); padding-bottom: 8px; flex-wrap: wrap;">
          <button onclick="AdminPortal.settingsSubTab = 'general'; AdminPortal.render();" class="btn-${this.settingsSubTab === 'general' ? 'primary' : 'secondary'} btn-sm">
            🏢 General Information
          </button>
          <button onclick="AdminPortal.settingsSubTab = 'delivery'; AdminPortal.render();" class="btn-${this.settingsSubTab === 'delivery' ? 'primary' : 'secondary'} btn-sm">
            🛵 Delivery & Fleet Pricing
          </button>
          <button onclick="AdminPortal.settingsSubTab = 'payments'; AdminPortal.render();" class="btn-${this.settingsSubTab === 'payments' ? 'primary' : 'secondary'} btn-sm">
            💳 Payments & Commissions
          </button>
          <button onclick="AdminPortal.settingsSubTab = 'security'; AdminPortal.render();" class="btn-${this.settingsSubTab === 'security' ? 'primary' : 'secondary'} btn-sm" style="color: ${this.settingsSubTab === 'security' ? '#FFF' : '#DC2626'}; border-color: #FECACA;">
            🛡️ Security & Danger Zone ⚠️
          </button>
        </div>

        ${this.settingsSubTab === 'general' ? `
          <div class="rp-card" style="max-width: 600px;">
            <div class="rp-card-header">
              <div class="rp-card-title">🏢 General Corporate Information</div>
            </div>
            <form onsubmit="AdminPortal.handleSaveSettings(event)">
              <div class="rp-form-group">
                <label class="rp-label">Company / Brand Name</label>
                <input type="text" id="set-company" class="rp-input" value="RushingPoint Technologies Ltd">
              </div>
              <div class="rp-form-group">
                <label class="rp-label">Official Support Phone (WhatsApp Enabled)</label>
                <input type="tel" id="set-phone" class="rp-input" value="+2348077770000">
              </div>
              <div class="rp-form-group">
                <label class="rp-label">Official Support Email</label>
                <input type="email" id="set-email" class="rp-input" value="support@rushingpoint.com">
              </div>
              <div class="rp-form-group">
                <label class="rp-label">Physical Address</label>
                <input type="text" id="set-addr" class="rp-input" value="Plot 14, Commercial Avenue, Katsina / Lagos State, Nigeria">
              </div>
              <div class="rp-form-group">
                <label class="rp-label">Active Operating Cities & Hubs</label>
                <input type="text" id="set-cities" class="rp-input" value="Katsina, Lagos, Kano, Abuja">
              </div>
              <button type="submit" class="btn-primary" style="padding: 10px 20px;">Save General Settings</button>
            </form>
          </div>
        ` : ''}

        ${this.settingsSubTab === 'delivery' ? `
          <div class="rp-card" style="max-width: 600px;">
            <div class="rp-card-header">
              <div class="rp-card-title">🛵 Delivery Zones & Fleet Pricing</div>
            </div>
            <form onsubmit="AdminPortal.handleSaveSettings(event)">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="rp-form-group">
                  <label class="rp-label">Minimum Base Delivery Fee (NGN)</label>
                  <input type="number" id="set-base-fee" class="rp-input" value="${settings.base_delivery_fee || 1200}">
                </div>
                <div class="rp-form-group">
                  <label class="rp-label">Per-KM Distance Rate (NGN)</label>
                  <input type="number" id="set-per-km" class="rp-input" value="150">
                </div>
              </div>
              <div class="rp-form-group">
                <label class="rp-label">Heavy Cargo / Weight Surcharge Rate (Blocks / Cement / Steel)</label>
                <input type="text" id="set-heavy" class="rp-input" value="5% of material value or ₦2,500 flat">
              </div>
              <div class="rp-form-group">
                <label class="rp-label">Rider Commission Split for External Partners (%)</label>
                <input type="number" id="set-rider-split" class="rp-input" value="${settings.rider_delivery_fee_split || 80}">
                <div style="font-size: 0.7rem; color: var(--gray-500); margin-top: 3px;">Internal company riders are compensated directly with 100% transport retained in Admin revenue.</div>
              </div>
              <button type="submit" class="btn-primary" style="padding: 10px 20px;">Save Delivery Rules</button>
            </form>
          </div>
        ` : ''}

        ${this.settingsSubTab === 'payments' ? `
          <div class="rp-card" style="max-width: 650px;">
            <div class="rp-card-header">
              <div class="rp-card-title">💳 Flutterwave Gateway & Commission Settings</div>
              <span class="badge badge-active" style="background:#EA580C;color:#FFF;">Flutterwave v3 API</span>
            </div>

            <!-- Flutterwave Live/Sandbox Credentials Section -->
            <form onsubmit="AdminPortal.handleSavePaymentSettings(event)">
              <div style="background: #FFF7ED; border: 1px solid #FFEDD5; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
                <div style="font-weight: 900; font-size: 0.85rem; color: #9A3412; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                  <span>⚡ Flutterwave API Keys Configuration</span>
                </div>
                <div style="font-size: 0.72rem; color: #7C2D12; margin-bottom: 12px;">
                  Enter your real or test Flutterwave API credentials from your <a href="https://dashboard.flutterwave.com" target="_blank" style="color:#C2410C;font-weight:700;text-decoration:underline;">Flutterwave Dashboard</a>.
                </div>

                <div class="rp-form-group">
                  <label class="rp-label">Gateway Environment Mode</label>
                  <select id="flw-mode" class="rp-select" style="font-weight:700;">
                    <option value="TEST" ${settings.flutterwave_mode === 'TEST' ? 'selected' : ''}>🧪 TEST / Sandbox Mode (Safe Simulation & Test Cards)</option>
                    <option value="LIVE" ${settings.flutterwave_mode === 'LIVE' ? 'selected' : ''}>🟢 LIVE Mode (Real Bank Cards, Transfers, USSD)</option>
                  </select>
                </div>

                <div class="rp-form-group">
                  <label class="rp-label">Public Key (FLWPUBK...)</label>
                  <input type="text" id="flw-pub-key" class="rp-input" placeholder="e.g. FLWPUBK_TEST-xxxxxxxxxxxx-X or FLWPUBK-xxxxxxxxxxxx-X" value="${settings.flutterwave_public_key || ''}" style="font-family:monospace;font-size:0.8rem;">
                </div>

                <div class="rp-form-group">
                  <label class="rp-label">Secret Key (FLWSECK...)</label>
                  <input type="password" id="flw-sec-key" class="rp-input" placeholder="e.g. FLWSECK_TEST-xxxxxxxxxxxx-X or FLWSECK-xxxxxxxxxxxx-X" value="${settings.flutterwave_secret_key || ''}" style="font-family:monospace;font-size:0.8rem;">
                </div>

                <div class="rp-form-group">
                  <label class="rp-label">Encryption Key (Optional)</label>
                  <input type="password" id="flw-enc-key" class="rp-input" placeholder="e.g. FLWSECK_xxxxxxxxxxxx" value="${settings.flutterwave_encryption_key || ''}" style="font-family:monospace;font-size:0.8rem;">
                </div>

                <div class="rp-form-group">
                  <label class="rp-label">Webhook Secret Hash (Optional)</label>
                  <input type="text" id="flw-webhook-secret" class="rp-input" placeholder="e.g. rushingpoint_flw_secret_hash" value="${settings.flutterwave_webhook_secret || 'rushingpoint_secret_2026'}" style="font-size:0.8rem;">
                </div>

                <div style="display:flex;gap:8px;margin-top:10px;">
                  <button type="button" onclick="AdminPortal.testFlutterwaveConnection()" class="btn-secondary btn-sm" style="background:#FFF;border-color:#EA580C;color:#EA580C;font-weight:800;padding:8px 14px;">
                    📡 Test Flutterwave API Connection
                  </button>
                  <span id="flw-test-status" style="font-size:0.75rem;font-weight:700;display:flex;align-items:center;"></span>
                </div>
              </div>

              <!-- General Platform Commission Rules -->
              <div class="rp-form-group">
                <label class="rp-label">Platform Customer Service Escrow Fee (NGN)</label>
                <input type="number" id="set-platform-fee" class="rp-input" value="${settings.platform_service_fee || 150}">
              </div>

              <div class="rp-form-group">
                <label class="rp-label">Vendor Product Price Protection Rule</label>
                <input type="text" class="rp-input" value="100% of assigned product price to Vendor (0% deducted)" readonly style="background: var(--gray-100); font-weight: 700; color: var(--emerald);">
              </div>

              <button type="submit" class="btn-primary" style="padding: 11px 24px; font-weight: 800; background: #EA580C;">
                Save Flutterwave & Payment Settings 💾
              </button>
            </form>
          </div>
        ` : ''}

        ${this.settingsSubTab === 'security' ? `
          <div style="display: flex; flex-direction: column; gap: 16px; max-width: 680px;">
            <!-- Master PIN Security Card -->
            <div class="rp-card">
              <div class="rp-card-header">
                <div class="rp-card-title">🔐 Master Security PIN Control</div>
                <span class="badge badge-active">6-Digit Protection</span>
              </div>
              <p style="font-size: 0.78rem; color: var(--gray-600); margin-bottom: 12px;">
                The Master Security PIN protects critical administrative actions such as system wipes, financial ledger resets, and bulk security operations. Default PIN: <code>889900</code>.
              </p>
              <form onsubmit="AdminPortal.handleUpdateSecurityPin(event)">
                <div class="rp-form-group">
                  <label class="rp-label">Current Admin Password</label>
                  <input type="password" id="pin-admin-pwd" class="rp-input" placeholder="Enter your password to verify" required>
                </div>
                <div class="rp-form-group">
                  <label class="rp-label">New 6-Digit Master Security PIN</label>
                  <input type="password" id="pin-new-pin" class="rp-input" placeholder="6-digit numeric PIN (e.g. 889900)" maxlength="6" pattern="[0-9]{6}" required style="letter-spacing: 4px; font-weight: 900; font-size: 1.1rem; max-width: 240px;">
                </div>
                <button type="submit" class="btn-primary btn-sm" style="font-weight: 800; padding: 9px 18px;">
                  Update Master Security PIN 🔒
                </button>
              </form>
            </div>

            <!-- Danger Zone: Factory Reset & Master Data Purge -->
            <div class="rp-card" style="border: 2px solid #DC2626; background: #FFF5F5;">
              <div class="rp-card-header" style="border-bottom: 1px solid #FECACA;">
                <div class="rp-card-title" style="color: #991B1B;">⚠️ Danger Zone: Master Data Purge (Factory Reset)</div>
                <span class="badge badge-cancelled" style="background: #DC2626; color: #FFF;">IRREVERSIBLE</span>
              </div>
              <div style="padding: 10px 0;">
                <p style="font-size: 0.8rem; color: #7F1D1D; line-height: 1.5; margin-bottom: 12px;">
                  <strong>Production Transition Tool:</strong> This action will permanently delete all non-admin user accounts, customer records, merchant storefronts, catalog products, orders, delivery dispatches, and support tickets from the database.
                </p>
                <div style="background: #FEF2F2; border: 1px solid #F87171; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.75rem; color: #991B1B;">
                  🛡️ <strong>Safety Guarantee:</strong> Your Master Admin login account, corporate settings, and system configurations will be <strong>100% preserved</strong>.
                </div>
                <button onclick="AdminPortal.showPurgeDataModal()" class="btn-danger" style="padding: 11px 22px; font-weight: 900; border-radius: 10px;">
                  🗑️ Purge All User Data & Credentials
                </button>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  showPurgeDataModal() {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 480px; border: 2px solid #DC2626; border-radius: 20px;">
        <div class="modal-header" style="border-bottom: 1px solid #FECACA;">
          <h3 style="font-size: 1.1rem; font-weight: 900; color: #991B1B;">⚠️ Master Data Purge Verification</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 12px; margin-bottom: 14px; font-size: 0.78rem; color: #7F1D1D;">
          <strong>Warning:</strong> You are about to clear all non-admin users, orders, products, and customer credentials. This action cannot be undone.
        </div>

        <form onsubmit="AdminPortal.handleExecuteDataPurge(event)">
          <div class="rp-form-group">
            <label class="rp-label">Enter Admin Password *</label>
            <input type="password" id="purge-admin-pwd" class="rp-input" placeholder="Your current admin password" required>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Enter 6-Digit Master Security PIN *</label>
            <input type="password" id="purge-security-pin" class="rp-input" placeholder="6-digit PIN (default: 889900)" maxlength="6" pattern="[0-9]{6}" required style="letter-spacing: 4px; font-weight: 900; font-size: 1.1rem;">
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Type <code style="color:#B91C1C;">CONFIRM PURGE ALL NON-ADMIN DATA</code> below to verify: *</label>
            <input type="text" id="purge-confirm-text" class="rp-input" placeholder="CONFIRM PURGE ALL NON-ADMIN DATA" required style="font-family:monospace;font-weight:700;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px;">
            <button type="button" onclick="this.closest('.modal-backdrop').remove()" class="btn-secondary" style="justify-content: center; padding: 10px; border-radius: 10px;">
              Cancel / Abort
            </button>
            <button type="submit" class="btn-danger" style="justify-content: center; padding: 10px; border-radius: 10px; font-weight: 900; background: #DC2626;">
              Execute Purge 💥
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleUpdateSecurityPin(e) {
    e.preventDefault();
    const admin_password = document.getElementById("pin-admin-pwd")?.value;
    const new_pin = document.getElementById("pin-new-pin")?.value.trim();

    try {
      const res = await API.post("/api/admin/system/security-pin", { admin_password, new_pin });
      API.showToast(res.message, "success");
      this.render();
    } catch (err) {}
  },

  async handleExecuteDataPurge(e) {
    e.preventDefault();
    const admin_password = document.getElementById("purge-admin-pwd")?.value;
    const security_pin = document.getElementById("purge-security-pin")?.value.trim();
    const confirmation_text = document.getElementById("purge-confirm-text")?.value.trim();

    if (confirmation_text !== "CONFIRM PURGE ALL NON-ADMIN DATA") {
      API.showToast("Confirmation phrase does not match exactly.", "error");
      return;
    }

    try {
      const res = await API.post("/api/admin/system/purge-all-data", {
        admin_password, security_pin, confirmation_text
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message, "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (err) {}
  },

  async testFlutterwaveConnection() {
    const public_key = document.getElementById("flw-pub-key")?.value.trim();
    const secret_key = document.getElementById("flw-sec-key")?.value.trim();
    const mode = document.getElementById("flw-mode")?.value;
    const statusEl = document.getElementById("flw-test-status");

    if (!public_key || !secret_key) {
      API.showToast("Please enter both Public Key and Secret Key to test connection", "error");
      return;
    }

    if (statusEl) statusEl.innerHTML = `<span style="color:#C2410C;">⏳ Testing API keys...</span>`;

    try {
      const res = await API.post("/api/admin/flutterwave/test-connection", {
        public_key, secret_key, mode
      });
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:#059669;">✅ ${res.message}</span>`;
      }
      API.showToast(res.message, "success");
    } catch (e) {
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:#DC2626;">❌ Connection test failed</span>`;
      }
    }
  },

  async handleSavePaymentSettings(e) {
    e.preventDefault();
    const flutterwave_mode = document.getElementById("flw-mode")?.value;
    const flutterwave_public_key = document.getElementById("flw-pub-key")?.value.trim();
    const flutterwave_secret_key = document.getElementById("flw-sec-key")?.value.trim();
    const flutterwave_encryption_key = document.getElementById("flw-enc-key")?.value.trim();
    const flutterwave_webhook_secret = document.getElementById("flw-webhook-secret")?.value.trim();
    const platform_service_fee = document.getElementById("set-platform-fee")?.value;

    try {
      await API.post("/api/admin/settings", {
        settings: {
          flutterwave_mode: flutterwave_mode || "TEST",
          flutterwave_public_key: flutterwave_public_key || "",
          flutterwave_secret_key: flutterwave_secret_key || "",
          flutterwave_encryption_key: flutterwave_encryption_key || "",
          flutterwave_webhook_secret: flutterwave_webhook_secret || "",
          platform_service_fee: platform_service_fee || "150"
        }
      });
      API.showToast("Flutterwave API credentials & payment settings saved successfully!", "success");
      this.render();
    } catch (e) {}
  },

  async handleSaveSettings(e) {
    e.preventDefault();
    const base_delivery_fee = document.getElementById("set-base-fee")?.value;
    const rider_delivery_fee_split = document.getElementById("set-rider-split")?.value;

    try {
      await API.post("/api/admin/settings", {
        settings: {
          base_delivery_fee: base_delivery_fee || "1200",
          rider_delivery_fee_split: rider_delivery_fee_split || "80"
        }
      });
      API.showToast("System settings updated successfully", "success");
      this.render();
    } catch (e) {}
  },

  // ==========================================
  // ROLE MODULE: DISPATCHER — Live Order Queue & Assignment
  // ==========================================
  async renderDispatcherModule() {
    let orders = [];
    let riders = [];
    let callSetting = { allow_customer_call_rider: false };
    try {
      const oRes = await API.get("/api/orders/", { silent: true });
      if (oRes && oRes.orders) orders = oRes.orders;
      const rRes = await API.get("/api/riders/live-map", { silent: true });
      if (rRes && rRes.riders) riders = rRes.riders;
      const cRes = await API.get("/api/dispatch/customer-call-setting", { silent: true });
      if (cRes) callSetting = cRes;
    } catch (e) {}

    const isCallAllowed = Boolean(callSetting.allow_customer_call_rider);
    const pendingOrders = orders.filter(o => ['NEW', 'CONFIRMED'].includes(o.status));
    const activeOrders = orders.filter(o => ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'].includes(o.status));
    const deliveredToday = orders.filter(o => o.status === 'DELIVERED');
    const cancelledOrders = orders.filter(o => o.status === 'CANCELLED_REFUNDED');

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">🛵 Dispatcher — Live Order Queue & Assignment</h1>
            <div class="admin-page-desc">Receive, assign, reassign and track all orders in real-time. Automatic nearest-rider matching enabled.</div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${pendingOrders.length > 0 ? `
              <button onclick="AdminPortal.autoAssignAllPending()" class="btn-primary btn-sm" style="background: #059669; font-weight: 800; display: flex; align-items: center; gap: 4px;" title="Automatically pair every pending order with the nearest available courier">
                ⚡ Auto-Assign All (${pendingOrders.length})
              </button>
            ` : ''}
            <button onclick="AdminPortal.render()" class="btn-secondary btn-sm">🔄 Refresh</button>
            <button onclick="AdminPortal.switchTab('dispatch')" class="btn-primary btn-sm">📡 Open Fleet Map</button>
          </div>
        </div>

        <!-- Dispatch Privacy & Customer Communication Policy Control Bar -->
        <div class="rp-card" style="margin-bottom: 16px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; background: ${isCallAllowed ? '#FFFBEB' : '#F0FDF4'}; border: 1.5px solid ${isCallAllowed ? '#FCD34D' : '#BBF7D0'};">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.3rem;">${isCallAllowed ? '⚠️' : '🛡️'}</span>
            <div>
              <div style="font-size: 0.82rem; font-weight: 800; color: #1E293B; display: flex; align-items: center; gap: 6px;">
                <span>Customer Direct Courier Call:</span>
                <span class="badge" style="background: ${isCallAllowed ? '#D97706' : '#059669'}; color: #FFF; font-size: 0.62rem; padding: 2px 6px;">
                  ${isCallAllowed ? '🟢 ENABLED (High Workload Overload Mode)' : '🔒 RESTRICTED (Default — Dispatch Support Handles Calls)'}
                </span>
              </div>
              <div style="font-size: 0.68rem; color: #64748B; margin-top: 2px;">
                ${isCallAllowed ? 'Customers can call couriers directly. Turn OFF once order rush subsides.' : 'Customers contact RushPoint Dispatch Support only. Couriers can drive safely without phone interruptions.'}
              </div>
            </div>
          </div>
          <button onclick="AdminPortal.toggleCustomerCallPolicy(${!isCallAllowed})" class="btn-secondary btn-sm" style="font-size: 0.72rem; font-weight: 800; white-space: nowrap; border-color: ${isCallAllowed ? '#B45309' : '#059669'}; color: ${isCallAllowed ? '#B45309' : '#059669'};">
            ${isCallAllowed ? '🔒 Restore Privacy (Default)' : '⚡ Enable Direct Calling'}
          </button>
        </div>

        <!-- Status KPI Bar -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
          <div class="metric-card" style="border-left: 4px solid var(--amber); padding: 12px;">
            <div class="metric-header">⏳ Pending Assignment</div>
            <div class="metric-value" style="font-size: 1.6rem; color: var(--amber);">${pendingOrders.length}</div>
            <div class="metric-footer">Awaiting rider dispatch</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid #2563EB; padding: 12px;">
            <div class="metric-header">🛵 Active Deliveries</div>
            <div class="metric-value" style="font-size: 1.6rem; color: #2563EB;">${activeOrders.length}</div>
            <div class="metric-footer">Currently in transit</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid var(--emerald); padding: 12px;">
            <div class="metric-header">✅ Delivered Today</div>
            <div class="metric-value" style="font-size: 1.6rem; color: var(--emerald);">${deliveredToday.length}</div>
            <div class="metric-footer">OTP verified & closed</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid var(--gray-400); padding: 12px;">
            <div class="metric-header">❌ Cancelled</div>
            <div class="metric-value" style="font-size: 1.6rem; color: var(--gray-500);">${cancelledOrders.length}</div>
            <div class="metric-footer">Refunded orders</div>
          </div>
        </div>

        <!-- Available Riders Quick Bar -->
        <div class="rp-card" style="margin-bottom: 20px; padding: 12px 14px;">
          <div style="font-size: 0.85rem; font-weight: 800; color: var(--blood-dark); margin-bottom: 8px;">🟢 Available Fleet (${riders.filter(r => r.operational_status === 'AVAILABLE').length} of ${riders.length})</div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${riders.map(r => `
              <div style="background: ${r.operational_status === 'AVAILABLE' ? '#ECFDF5' : '#F9FAFB'}; border: 1px solid ${r.operational_status === 'AVAILABLE' ? '#6EE7B7' : 'var(--gray-200)'}; border-radius: 8px; padding: 6px 10px; display: flex; align-items: center; gap: 6px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${r.operational_status === 'AVAILABLE' ? 'var(--emerald)' : 'var(--gray-400)'}; flex-shrink: 0;"></span>
                <div>
                  <div style="font-size: 0.75rem; font-weight: 800; color: var(--blood-dark);">${r.full_name}</div>
                  <div style="font-size: 0.65rem; color: var(--gray-500);">${r.rider_type} • ${r.vehicle_type}</div>
                </div>
                <a href="https://wa.me/${(r.phone || '').replace(/[^0-9]/g, '')}?text=Hello%20${encodeURIComponent(r.full_name)}%2C%20RushingPoint%20Dispatch%20update" target="_blank" style="background: #25D366; color: #FFF; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-decoration: none;">WA</a>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Pending Orders for Assignment -->
        <div class="rp-card" style="margin-bottom: 20px;">
          <div class="rp-card-header">
            <div class="rp-card-title" style="color: var(--amber);">⏳ Orders Awaiting Rider Assignment (${pendingOrders.length})</div>
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead><tr>
                <th>Order Ref</th><th>Customer</th><th>Vendor Store</th>
                <th>Total</th><th>Delivery Address</th><th>OTP</th><th>Assign Rider</th>
              </tr></thead>
              <tbody>
                ${pendingOrders.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--gray-500);">No pending orders — all caught up! 🎉</td></tr>' :
                  pendingOrders.map(o => `
                    <tr>
                      <td><strong style="color: var(--blood-primary);">${o.order_ref}</strong></td>
                      <td>
                        <div>${o.customer_name}</div>
                        <a href="https://wa.me/${(o.customer_phone||'').replace(/[^0-9]/g,'')}?text=Hello%2C%20your%20RushingPoint%20order%20${o.order_ref}%20is%20being%20processed" target="_blank" style="font-size:0.65rem;color:#25D366;font-weight:700;text-decoration:none;">💬 WhatsApp</a>
                      </td>
                      <td><strong>${o.store_name}</strong></td>
                      <td><strong>₦${o.total_amount.toLocaleString()}</strong></td>
                      <td style="font-size:0.75rem;">${o.delivery_address}</td>
                      <td><code style="background:var(--blood-tint);color:var(--blood-primary);padding:2px 6px;border-radius:4px;font-weight:900;">${o.pod_otp || 'N/A'}</code></td>
                      <td style="display:flex;gap:4px;flex-wrap:wrap;">
                        <button onclick="AdminPortal.autoAssignNearestOrder('${o.id}')" class="btn-primary btn-sm" style="background:#059669; font-size:0.68rem; padding:4px 8px;" title="Auto-match nearest courier by vendor GPS">⚡ Auto</button>
                        <button onclick="AdminPortal.showDispatchModal('${o.id}', '${o.order_ref}')" class="btn-primary btn-sm" style="font-size:0.68rem; padding:4px 8px;">Assign</button>
                        <button onclick="AdminPortal.showSimDispatchModal('${o.id}', '${o.order_ref}')" class="btn-secondary btn-sm" style="background:#8B5CF6;color:#FFF; font-size:0.68rem; padding:4px 8px;">📱 SIM</button>
                        <button onclick="AdminPortal.showRefundModal('${o.id}', '${o.order_ref}', ${o.total_amount})" class="btn-danger btn-sm" style="font-size:0.68rem; padding:4px 8px;">💸 Refund</button>
                      </td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Active Orders in Transit -->
        <div class="rp-card">
          <div class="rp-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div class="rp-card-title" style="color:#2563EB;">🛵 Orders In Transit & Active Missions (${activeOrders.length})</div>
            ${activeOrders.length > 0 ? `
              <button onclick="AdminPortal.bulkConfirmActiveDeliveries()" class="btn-primary btn-sm" style="background: #059669; font-weight: 800; font-size: 0.72rem; padding: 5px 12px; border-radius: 8px;" title="Approve and verify all active deliveries at once — releases funds to couriers">
                ⚡ Bulk Verify Deliveries (${activeOrders.length})
              </button>
            ` : ''}
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead><tr>
                <th>Order Ref</th><th>Customer</th><th>Rider</th><th>Status</th><th>Total</th><th>OTP</th><th>Action</th>
              </tr></thead>
              <tbody>
                ${activeOrders.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--gray-500);">No active deliveries right now.</td></tr>' :
                  activeOrders.map(o => `
                    <tr>
                      <td><strong>${o.order_ref}</strong></td>
                      <td>
                        <div>${o.customer_name}</div>
                        ${o.customer_phone ? `<a href="tel:${o.customer_phone}" style="font-size:0.63rem;color:#2563EB;font-weight:700;text-decoration:none;">📞 ${o.customer_phone}</a>` : ''}
                      </td>
                      <td>
                        <div style="display:flex;flex-direction:column;gap:2px;">
                          <strong>${o.rider_ref || o.rider_name || '—'}</strong>
                          ${o.rider_phone ? `<a href="tel:${o.rider_phone}" style="font-size:0.63rem;color:#2563EB;font-weight:700;text-decoration:none;">📞 Call Rider</a>` : ''}
                        </div>
                      </td>
                      <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
                      <td><strong>₦${o.total_amount.toLocaleString()}</strong></td>
                      <td><code style="background:var(--blood-tint);color:var(--blood-primary);padding:2px 6px;border-radius:4px;font-weight:900;">${o.pod_otp || 'N/A'}</code></td>
                      <td style="display:flex;gap:4px;flex-wrap:wrap;">
                        <button onclick="AdminPortal.viewOrderTimeline('${o.id}')" class="btn-secondary btn-sm">📋 Timeline</button>
                        <button onclick="AdminPortal.showDispatchModal('${o.id}', '${o.order_ref}')" class="btn-secondary btn-sm">🔄 Reassign</button>
                        ${o.rider_phone ? `<button onclick="AdminPortal.showSimDispatchModal('${o.id}','${o.order_ref}')" class="btn-secondary btn-sm" style="background:#8B5CF6;color:#FFF;border-color:#8B5CF6;">📟 SIM</button>` : ''}
                        <button onclick="AdminPortal.adminConfirmDelivery('${o.id}', '${o.order_ref}')" class="btn-primary btn-sm" style="background:#059669;font-size:0.65rem;padding:4px 8px;" title="Confirm delivery on behalf of rider phone call — releases commission">
                          📞 Confirm Delivery
                        </button>
                      </td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  // ==========================================
  // ROLE MODULE: OPERATIONS MANAGER — Fleet, Shift Control, KPIs
  // ==========================================
  async renderOperationsManager() {
    let riders = [];
    let orders = [];
    try {
      const rRes = await API.get("/api/riders/live-map", { silent: true });
      if (rRes && rRes.riders) riders = rRes.riders;
      const oRes = await API.get("/api/orders/", { silent: true });
      if (oRes && oRes.orders) orders = oRes.orders;
    } catch (e) {}

    const internalRiders = riders.filter(r => r.rider_type === 'INTERNAL');
    const externalRiders = riders.filter(r => r.rider_type === 'EXTERNAL_PARTNER');
    const available = riders.filter(r => r.operational_status === 'AVAILABLE');
    const onDelivery = riders.filter(r => ['ON_DELIVERY', 'APPROACHING_PICKUP'].includes(r.operational_status));
    const offline = riders.filter(r => r.operational_status === 'OFFLINE');

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">⚙️ Operations Manager — Fleet Control & Performance</h1>
            <div class="admin-page-desc">Manage internal/external rider fleet, shift status, zone performance and daily operational KPIs.</div>
          </div>
          <button onclick="AdminPortal.render()" class="btn-secondary btn-sm">🔄 Refresh</button>
        </div>

        <!-- Fleet Overview KPIs -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
          <div class="metric-card" style="border-left: 4px solid var(--emerald);">
            <div class="metric-header">🟢 Available</div>
            <div class="metric-value" style="color: var(--emerald);">${available.length}</div>
            <div class="metric-footer">Ready for dispatch</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid #2563EB;">
            <div class="metric-header">🛵 On Delivery</div>
            <div class="metric-value" style="color: #2563EB;">${onDelivery.length}</div>
            <div class="metric-footer">Currently active</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid var(--gray-400);">
            <div class="metric-header">⚪ Offline</div>
            <div class="metric-value" style="color: var(--gray-500);">${offline.length}</div>
            <div class="metric-footer">Off shift / unavailable</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid var(--blood-primary);">
            <div class="metric-header">📦 Total Fleet</div>
            <div class="metric-value">${riders.length}</div>
            <div class="metric-footer">${internalRiders.length} Internal • ${externalRiders.length} Partner</div>
          </div>
        </div>

        <!-- Fleet Registry Table -->
        <div class="rp-card" style="margin-bottom: 20px;">
          <div class="rp-card-header">
            <div class="rp-card-title">🛵 Full Fleet Registry & Shift Management</div>
            <button onclick="AdminPortal.switchTab('invites')" class="btn-primary btn-sm">+ Onboard New Rider</button>
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead><tr>
                <th>Rider / Ref</th><th>Type</th><th>Vehicle</th><th>Plate</th><th>Rating</th>
                <th>Trips</th><th>Status</th><th>Contact</th><th>Payout</th>
              </tr></thead>
              <tbody>
                ${riders.map(r => {
                  const vtype = (r.vehicle_type || 'MOTORCYCLE').toUpperCase();
                  const isTricycle = vtype.includes('TRICYCLE') || vtype.includes('KEKE');
                  const vehicleIcon = isTricycle ? '🛺' : (vtype === 'VAN' ? '🚐' : '🛵');
                  const isOffline = r.operational_status === 'OFFLINE';
                  const walletBalance = r.wallet_balance || 0;
                  return `
                  <tr style="${isOffline ? 'background:#F9FAFB;' : ''}">
                    <td>
                      <div style="font-weight:800;color:var(--blood-dark);">${r.full_name}</div>
                      <div style="font-size:0.7rem;color:var(--gray-500);">${r.rider_ref}</div>
                      ${isOffline ? `<div style="font-size:0.65rem;color:#4B5563;margin-top:2px;">📵 Feature Phone Rider</div>` : ''}
                    </td>
                    <td><span class="badge ${r.rider_type === 'INTERNAL' ? 'badge-confirmed' : 'badge-assigned'}">${r.rider_type === 'INTERNAL' ? '🏢 Internal' : '🤝 Partner'}</span></td>
                    <td>${vehicleIcon} ${r.vehicle_type}</td>
                    <td><code>${r.plate_number}</code></td>
                    <td>⭐ ${r.rating || '5.0'}</td>
                    <td>${r.total_deliveries || 0}</td>
                    <td>
                      <span class="badge badge-${r.operational_status === 'AVAILABLE' ? 'active' : r.operational_status === 'OFFLINE' ? 'cancelled' : 'pending'}">${r.operational_status}</span>
                    </td>
                    <td>
                      <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        ${r.phone ? `<a href="tel:${r.phone}" class="btn-secondary btn-sm" style="font-size:0.63rem;padding:2px 6px;text-decoration:none;">📞 Call</a>` : ''}
                        <a href="https://wa.me/${(r.phone || '').replace(/[^0-9]/g,'')}?text=Hello%20${encodeURIComponent(r.full_name)}%2C%20RushingPoint%20Operations" target="_blank" class="btn-whatsapp btn-sm" style="text-decoration:none;font-size:0.63rem;padding:2px 6px;">💬 WA</a>
                      </div>
                    </td>
                    <td>
                      <div style="font-size:0.68rem;font-weight:700;color:#059669;">₦${walletBalance.toLocaleString()}</div>
                      <div style="display:flex;gap:4px;margin-top:2px;">
                        <button onclick="AdminPortal.showAdminWithdrawRiderModal('${r.id}', '${r.full_name}', ${walletBalance})" class="btn-secondary btn-sm" style="font-size:0.6rem;padding:2px 6px;white-space:nowrap;">
                          💸 Disburse
                        </button>
                        <button onclick="AdminPortal.showEditRiderModal('${r.id}')" class="btn-secondary btn-sm" style="font-size:0.6rem;padding:2px 6px;font-weight:800;" title="Edit rider profile & vehicle info">
                          ✏️ Edit
                        </button>
                        <button onclick="AdminPortal.showResetUserPasswordModal('${r.user_id}', '${r.full_name}', '${r.phone || r.rider_ref}', 'RIDER')" class="btn-secondary btn-sm" style="font-size:0.6rem;padding:2px 6px;color:var(--blood-primary);border-color:var(--blood-border);" title="Reset this rider's password individually">
                          🔑 Pwd
                        </button>
                      </div>
                    </td>
                  </tr>
                `}).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Zone Performance -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="rp-card">
            <div class="rp-card-header">
              <div class="rp-card-title">🏢 Internal Riders (Company Fleet)</div>
            </div>
            <div style="padding: 4px 0;">
              ${internalRiders.length === 0 ? '<div style="padding:16px;color:var(--gray-500);font-size:0.8rem;">No internal riders configured.</div>' :
                internalRiders.map(r => `
                  <div style="padding:10px;border-bottom:1px solid var(--gray-100);display:flex;justify-content:space-between;align-items:center;">
                    <div>
                      <div style="font-weight:700;font-size:0.82rem;">${r.full_name}</div>
                      <div style="font-size:0.7rem;color:var(--gray-500);">${r.vehicle_type} • ${r.plate_number}</div>
                    </div>
                    <span class="badge badge-${r.operational_status === 'AVAILABLE' ? 'active' : 'pending'}">${r.operational_status}</span>
                  </div>
                `).join('')}
              <div style="padding: 10px; font-size: 0.72rem; color: var(--gray-500); background: var(--gray-50);">
                💡 Delivery fees from internal riders go 100% to Admin Revenue (company asset)
              </div>
            </div>
          </div>
          <div class="rp-card">
            <div class="rp-card-header">
              <div class="rp-card-title">🤝 External Partner Riders</div>
            </div>
            <div style="padding: 4px 0;">
              ${externalRiders.length === 0 ? '<div style="padding:16px;color:var(--gray-500);font-size:0.8rem;">No external partners yet.</div>' :
                externalRiders.map(r => `
                  <div style="padding:10px;border-bottom:1px solid var(--gray-100);display:flex;justify-content:space-between;align-items:center;">
                    <div>
                      <div style="font-weight:700;font-size:0.82rem;">${r.full_name}</div>
                      <div style="font-size:0.7rem;color:var(--gray-500);">${r.vehicle_type} • ${r.plate_number}</div>
                    </div>
                    <span class="badge badge-${r.operational_status === 'AVAILABLE' ? 'active' : 'pending'}">${r.operational_status}</span>
                  </div>
                `).join('')}
              <div style="padding: 10px; font-size: 0.72rem; color: var(--gray-500); background: var(--gray-50);">
                💡 External riders earn configured commission % per delivery (default: 80%). Go to Settings → Delivery to change.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // ==========================================
  // ROLE MODULE: VENDOR MANAGER — Vendor Profiles, KYC, Store Toggle
  // ==========================================
  async renderVendorManager() {
    let vendors = [];
    try {
      const res = await API.get("/api/vendors/", { silent: true });
      if (res && res.vendors) vendors = res.vendors;
    } catch (e) {}

    const approved = vendors.filter(v => v.kyc_status === 'APPROVED');
    const pending = vendors.filter(v => v.kyc_status === 'PENDING_KYC' || v.kyc_status === 'UNDER_REVIEW');
    const rejected = vendors.filter(v => v.kyc_status === 'REJECTED');

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">🏪 Vendor Manager — Profiles, KYC & Store Activation</h1>
            <div class="admin-page-desc">Full vendor lifecycle — onboard, review documents, approve/reject stores, manage products and contact via WhatsApp.</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button onclick="AdminPortal.switchTab('invites')" class="btn-secondary btn-sm">⏱️ Generate Vendor Invite</button>
            <a href="/api/admin/export/vendors" class="btn-secondary btn-sm" download>📥 Export CSV</a>
          </div>
        </div>

        <!-- KYC Pipeline Summary -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
          <div class="metric-card" style="border-left: 4px solid var(--emerald);">
            <div class="metric-header">✅ Approved & Active</div>
            <div class="metric-value" style="color:var(--emerald);">${approved.length}</div>
            <div class="metric-footer">Selling on marketplace</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid var(--amber);">
            <div class="metric-header">⏳ Pending KYC Review</div>
            <div class="metric-value" style="color:var(--amber);">${pending.length}</div>
            <div class="metric-footer">Documents under review</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid #EF4444;">
            <div class="metric-header">❌ Rejected</div>
            <div class="metric-value" style="color:#EF4444;">${rejected.length}</div>
            <div class="metric-footer">Failed KYC or suspended</div>
          </div>
        </div>

        <!-- KYC Registration Pipeline Flow -->
        <div class="rp-card" style="margin-bottom: 16px; padding: 12px 16px; background: linear-gradient(90deg, #FFF7ED, #FFFBEB);">
          <div style="font-size: 0.8rem; font-weight: 800; color: #92400E; margin-bottom: 8px;">📋 Vendor Onboarding Pipeline:</div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 0.78rem; font-weight: 700; flex-wrap: wrap;">
            <span style="background:#FEF3C7;border:1px solid #FDE68A;padding:4px 10px;border-radius:20px;color:#92400E;">1. Registration</span>
            <span style="color:var(--gray-400);">→</span>
            <span style="background:#EDE9FE;border:1px solid #DDD6FE;padding:4px 10px;border-radius:20px;color:#5B21B6;">2. KYC & Documents</span>
            <span style="color:var(--gray-400);">→</span>
            <span style="background:var(--blood-tint);border:1px solid var(--blood-border);padding:4px 10px;border-radius:20px;color:var(--blood-dark);">3. Admin Review</span>
            <span style="color:var(--gray-400);">→</span>
            <span style="background:#ECFDF5;border:1px solid #BBF7D0;padding:4px 10px;border-radius:20px;color:#166534;">4. Store Activated</span>
            <span style="color:var(--gray-400);">→</span>
            <span style="background:#EFF6FF;border:1px solid #BFDBFE;padding:4px 10px;border-radius:20px;color:#1D4ED8;">5. Product Upload</span>
            <span style="color:var(--gray-400);">→</span>
            <span style="background:#F0FDF4;border:1px solid #BBF7D0;padding:4px 10px;border-radius:20px;color:#15803D;">6. Marketplace Live 🚀</span>
          </div>
        </div>

        <!-- All Vendors Table -->
        <div class="rp-card">
          <div class="rp-table-container">
            <table class="rp-table">
              <thead><tr>
                <th>Business / Store</th><th>Owner Contact</th><th>Business Type</th>
                <th>Bank Settlement</th><th>KYC Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                ${vendors.map(v => `
                  <tr>
                    <td>
                      <div style="font-weight:800;color:var(--blood-dark);">${v.business_name}</div>
                      <div style="font-size:0.72rem;color:var(--gray-500);">🏪 ${v.store_name || 'Store Pending Activation'}</div>
                      <div style="font-size:0.68rem;color:var(--gray-400);">📍 ${v.address || 'Address not set'}</div>
                    </td>
                    <td>
                      <div style="font-weight:700;">${v.full_name}</div>
                      <div style="font-size:0.72rem;color:var(--gray-500);">${v.email}</div>
                      <div style="font-size:0.72rem;color:var(--gray-500);">${v.phone}</div>
                    </td>
                    <td><span style="background:var(--gray-100);border:1px solid var(--gray-300);padding:2px 8px;border-radius:6px;font-size:0.72rem;">${v.business_type}</span></td>
                    <td style="font-size:0.75rem;">
                      <div style="font-weight:700;">${v.bank_name || 'GTBank'}</div>
                      <code>${v.account_number || '0000000000'}</code>
                      <div style="font-size:0.68rem;color:var(--gray-500);">${v.account_name || v.full_name}</div>
                    </td>
                    <td><span class="badge badge-${v.kyc_status.toLowerCase()}">${v.kyc_status}</span></td>
                    <td>
                      <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        ${v.store_id ? `<button onclick="AdminPortal.filterProductsByStore('${v.store_id}')" class="btn-secondary btn-sm">📦 Products</button>` : ''}
                        ${v.kyc_status !== 'APPROVED' ? `<button onclick="AdminPortal.decideKYC('${v.id}', 'APPROVED')" class="btn-success btn-sm">✅ Approve</button>` : ''}
                        ${v.kyc_status !== 'REJECTED' ? `<button onclick="AdminPortal.decideKYC('${v.id}', 'REJECTED')" class="btn-danger btn-sm">❌ Reject</button>` : ''}
                        ${v.store_id ? `<button onclick="AdminPortal.showStoreDeliveryFeeModal('${v.store_id}', '${v.store_name || v.business_name}', ${v.custom_delivery_fee || 0})" class="btn-secondary btn-sm" style="color:#9A3412;border-color:#FED7AA;" title="Override global delivery fee for this specific store">⚙️ Delivery Fee</button>` : ''}
                        <button onclick="AdminPortal.showResetUserPasswordModal('${v.user_id}', '${v.full_name}', '${v.email}', 'VENDOR')" class="btn-secondary btn-sm" style="font-size:0.68rem;padding:3px 7px;color:var(--blood-primary);border-color:var(--blood-border);" title="Reset this vendor's password individually">
                          🔑 Pwd
                        </button>
                        <a href="https://wa.me/${(v.phone||'').replace(/[^0-9]/g,'')}?text=Hello%20${encodeURIComponent(v.full_name)}%2C%20RushingPoint%20Vendor%20Support" target="_blank" class="btn-whatsapp btn-sm" style="text-decoration:none;">💬 WA</a>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  // ==========================================
  // ROLE MODULE: CUSTOMER SUPPORT DESK — Tickets, Resolve, Escalate, WhatsApp
  // ==========================================
  async renderCustomerSupportDesk() {
    let tickets = [];
    let orders = [];
    try {
      const res = await API.get("/api/support/tickets", { silent: true });
      if (res && res.tickets) tickets = res.tickets;
      const oRes = await API.get("/api/orders/", { silent: true });
      if (oRes && oRes.orders) orders = oRes.orders;
    } catch (e) {}

    const openTickets = tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
    const resolvedTickets = tickets.filter(t => t.status === 'RESOLVED');
    const criticalTickets = tickets.filter(t => t.priority === 'HIGH' || t.priority === 'URGENT');

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">💬 Customer Support Desk — Ticket Management</h1>
            <div class="admin-page-desc">Resolve customer complaints, track open tickets, escalate urgent issues, and contact customers directly via WhatsApp.</div>
          </div>
          <button onclick="AdminPortal.render()" class="btn-secondary btn-sm">🔄 Refresh</button>
        </div>

        <!-- Support KPIs -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
          <div class="metric-card" style="border-left: 4px solid var(--amber);">
            <div class="metric-header">🎫 Open Tickets</div>
            <div class="metric-value" style="color:var(--amber);">${openTickets.length}</div>
            <div class="metric-footer">Pending resolution</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid #EF4444;">
            <div class="metric-header">🚨 Critical Issues</div>
            <div class="metric-value" style="color:#EF4444;">${criticalTickets.length}</div>
            <div class="metric-footer">High / Urgent priority</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid var(--emerald);">
            <div class="metric-header">✅ Resolved</div>
            <div class="metric-value" style="color:var(--emerald);">${resolvedTickets.length}</div>
            <div class="metric-footer">Closed successfully</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid var(--blood-primary);">
            <div class="metric-header">📦 Total Tickets</div>
            <div class="metric-value">${tickets.length}</div>
            <div class="metric-footer">All time support cases</div>
          </div>
        </div>

        <!-- Critical / Urgent Tickets Alert Banner -->
        ${criticalTickets.length > 0 ? `
          <div style="background:#FEF2F2;border:1px solid #FEE2E2;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.2rem;">🚨</span>
            <div>
              <div style="font-weight:800;font-size:0.85rem;color:#991B1B;">${criticalTickets.length} Critical Ticket${criticalTickets.length > 1 ? 's' : ''} Need Immediate Attention</div>
              <div style="font-size:0.72rem;color:#B91C1C;">Urgent support cases — please resolve or escalate within 1 hour.</div>
            </div>
          </div>
        ` : ''}

        <!-- All Tickets Table -->
        <div class="rp-card">
          <div class="rp-card-header">
            <div class="rp-card-title">🎫 Support Ticket Queue (${tickets.length})</div>
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead><tr>
                <th>Ticket Ref</th><th>Customer</th><th>Issue Category</th>
                <th>Subject</th><th>Priority</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                ${tickets.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--gray-500);">No support tickets yet. Customers are happy! 🎉</td></tr>' :
                  tickets.map(t => `
                    <tr>
                      <td><strong style="color:var(--blood-primary);">${t.ticket_ref}</strong></td>
                      <td>
                        <div style="font-weight:700;">${t.customer_name}</div>
                        <div style="font-size:0.72rem;color:var(--gray-500);">${t.customer_phone || ''}</div>
                        ${t.customer_phone ? `<a href="https://wa.me/${(t.customer_phone||'').replace(/[^0-9]/g,'')}?text=Hello%2C%20RushingPoint%20Support%20Team%20here%20about%20ticket%20${t.ticket_ref}" target="_blank" style="font-size:0.65rem;color:#25D366;font-weight:700;text-decoration:none;">💬 WhatsApp</a>` : ''}
                      </td>
                      <td><span class="badge badge-assigned">${t.category}</span></td>
                      <td style="max-width:180px;font-size:0.78rem;">${t.subject}</td>
                      <td>
                        <span class="badge badge-${t.priority === 'HIGH' || t.priority === 'URGENT' ? 'new' : 'pending'}" style="${(t.priority === 'HIGH' || t.priority === 'URGENT') ? 'background:#FEF2F2;color:#991B1B;border-color:#FEE2E2;' : ''}">
                          ${t.priority === 'HIGH' || t.priority === 'URGENT' ? '🚨 ' : ''}${t.priority}
                        </span>
                      </td>
                      <td><span class="badge badge-${t.status.toLowerCase()}">${t.status}</span></td>
                      <td style="display:flex;gap:4px;flex-wrap:wrap;">
                        ${t.status !== 'RESOLVED' ? `<button onclick="AdminPortal.resolveTicket('${t.id}')" class="btn-success btn-sm">✅ Resolve</button>` : ''}
                        <button onclick="AdminPortal.escalateTicket('${t.id}')" class="btn-secondary btn-sm" style="font-size:0.72rem;">🔺 Escalate</button>
                      </td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  async escalateTicket(ticketId) {
    try {
      await API.put(`/api/support/tickets/${ticketId}`, { status: "ESCALATED", priority: "URGENT" });
      API.showToast("Ticket escalated to URGENT!", "info");
      this.render();
    } catch (e) {}
  },

  // ==========================================
  // ROLE MODULE: FINANCE — Refunds & Escrow Monitor
  // ==========================================
  async renderRefundsEscrow() {
    let orders = [];
    let summary = { total_gmv: 0, total_vendor_payouts: 0, total_rider_earnings: 0, total_platform_revenue: 0 };
    try {
      const oRes = await API.get("/api/orders/", { silent: true });
      if (oRes && oRes.orders) orders = oRes.orders;
      const fRes = await API.get("/api/finance/overview", { silent: true });
      if (fRes && fRes.summary) summary = fRes.summary;
    } catch (e) {}

    const refundedOrders = orders.filter(o => o.payment_status === 'REFUNDED' || o.status === 'CANCELLED_REFUNDED');
    const escrowOrders = orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED_REFUNDED' && o.payment_status === 'PAID');

    return `
      <div>
        <div class="admin-page-header">
          <div>
            <h1 class="admin-page-title">💸 Finance — Refunds, Escrow & Wallet Monitor</h1>
            <div class="admin-page-desc">Monitor delivery fee escrow, process 1-click full refunds, and track all financial reversals.</div>
          </div>
        </div>

        <!-- Finance Overview -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
          <div class="metric-card" style="border-left: 4px solid var(--blood-primary);">
            <div class="metric-header">💰 Total GMV</div>
            <div class="metric-value" style="font-size:1.1rem;color:var(--blood-primary);">₦${summary.total_gmv.toLocaleString(undefined,{minimumFractionDigits:2})}</div>
            <div class="metric-footer">Gross volume processed</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid #2563EB;">
            <div class="metric-header">🏪 Vendor Payouts</div>
            <div class="metric-value" style="font-size:1.1rem;color:#2563EB;">₦${summary.total_vendor_payouts.toLocaleString(undefined,{minimumFractionDigits:2})}</div>
            <div class="metric-footer">100% product price credited</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid var(--amber);">
            <div class="metric-header">📦 Escrow (In Transit)</div>
            <div class="metric-value" style="font-size:1.1rem;color:var(--amber);">${escrowOrders.length}</div>
            <div class="metric-footer">Delivery fees held</div>
          </div>
          <div class="metric-card" style="border-left: 4px solid #EF4444;">
            <div class="metric-header">💸 Refunded Orders</div>
            <div class="metric-value" style="font-size:1.1rem;color:#EF4444;">${refundedOrders.length}</div>
            <div class="metric-footer">100% returned to customer</div>
          </div>
        </div>

        <!-- Escrow Explainer -->
        <div style="background: linear-gradient(135deg, #FFF7ED, #FFFBEB); border: 1px solid #FDE68A; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px;">
          <div style="font-weight: 800; font-size: 0.85rem; color: #92400E; margin-bottom: 6px;">💡 How the 4-Way Settlement Works:</div>
          <div style="display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.78rem; color: #78350F;">
            <div>📦 <strong>Customer pays</strong> full amount (product + delivery)</div>
            <div>→</div>
            <div>🏪 <strong>Vendor receives</strong> 100% product price instantly</div>
            <div>→</div>
            <div>🔒 <strong>Delivery fee escrow</strong> held by Admin until POD verified</div>
            <div>→</div>
            <div>🛵 <strong>Rider receives</strong> commission after OTP delivery confirmation</div>
          </div>
        </div>

        <!-- Refundable Orders -->
        <div class="rp-card" style="margin-bottom: 20px;">
          <div class="rp-card-header">
            <div class="rp-card-title">💸 Active Orders — Refund Available</div>
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead><tr>
                <th>Order Ref</th><th>Customer</th><th>Vendor Store</th><th>Total</th><th>Status</th><th>Refund Action</th>
              </tr></thead>
              <tbody>
                ${orders.filter(o => !['DELIVERED','CANCELLED_REFUNDED'].includes(o.status)).slice(0,10).map(o => `
                  <tr>
                    <td><strong>${o.order_ref}</strong></td>
                    <td>${o.customer_name}</td>
                    <td>${o.store_name}</td>
                    <td><strong style="color:var(--blood-primary);">₦${o.total_amount.toLocaleString()}</strong></td>
                    <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
                    <td>
                      <button onclick="AdminPortal.showRefundModal('${o.id}','${o.order_ref}',${o.total_amount})" class="btn-danger btn-sm">💸 Process Refund</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Refund History -->
        <div class="rp-card">
          <div class="rp-card-header">
            <div class="rp-card-title">📋 Refund History (${refundedOrders.length})</div>
          </div>
          <div class="rp-table-container">
            <table class="rp-table">
              <thead><tr><th>Order Ref</th><th>Customer</th><th>Vendor</th><th>Amount Refunded</th><th>Status</th></tr></thead>
              <tbody>
                ${refundedOrders.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--gray-500);">No refunds processed yet.</td></tr>' :
                  refundedOrders.map(o => `
                    <tr>
                      <td><strong>${o.order_ref}</strong></td>
                      <td>${o.customer_name}</td>
                      <td>${o.store_name}</td>
                      <td><strong style="color:#EF4444;">₦${o.total_amount.toLocaleString()}</strong></td>
                      <td><span class="badge badge-cancelled">REFUNDED ✓</span></td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  // ==========================================
  // MODULE: VENDOR PARTNER APPLICATIONS
  // ==========================================
  async renderVendorRequests() {
    let requests = [];
    let totalPending = 0;
    let totalContacted = 0;
    let totalApproved = 0;

    try {
      const res = await API.get("/api/auth/vendor-requests");
      if (res && res.requests) {
        requests = res.requests;
        totalPending = requests.filter(r => r.status === "PENDING").length;
        totalContacted = requests.filter(r => r.status === "CONTACTED").length;
        totalApproved = requests.filter(r => r.status === "APPROVED").length;
      }
    } catch (e) {
      requests = [];
    }

    const statusColor = { PENDING: "#F59E0B", CONTACTED: "#3B82F6", APPROVED: "#10B981", REJECTED: "#EF4444" };
    const statusBg = { PENDING: "#FFFBEB", CONTACTED: "#EFF6FF", APPROVED: "#ECFDF5", REJECTED: "#FEF2F2" };

    return `
      <div style="padding: 28px 32px; max-width: 1200px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="font-size: 1.5rem; font-weight: 900; color: #1E293B; margin-bottom: 4px;">Partner & Vendor Applications</h2>
            <p style="font-size: 0.88rem; color: #64748B;">Review vendor partnership requests submitted from the public website. Contact applicants via WhatsApp or phone.</p>
          </div>
          <button onclick="AdminPortal.switchTab('vendor-requests')" style="padding: 10px 20px; background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; border-radius: 10px; font-weight: 700; font-size: 0.85rem; cursor: pointer;">Refresh List</button>
        </div>

        <!-- Summary Stats -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 28px;">
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 16px; padding: 20px; text-align: center;">
            <div style="font-size: 2rem; font-weight: 900; color: #D97706;">${totalPending}</div>
            <div style="font-size: 0.78rem; font-weight: 700; color: #92400E; text-transform: uppercase; margin-top: 4px;">Pending Review</div>
          </div>
          <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 16px; padding: 20px; text-align: center;">
            <div style="font-size: 2rem; font-weight: 900; color: #2563EB;">${totalContacted}</div>
            <div style="font-size: 0.78rem; font-weight: 700; color: #1E40AF; text-transform: uppercase; margin-top: 4px;">Contacted</div>
          </div>
          <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 16px; padding: 20px; text-align: center;">
            <div style="font-size: 2rem; font-weight: 900; color: #059669;">${totalApproved}</div>
            <div style="font-size: 0.78rem; font-weight: 700; color: #065F46; text-transform: uppercase; margin-top: 4px;">Approved</div>
          </div>
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; padding: 20px; text-align: center;">
            <div style="font-size: 2rem; font-weight: 900; color: #334155;">${requests.length}</div>
            <div style="font-size: 0.78rem; font-weight: 700; color: #64748B; text-transform: uppercase; margin-top: 4px;">Total Applications</div>
          </div>
        </div>

        ${requests.length === 0 ? '<div style="text-align: center; padding: 80px 20px; background: #F8FAFC; border-radius: 20px; border: 2px dashed #CBD5E1;"><div style="font-size: 3rem; margin-bottom: 16px;">📋</div><h3 style="font-size: 1.2rem; font-weight: 800; color: #334155; margin-bottom: 8px;">No Partner Applications Yet</h3><p style="font-size: 0.9rem; color: #64748B;">When merchants submit applications from the public website, they will appear here for your review.</p></div>' : (() => {
          const rows = requests.map((req) => {
            const waPhone = (req.whatsapp || req.phone || '').replace(/[^0-9+]/g, '');
            const callPhone = (req.phone || '').replace(/[^0-9+]/g, '');
            const waMsg = encodeURIComponent('Hello ' + req.contact_name + ', this is RushingPoint team. We received your vendor application for ' + req.business_name + ' and would love to discuss onboarding. Are you available?');
            const statusC = statusColor[req.status] || '#64748B';
            const statusBgC = statusBg[req.status] || '#F8FAFC';
            const dateStr = req.created_at ? new Date(req.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            return '<tr style="border-bottom: 1px solid #F1F5F9; transition: background 0.15s;" onmouseover="this.style.background=\'#F8FAFC\'" onmouseout="this.style.background=\'#FFF\'">'
              + '<td style="padding: 16px; font-size: 0.78rem; font-weight: 800; color: #7C3AED; font-family: monospace;">' + req.request_ref + '</td>'
              + '<td style="padding: 16px;"><div style="font-weight: 800; font-size: 0.9rem; color: #0F172A;">' + req.business_name + '</div><div style="font-size: 0.75rem; color: #94A3B8; margin-top: 2px;">' + req.business_type + '</div></td>'
              + '<td style="padding: 16px;"><div style="font-weight: 700; font-size: 0.88rem; color: #334155;">' + req.contact_name + '</div><div style="font-size: 0.75rem; color: #64748B;">' + req.email + '</div><div style="font-size: 0.75rem; color: #64748B;">' + req.phone + '</div></td>'
              + '<td style="padding: 16px; font-size: 0.85rem; color: #475569;">' + req.city + ', ' + req.state + '</td>'
              + '<td style="padding: 16px;"><select onchange="AdminPortal.updateVendorRequestStatus(\'' + req.request_ref + '\', this.value)" style="background: ' + statusBgC + '; color: ' + statusC + '; border: 1px solid ' + statusC + '40; border-radius: 8px; padding: 5px 10px; font-size: 0.78rem; font-weight: 800; cursor: pointer; outline: none;">'
              + '<option value="PENDING"' + (req.status === 'PENDING' ? ' selected' : '') + '>Pending</option>'
              + '<option value="CONTACTED"' + (req.status === 'CONTACTED' ? ' selected' : '') + '>Contacted</option>'
              + '<option value="APPROVED"' + (req.status === 'APPROVED' ? ' selected' : '') + '>Approved</option>'
              + '<option value="REJECTED"' + (req.status === 'REJECTED' ? ' selected' : '') + '>Rejected</option>'
              + '</select></td>'
              + '<td style="padding: 16px;"><div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">'
              + '<a href="https://wa.me/' + waPhone + '?text=' + waMsg + '" target="_blank" style="display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; background: #22C55E; color: #FFF; border-radius: 8px; font-size: 0.75rem; font-weight: 800; text-decoration: none; white-space: nowrap;">💬 WhatsApp</a>'
              + '<a href="tel:' + callPhone + '" style="display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; background: #3B82F6; color: #FFF; border-radius: 8px; font-size: 0.75rem; font-weight: 800; text-decoration: none; white-space: nowrap;">📞 Call</a>'
              + '<button onclick="AdminPortal.viewVendorRequestDetail(\'' + req.request_ref + '\')" style="display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 0.75rem; font-weight: 800; cursor: pointer; white-space: nowrap;">View</button>'
              + '</div></td>'
              + '<td style="padding: 16px; font-size: 0.75rem; color: #94A3B8; white-space: nowrap;">' + dateStr + '</td>'
              + '</tr>';
          }).join('');
          return '<div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.04);"><div style="overflow-x: auto;"><table style="width: 100%; border-collapse: collapse;"><thead><tr style="background: #F8FAFC; border-bottom: 1px solid #E2E8F0;"><th style="padding: 14px 16px; text-align: left; font-size: 0.75rem; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">Reference</th><th style="padding: 14px 16px; text-align: left; font-size: 0.75rem; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Business</th><th style="padding: 14px 16px; text-align: left; font-size: 0.75rem; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Contact</th><th style="padding: 14px 16px; text-align: left; font-size: 0.75rem; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Location</th><th style="padding: 14px 16px; text-align: left; font-size: 0.75rem; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Status</th><th style="padding: 14px 16px; text-align: left; font-size: 0.75rem; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Actions</th><th style="padding: 14px 16px; text-align: left; font-size: 0.75rem; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Date</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
        })()}
      </div>
    `;
  },

  async updateVendorRequestStatus(requestRef, newStatus) {
    try {
      await API.patch("/api/auth/vendor-requests/" + requestRef, { status: newStatus });
      API.showToast("Application " + requestRef + " marked as " + newStatus, "success");
    } catch (e) {
      API.showToast("Failed to update status: " + (e.message || "Unknown error"), "error");
    }
  },

  viewVendorRequestDetail(requestRef) {
    API.showToast("Ref: " + requestRef + " — Use WhatsApp or Phone to contact this applicant directly.", "info");
  },


  handleLogout() {
    if (confirm("Are you sure you want to sign out of the Administrator Operations Console?")) {
      if (typeof API !== 'undefined' && API.logout) {
        API.logout();
      } else {
        localStorage.removeItem('rp_token');
        localStorage.removeItem('rp_user');
      }
      location.reload();
    }
  },

  switchImgTab(prefix, tab) {
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

  async processAndUploadImage(fileInput, urlInputId, previewImgId, statusElId) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    const statusEl = document.getElementById(statusElId);
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#2563EB;">⏳ Processing & compressing image...</span>';
    }

    try {
      // 1. Read file and draw to Canvas for client-side compression
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

          // Convert to JPEG with quality 0.82 (High quality visual, tiny KB size)
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.82);
          const origSizeKb = (file.size / 1024).toFixed(0);

          // Upload to backend API
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
              statusEl.innerHTML = `<span style="color:#059669; font-weight:800;">✅ Uploaded & Compressed: ${finalSizeKb} KB (Reduced from ${origSizeKb} KB) • High HD Quality</span>`;
            }
            API.showToast("Product image compressed and set successfully (" + finalSizeKb + " KB)", "success");
          } catch (uploadErr) {
            // Fallback: Use the compressed base64 directly
            const finalSizeKb = (compressedDataUrl.length * 0.75 / 1024).toFixed(1);
            const urlInput = document.getElementById(urlInputId);
            if (urlInput) urlInput.value = compressedDataUrl;
            const preview = document.getElementById(previewImgId);
            if (preview) preview.src = compressedDataUrl;
            if (statusEl) {
              statusEl.innerHTML = `<span style="color:#059669; font-weight:800;">✅ Compressed: ${finalSizeKb} KB (Reduced from ${origSizeKb} KB) • Ready</span>`;
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


  // ==========================================
  // NEW MANUAL PAYOUT MODAL & HANDLER
  // ==========================================
  async showManualPayoutModal() {
    let riders = [];
    let vendors = [];
    try {
      const rRes = await API.get("/api/riders/live-map");
      if (rRes && rRes.riders) riders = rRes.riders;
      const vRes = await API.get("/api/vendors/");
      if (vRes && vRes.vendors) vendors = vRes.vendors;
    } catch (e) {}

    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 480px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: #059669;">💸 Record New Manual Offline Payout</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.78rem; color: #166534; line-height: 1.4;">
          <strong>ℹ️ Offline Disbursement:</strong> Records a payment you already made outside the platform (Cash, Direct Transfer, POS) — <strong>no Flutterwave transfer happens here</strong>. This safely debits the beneficiary's wallet ledger.
        </div>

        <form onsubmit="AdminPortal.handleExecuteManualPayout(event)">
          <div class="rp-form-group">
            <label class="rp-label">Beneficiary Type *</label>
            <select id="mp-type" class="rp-select" onchange="AdminPortal.toggleManualPayoutBeneficiaryList(this.value)">
              <option value="RIDER">🛵 Dispatch Rider</option>
              <option value="VENDOR">🏪 Vendor / Merchant</option>
            </select>
          </div>

          <div class="rp-form-group" id="mp-rider-group">
            <label class="rp-label">Select Rider *</label>
            <select id="mp-rider-id" class="rp-select">
              ${riders.map(r => `<option value="${r.id}">${r.full_name} (${r.rider_ref}) — Bal: ₦${(r.wallet_balance || 0).toLocaleString()}</option>`).join('')}
            </select>
          </div>

          <div class="rp-form-group" id="mp-vendor-group" style="display: none;">
            <label class="rp-label">Select Vendor *</label>
            <select id="mp-vendor-id" class="rp-select">
              ${vendors.map(v => `<option value="${v.id}">${v.business_name || v.store_name} (${v.full_name})</option>`).join('')}
            </select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Disbursed Amount (₦) *</label>
              <input type="number" id="mp-amount" class="rp-input" placeholder="5000" required min="100">
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Payment Channel *</label>
              <select id="mp-channel" class="rp-select" required>
                <option value="CASH">💵 Physical Cash</option>
                <option value="DIRECT_BANK_TRANSFER" selected>🏦 Direct Bank Transfer</option>
                <option value="POS">💳 Office POS</option>
                <option value="CHEQUE">📝 Cheque</option>
              </select>
            </div>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">External Reference / Receipt No.</label>
            <input type="text" id="mp-ref" class="rp-input" placeholder="e.g. GTB-TXN-8849201 or CASH-RCP-01">
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Notes & Purpose</label>
            <textarea id="mp-notes" class="rp-textarea" rows="2" placeholder="e.g. Paid weekly cash disbursement at Katsina Central Office"></textarea>
          </div>

          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px; background: #059669; font-weight: 800;">
            Confirm & Record Manual Payout 💸
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  toggleManualPayoutBeneficiaryList(type) {
    const rGroup = document.getElementById("mp-rider-group");
    const vGroup = document.getElementById("mp-vendor-group");
    if (type === 'RIDER') {
      if (rGroup) rGroup.style.display = "block";
      if (vGroup) vGroup.style.display = "none";
    } else {
      if (rGroup) rGroup.style.display = "none";
      if (vGroup) vGroup.style.display = "block";
    }
  },

  async handleExecuteManualPayout(e) {
    e.preventDefault();
    const beneficiary_type = document.getElementById("mp-type").value;
    const beneficiary_id = beneficiary_type === 'RIDER' ? document.getElementById("mp-rider-id").value : document.getElementById("mp-vendor-id").value;
    const amount = parseFloat(document.getElementById("mp-amount").value);
    const channel = document.getElementById("mp-channel").value;
    const external_reference = document.getElementById("mp-ref").value.trim();
    const notes = document.getElementById("mp-notes").value.trim();

    try {
      const res = await API.post("/api/admin/finance/manual-payout", {
        beneficiary_type, beneficiary_id, amount, channel, external_reference, notes
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message, "success");
      this.render();
    } catch (err) {}
  },

  // ==========================================
  // EDIT RIDER MODAL & HANDLER
  // ==========================================
  async showEditRiderModal(riderId) {
    let rider = null;
    try {
      const res = await API.get("/api/riders/live-map");
      if (res && res.riders) {
        rider = res.riders.find(r => r.id === riderId);
      }
    } catch (e) {}

    if (!rider) {
      API.showToast("Rider record not found", "error");
      return;
    }

    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 480px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">🛵 Edit Rider Profile & Information</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="AdminPortal.handleSaveRiderInfo(event, '${riderId}')">
          <div style="font-size: 0.78rem; color: #64748B; margin-bottom: 10px;">Ref: <code>${rider.rider_ref}</code></div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Full Name *</label>
              <input type="text" id="er-name" class="rp-input" value="${rider.full_name}" required>
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Phone Number *</label>
              <input type="tel" id="er-phone" class="rp-input" value="${rider.phone || ''}" required>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Vehicle Type *</label>
              <select id="er-vtype" class="rp-select" required>
                <option value="MOTORCYCLE" ${rider.vehicle_type === 'MOTORCYCLE' ? 'selected' : ''}>🏍️ Motorcycle / Bike</option>
                <option value="TRICYCLE" ${rider.vehicle_type === 'TRICYCLE' || rider.vehicle_type === 'KEKE' ? 'selected' : ''}>🛺 Keke / Tricycle</option>
                <option value="VAN" ${rider.vehicle_type === 'VAN' ? 'selected' : ''}>🚐 Cargo Van</option>
                <option value="BICYCLE" ${rider.vehicle_type === 'BICYCLE' ? 'selected' : ''}>🚲 Bicycle</option>
              </select>
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Plate Number *</label>
              <input type="text" id="er-plate" class="rp-input" value="${rider.plate_number || ''}" required>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Operational Status *</label>
              <select id="er-status" class="rp-select" required>
                <option value="AVAILABLE" ${rider.operational_status === 'AVAILABLE' ? 'selected' : ''}>🟢 Available for Dispatch</option>
                <option value="ON_DELIVERY" ${rider.operational_status === 'ON_DELIVERY' ? 'selected' : ''}>🔵 On Active Delivery</option>
                <option value="OFFLINE" ${rider.operational_status === 'OFFLINE' ? 'selected' : ''}>⚪ Offline</option>
                <option value="SUSPENDED" ${rider.operational_status === 'SUSPENDED' ? 'selected' : ''}>🔴 Suspended</option>
              </select>
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Fleet Role Type *</label>
              <select id="er-type" class="rp-select" required>
                <option value="INTERNAL" ${rider.rider_type === 'INTERNAL' ? 'selected' : ''}>🏢 Internal Dedicated Fleet</option>
                <option value="PARTNER" ${rider.rider_type === 'PARTNER' ? 'selected' : ''}>🤝 Independent Partner Rider</option>
              </select>
            </div>
          </div>

          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px; font-weight: 800; margin-top: 6px;">
            Save Rider Information 💾
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleSaveRiderInfo(e, riderId) {
    e.preventDefault();
    const full_name = document.getElementById("er-name").value.trim();
    const phone = document.getElementById("er-phone").value.trim();
    const vehicle_type = document.getElementById("er-vtype").value;
    const plate_number = document.getElementById("er-plate").value.trim();
    const operational_status = document.getElementById("er-status").value;
    const rider_type = document.getElementById("er-type").value;

    try {
      const res = await API.put(`/api/admin/riders/${riderId}`, {
        full_name, phone, vehicle_type, plate_number, operational_status, rider_type
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message || "Rider updated successfully", "success");
      this.render();
    } catch (err) {}
  },

  // ==========================================
  // EDIT VENDOR MODAL & HANDLER
  // ==========================================
  async showEditVendorModal(vendorId) {
    let vendor = null;
    try {
      const res = await API.get("/api/vendors/");
      if (res && res.vendors) {
        vendor = res.vendors.find(v => v.id === vendorId);
      }
    } catch (e) {}

    if (!vendor) {
      API.showToast("Vendor record not found", "error");
      return;
    }

    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 500px; border-radius: 20px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blood-dark);">🏪 Edit Vendor & Store Details</h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="AdminPortal.handleSaveVendorInfo(event, '${vendorId}')">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Business Name *</label>
              <input type="text" id="ev-bname" class="rp-input" value="${vendor.business_name}" required>
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Business Type</label>
              <input type="text" id="ev-btype" class="rp-input" value="${vendor.business_type || 'Retail'}">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Store Stall Name</label>
              <input type="text" id="ev-sname" class="rp-input" value="${vendor.store_name || vendor.business_name}">
            </div>
            <div class="rp-form-group">
              <label class="rp-label">Stall Address / Location</label>
              <input type="text" id="ev-addr" class="rp-input" value="${vendor.address || 'Katsina Central Market'}">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="rp-form-group">
              <label class="rp-label">Commission Rate (%)</label>
              <input type="number" id="ev-comm" class="rp-input" value="${vendor.commission_rate || 10}" min="0" max="50">
            </div>
            <div class="rp-form-group">
              <label class="rp-label">KYC Verification Status *</label>
              <select id="ev-kyc" class="rp-select" required>
                <option value="APPROVED" ${vendor.kyc_status === 'APPROVED' ? 'selected' : ''}>✅ Approved</option>
                <option value="PENDING" ${vendor.kyc_status === 'PENDING' ? 'selected' : ''}>⏳ Pending Review</option>
                <option value="UNDER_REVIEW" ${vendor.kyc_status === 'UNDER_REVIEW' ? 'selected' : ''}>🔍 Under Review</option>
                <option value="REJECTED" ${vendor.kyc_status === 'REJECTED' ? 'selected' : ''}>❌ Rejected</option>
              </select>
            </div>
          </div>

          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px; margin: 8px 0;">
            <div style="font-size: 0.75rem; font-weight: 800; color: #1E293B; margin-bottom: 6px;">🏦 Settlement Bank Account</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label class="rp-label" style="font-size: 0.68rem;">Bank Name</label>
                <input type="text" id="ev-bank" class="rp-input" value="${vendor.bank_name || 'GTBank'}">
              </div>
              <div>
                <label class="rp-label" style="font-size: 0.68rem;">Account Number</label>
                <input type="text" id="ev-acc" class="rp-input" value="${vendor.account_number || ''}">
              </div>
            </div>
          </div>

          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px; font-weight: 800; margin-top: 4px;">
            Save Vendor Changes 💾
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async handleSaveVendorInfo(e, vendorId) {
    e.preventDefault();
    const business_name = document.getElementById("ev-bname").value.trim();
    const business_type = document.getElementById("ev-btype").value.trim();
    const store_name = document.getElementById("ev-sname").value.trim();
    const address = document.getElementById("ev-addr").value.trim();
    const commission_rate = parseFloat(document.getElementById("ev-comm").value);
    const kyc_status = document.getElementById("ev-kyc").value;
    const bank_name = document.getElementById("ev-bank").value.trim();
    const account_number = document.getElementById("ev-acc").value.trim();

    try {
      const res = await API.put(`/api/admin/vendors/${vendorId}`, {
        business_name, business_type, store_name, address, commission_rate, kyc_status, bank_name, account_number
      });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message || "Vendor updated successfully", "success");
      this.render();
    } catch (err) {}
  },

  async handleSavePricingLimitsSettings(e) {
    e.preventDefault();
    const base_delivery_fee = parseFloat(document.getElementById("set-base-fee").value);
    const price_per_metre = parseFloat(document.getElementById("set-price-metre").value);
    const per_km_rate = parseFloat(document.getElementById("set-per-km").value);
    const default_rider_commission_pct = parseFloat(document.getElementById("set-rider-split").value);
    const min_withdrawal_amount = parseFloat(document.getElementById("set-min-withdraw").value);

    try {
      const res = await API.post("/api/admin/settings/pricing-and-limits", {
        base_delivery_fee, price_per_metre, per_km_rate, default_rider_commission_pct, min_withdrawal_amount
      });
      API.showToast(res.message || "Pricing and limits saved successfully!", "success");
      this.render();
    } catch (err) {}
  },

  async showSimDispatchModal(orderId, orderRef) {
    try {
      const res = await API.get(`/api/orders/${orderId}`, { silent: true });
      const o = res?.order || {};
      const riderPhone = o.rider_phone || '';
      const riderName = o.rider_name || o.rider_ref || 'Rider';
      const storeAddress = o.store_address || o.store_name || 'Vendor Store';
      const dropoffAddress = o.delivery_address || '';
      const customerPhone = o.customer_phone || '';
      this.showSimDispatchPanel(riderPhone, riderName, o.rider_id || '', orderRef, orderId, storeAddress, dropoffAddress, customerPhone);
    } catch (e) {
      API.showToast('Could not load order details for SIM dispatch.', 'error');
    }
  },

  // ==========================================
  // 🚨 ADMIN REAL-TIME AUDIO CHIME & BANNER ALERT SYSTEM (100% FREE)
  // Plays a dispatcher chime using Web Audio API + shows a red banner
  // whenever a new order arrives in the Live Order Queue.
  // ==========================================
  _adminAudioCtx: null,
  _adminLastOrderCount: null,
  _adminPollInterval: null,

  playAdminOrderChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      // Descending 3-note dispatcher chime (G5→E5→C5)
      const notes = [784, 659, 523];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.22);
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.22);
        gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + i * 0.22 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.22 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.22);
        osc.stop(ctx.currentTime + i * 0.22 + 0.4);
      });
      // Auto-close ctx after last note
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 1200);
    } catch (e) {}
  },

  showAdminNewOrderBanner(orderCount) {
    // Remove any existing banner first
    const existing = document.getElementById('admin-new-order-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'admin-new-order-banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 99998;
      background: linear-gradient(90deg, #7F1D1D, #B91C1C, #EF4444);
      color: #FFF; padding: 10px 20px;
      display: flex; align-items: center; justify-content: space-between;
      font-family: inherit; box-shadow: 0 4px 20px rgba(185,28,28,0.5);
      animation: rp-slide-down 0.35s ease;
    `;
    banner.innerHTML = `
      <style>
        @keyframes rp-slide-down { from { transform: translateY(-100%); opacity:0; } to { transform: translateY(0); opacity:1; } }
        @keyframes rp-blink { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        .rp-admin-blink { animation: rp-blink 0.8s ease-in-out infinite; }
      </style>
      <div style="display:flex; align-items:center; gap: 10px;">
        <span class="rp-admin-blink" style="font-size: 1.4rem;">🚨</span>
        <div>
          <div style="font-weight: 900; font-size: 0.92rem;">
            ${orderCount} NEW ORDER${orderCount > 1 ? 'S' : ''} WAITING FOR DISPATCH!
          </div>
          <div style="font-size: 0.7rem; opacity: 0.88;">
            Go to Live Order Queue → Assign a rider immediately
          </div>
        </div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button onclick="AdminPortal.switchTab('dispatcher')" style="background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.4); color:#FFF; padding: 5px 12px; border-radius:8px; font-weight:800; font-size:0.78rem; cursor:pointer;">
          ⚡ Open Queue
        </button>
        <button onclick="this.closest('#admin-new-order-banner').remove()" style="background:none; border:none; color:#FFF; font-size:1.2rem; cursor:pointer; opacity:0.7;">✕</button>
      </div>
    `;
    document.body.appendChild(banner);
    // Auto-dismiss after 30 seconds
    setTimeout(() => { try { banner.remove(); } catch (e) {} }, 30000);
  },

  startAdminOrderPolling() {
    if (this._adminPollInterval) return;
    this._adminPollInterval = setInterval(async () => {
      try {
        const user = (typeof API !== 'undefined' && API.getUser()) || null;
        if (!user || !['ADMIN', 'STAFF'].includes(user.account_type)) {
          this.stopAdminOrderPolling();
          return;
        }
        const res = await API.get('/api/orders/', { silent: true });
        const orders = res?.orders || [];
        const pendingCount = orders.filter(o => ['NEW', 'CONFIRMED'].includes(o.status)).length;

        if (this._adminLastOrderCount === null) {
          // First poll — just set baseline silently
          this._adminLastOrderCount = pendingCount;
          return;
        }

        if (pendingCount > this._adminLastOrderCount) {
          // New order(s) arrived!
          const diff = pendingCount - this._adminLastOrderCount;
          this.playAdminOrderChime();
          this.showAdminNewOrderBanner(pendingCount);
          this._adminLastOrderCount = pendingCount;
        } else {
          this._adminLastOrderCount = pendingCount;
        }

        // Auto-check for stale assignments (>3 mins without rider movement) and auto-escalate
        try {
          const escRes = await API.post('/api/dispatch/check-stale-assignments', {}, { silent: true });
          if (escRes && escRes.escalated_count > 0) {
            API.showToast(`🚨 Escalation: ${escRes.escalated_count} unresponsive assignments re-routed to next closest couriers!`, 'warning');
            if (this.currentTab === 'dispatcher') this.render();
          }
        } catch (escErr) {}

        // Auto-credit customers for late deliveries based on admin-configured threshold
        try {
          const lateRes = await API.post('/api/dispatch/check-late-deliveries', {}, { silent: true });
          if (lateRes && lateRes.compensated_count > 0) {
            API.showToast(`🎁 ${lateRes.compensated_count} customer(s) auto-credited ₦ for late delivery!`, 'info');
          }
        } catch (lateErr) {}
      } catch (e) {}
    }, 12000); // poll every 12 seconds
  },

  stopAdminOrderPolling() {
    if (this._adminPollInterval) {
      clearInterval(this._adminPollInterval);
      this._adminPollInterval = null;
    }
  },

  // ==========================================
  // 📟 1-TAP SIM CARD DISPATCH — SMS + CALL for Feature-Phone (Nokia/itel) Riders
  // Opens native phone app / SMS composer pre-filled with mission details.
  // ₦0 cost to admin — uses GSM tel: and sms: URI schemes.
  // ==========================================
  simSmsDispatch(riderPhone, riderName, orderRef, storeAddress, dropoffAddress, customerPhone, commissionNaira) {
    if (!riderPhone) {
      alert('No phone number registered for this rider.');
      return;
    }
    const mission = [
      `RUSHPOINT DISPATCH`,
      `Order: ${orderRef}`,
      `Pickup: ${storeAddress}`,
      `Dropoff: ${dropoffAddress}`,
      `Customer: ${customerPhone}`,
      `Commission: N${commissionNaira}`,
      `Reply: ACCEPT or DECLINE`,
    ].join('\n');
    const encoded = encodeURIComponent(mission);
    // sms: URI — opens native SMS app with rider's number and pre-filled message
    window.open(`sms:${riderPhone}?body=${encoded}`, '_self');
  },

  simCallDispatch(riderPhone, riderName) {
    if (!riderPhone) {
      alert('No phone number registered for this rider.');
      return;
    }
    // tel: URI — initiates a native GSM call on the admin's device
    window.open(`tel:${riderPhone}`, '_self');
  },

  showSimDispatchPanel(riderPhone, riderName, riderId, orderRef, orderId, storeAddress, dropoffAddress, customerPhone) {
    const existingPanel = document.getElementById('rp-sim-dispatch-panel');
    if (existingPanel) existingPanel.remove();

    const panel = document.createElement('div');
    panel.id = 'rp-sim-dispatch-panel';
    panel.className = 'modal-backdrop rp-modal-overlay';
    panel.innerHTML = `
      <div class="modal-dialog" style="max-width:480px; border-radius:18px;">
        <div class="modal-header">
          <div>
            <h3 style="font-size:1rem; font-weight:900; color:#7F1D1D;">📟 SIM Card Dispatch — Feature-Phone Rider</h3>
            <div style="font-size:0.7rem; color:#64748B;">Rider: <strong>${riderName}</strong> (${riderPhone}) • Order: <strong>${orderRef}</strong></div>
          </div>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;">✕</button>
        </div>

        <div style="background:#FFF5F5; border:1px solid #FECACA; border-radius:12px; padding:12px 14px; margin-bottom:14px; font-size:0.74rem; color:#7F1D1D;">
          <strong>📍 Pickup:</strong> ${storeAddress || 'Vendor Store'}<br>
          <strong>📦 Dropoff:</strong> ${dropoffAddress || 'Customer Address'}<br>
          <strong>📞 Customer:</strong> ${customerPhone || 'N/A'}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
          <!-- 1-Tap SMS -->
          <button onclick="AdminPortal.simSmsDispatch('${riderPhone}', '${riderName}', '${orderRef}', '${(storeAddress||'').replace(/'/g,'')}', '${(dropoffAddress||'').replace(/'/g,'')}', '${customerPhone||''}', '800'); this.closest('.modal-backdrop').remove();"
            style="background: linear-gradient(135deg, #1E40AF, #2563EB); color:#FFF; border:none; border-radius:12px; padding:14px; cursor:pointer; text-align:center; font-weight:800; font-size:0.8rem;">
            📩 Send SMS Mission<br>
            <span style="font-size:0.65rem; font-weight:500; opacity:0.85;">Opens native SMS — ₦0 from app</span>
          </button>
          <!-- 1-Tap Call -->
          <button onclick="AdminPortal.simCallDispatch('${riderPhone}', '${riderName}');"
            style="background: linear-gradient(135deg, #065F46, #059669); color:#FFF; border:none; border-radius:12px; padding:14px; cursor:pointer; text-align:center; font-weight:800; font-size:0.8rem;">
            📞 Call Rider Directly<br>
            <span style="font-size:0.65rem; font-weight:500; opacity:0.85;">Opens native phone dialer</span>
          </button>
        </div>

        <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:10px; padding:10px; font-size:0.7rem; color:#166534; line-height:1.6;">
          <strong>💡 How it works:</strong><br>
          • Tap <em>Send SMS Mission</em> — your phone opens the SMS app with the rider's number and full dispatch details pre-filled. Tap Send.<br>
          • The rider's Nokia / itel button phone receives the SMS instantly with pickup, dropoff, and commission info.<br>
          • Tap <em>Call Rider Directly</em> to verbally confirm the mission over GSM voice call.
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  },

  async autoAssignNearestOrder(orderId) {
    try {
      const res = await API.post(`/api/dispatch/auto-assign/${orderId}`);
      API.showToast(res.message || "Auto-assigned nearest rider successfully!", "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (e) {
      API.showToast(e.message || "Failed to auto-assign rider", "error");
    }
  },

  async autoAssignAllPending() {
    if (!confirm("Auto-assign all pending orders to their nearest available couriers?")) return;
    try {
      const res = await API.post("/api/dispatch/auto-assign-all");
      API.showToast(res.message || "All pending orders auto-assigned!", "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (e) {
      API.showToast(e.message || "Failed to auto-assign pending orders", "error");
    }
  },

  async toggleCustomerCallPolicy(newState) {
    try {
      const res = await API.post("/api/dispatch/customer-call-setting", { enabled: newState });
      API.showToast(res.message, "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (e) {
      API.showToast("Could not update customer call policy", "error");
    }
  },

  async loadLateDeliverySettings() {
    try {
      const res = await API.get("/api/dispatch/late-delivery-settings", { silent: true });
      if (!res) return;
      const threshold = document.getElementById("lateCompThreshold");
      const amount = document.getElementById("lateCompAmount");
      const enabled = document.getElementById("lateCompEnabled");
      const badge = document.getElementById("lateCompBadge");
      if (threshold) threshold.value = res.threshold_minutes || 45;
      if (amount) amount.value = res.credit_amount_ngn || 500;
      if (enabled) enabled.value = res.enabled ? "true" : "false";
      if (badge) {
        badge.textContent = res.enabled ? "ACTIVE" : "PAUSED";
        badge.style.background = res.enabled ? "#059669" : "#DC2626";
      }
    } catch (e) {}
  },

  async saveLateDeliverySettings() {
    const threshold = parseInt(document.getElementById("lateCompThreshold")?.value || "45");
    const amount = parseFloat(document.getElementById("lateCompAmount")?.value || "500");
    const enabled = (document.getElementById("lateCompEnabled")?.value || "true") === "true";
    if (isNaN(threshold) || threshold < 5) {
      API.showToast("Threshold must be at least 5 minutes.", "error"); return;
    }
    if (isNaN(amount) || amount < 0) {
      API.showToast("Credit amount cannot be negative.", "error"); return;
    }
    try {
      const res = await API.post("/api/dispatch/late-delivery-settings", {
        threshold_minutes: threshold,
        credit_amount_ngn: amount,
        enabled
      });
      API.showToast(res.message || "Late delivery settings saved!", "success");
      const info = document.getElementById("lateCompInfo");
      const badge = document.getElementById("lateCompBadge");
      if (info) {
        info.style.display = "block";
        info.innerHTML = `✅ <strong>Saved:</strong> Customers will receive <strong>₦${amount.toLocaleString()}</strong> wallet credit if their delivery exceeds <strong>${threshold} minutes</strong>. Status: <strong>${enabled ? "Active ✅" : "Paused ⏸️"}</strong>`;
      }
      if (badge) {
        badge.textContent = enabled ? "ACTIVE" : "PAUSED";
        badge.style.background = enabled ? "#059669" : "#DC2626";
      }
    } catch (e) {
      API.showToast(e.message || "Failed to save late delivery settings.", "error");
    }
  },

  showBroadcastModal() {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop rp-modal-overlay";
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 480px; border-radius: 18px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: #312E81; display: flex; align-items: center; gap: 8px;">
            <span>📢</span> Admin Broadcast Notification Center
          </h3>
          <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>

        <div style="background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.75rem; color: #3730A3;">
          Push an immediate system notification with sound chime to all users or target specific user groups.
        </div>

        <form onsubmit="AdminPortal.sendBroadcastNotification(event)">
          <div class="rp-form-group">
            <label class="rp-label">Target Audience</label>
            <select id="bc-target" class="rp-select" style="font-weight: 700;">
              <option value="ALL">👥 All Platform Users (Everyone)</option>
              <option value="CUSTOMERS">🛍️ All Customers Only</option>
              <option value="VENDORS">🏪 All Store Merchants & Vendors Only</option>
              <option value="RIDERS">🛵 All Delivery Couriers & Riders Only</option>
            </select>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Notification Title</label>
            <input type="text" id="bc-title" class="rp-input" placeholder="e.g. Katsina Festive Rush Notice / Fuel Surcharge Update" required>
          </div>

          <div class="rp-form-group">
            <label class="rp-label">Broadcast Message</label>
            <textarea id="bc-message" class="rp-textarea" rows="4" placeholder="Write your broadcast announcement..." required></textarea>
          </div>

          <div style="display: flex; gap: 10px; margin-top: 16px;">
            <button type="button" onclick="this.closest('.modal-backdrop').remove()" class="btn-secondary" style="flex: 1; justify-content: center;">
              Cancel
            </button>
            <button type="submit" class="btn-primary" style="flex: 2; justify-content: center; background: #4338CA; border-color: #3730A3; font-weight: 800;">
              🚀 Send Broadcast Alert
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async sendBroadcastNotification(e) {
    e.preventDefault();
    const target = document.getElementById("bc-target").value;
    const title = document.getElementById("bc-title").value.trim();
    const message = document.getElementById("bc-message").value.trim();

    if (!title || !message) {
      API.showToast("Title and message are required", "error");
      return;
    }

    try {
      const res = await API.post("/api/notifications/broadcast", { target, title, message });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message || `Broadcast sent to ${res.sent_count} users!`, "success");
    } catch (err) {
      API.showToast(err.message || "Failed to send broadcast", "error");
    }
  },

  async bulkConfirmActiveDeliveries() {
    if (!confirm("Bulk-verify ALL active and arrived deliveries now? This will mark them DELIVERED, release escrow settlements, and credit courier wallets.")) return;
    try {
      const res = await API.post("/api/orders/bulk-confirm-delivery", {});
      API.showToast(res.message || `Verified ${res.confirmed_count} deliveries!`, "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (e) {
      API.showToast(e.message || "Failed to bulk-verify deliveries", "error");
    }
  },

  async showOfflineRiderPayoutSelectorModal() {
    try {
      const res = await API.get("/api/riders/");
      const riders = res?.riders || [];

      const modal = document.createElement("div");
      modal.className = "modal-backdrop rp-modal-overlay";
      modal.innerHTML = `
        <div class="modal-dialog" style="max-width: 480px; border-radius: 18px;">
          <div class="modal-header">
            <h3 style="font-size: 1.1rem; font-weight: 800; color: #92400E; display: flex; align-items: center; gap: 8px;">
              <span>🛵</span> Disburse Offline Rider Payout
            </h3>
            <button onclick="this.closest('.modal-backdrop').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
          </div>

          <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.74rem; color: #78350F;">
            Withdraw and disburse cash or direct bank transfer on behalf of riders with basic button phones (Nokia/itel) who lack smartphone access.
          </div>

          <form onsubmit="AdminPortal.handleOfflineRiderPayoutSubmit(event)">
            <div class="rp-form-group">
              <label class="rp-label">Select Rider</label>
              <select id="adm-offline-rdr-select" class="rp-select" onchange="AdminPortal.onOfflineRiderSelected(this)" required>
                <option value="">-- Choose Rider --</option>
                ${riders.map(r => `
                  <option value="${r.id}" data-name="${r.full_name}" data-balance="${r.wallet_balance || 0}" data-ref="${r.rider_ref}">
                    ${r.full_name} (${r.rider_ref} - ₦${(r.wallet_balance || 0).toLocaleString()})
                  </option>
                `).join('')}
              </select>
            </div>

            <div id="adm-offline-rdr-balance-box" style="display: none; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px; margin-bottom: 12px; font-size: 0.78rem;">
              <div>Available Earned Balance: <strong id="adm-offline-rdr-bal" style="color: #059669; font-size: 1rem;">₦0</strong></div>
            </div>

            <div class="rp-form-group">
              <label class="rp-label">Disbursement Amount (NGN)</label>
              <input type="number" id="adm-offline-rdr-amount" class="rp-input" min="100" placeholder="e.g. 5000" required>
            </div>

            <div class="rp-form-group">
              <label class="rp-label">Disbursement Channel / Receipt Note</label>
              <input type="text" id="adm-offline-rdr-note" class="rp-input" value="Cash Handover at Katsina Hub Dispatch Counter" required>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 16px;">
              <button type="button" onclick="this.closest('.modal-backdrop').remove()" class="btn-secondary" style="flex: 1; justify-content: center;">
                Cancel
              </button>
              <button type="submit" class="btn-primary" style="flex: 2; justify-content: center; background: #D97706; border-color: #B45309; font-weight: 800;">
                💸 Disburse Payout Now
              </button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (e) {
      API.showToast("Could not load riders list", "error");
    }
  },

  onOfflineRiderSelected(selectEl) {
    const opt = selectEl.options[selectEl.selectedIndex];
    const balBox = document.getElementById("adm-offline-rdr-balance-box");
    const balEl = document.getElementById("adm-offline-rdr-bal");
    const amtInput = document.getElementById("adm-offline-rdr-amount");
    if (!opt || !opt.value) {
      if (balBox) balBox.style.display = "none";
      return;
    }
    const bal = parseFloat(opt.getAttribute("data-balance") || 0);
    if (balBox) balBox.style.display = "block";
    if (balEl) balEl.innerText = `₦${bal.toLocaleString()}`;
    if (amtInput) {
      amtInput.value = bal;
      amtInput.max = bal;
    }
  },

  async handleOfflineRiderPayoutSubmit(e) {
    e.preventDefault();
    const selectEl = document.getElementById("adm-offline-rdr-select");
    const riderId = selectEl.value;
    const amount = parseFloat(document.getElementById("adm-offline-rdr-amount").value);
    const bank_account = document.getElementById("adm-offline-rdr-note").value.trim();

    if (!riderId || !amount || amount <= 0) {
      API.showToast("Please select a rider and valid amount", "error");
      return;
    }

    try {
      const res = await API.post(`/api/admin/riders/${riderId}/withdraw-on-behalf`, { amount, bank_account });
      document.querySelector(".rp-modal-overlay")?.remove();
      API.showToast(res.message || "Payout disbursed successfully!", "success");
      this.render();
      if (window.MobileApp) window.MobileApp.render();
    } catch (err) {
      API.showToast(err.message || "Payout disbursement failed", "error");
    }
  },

};


window.AdminPortal = AdminPortal;
