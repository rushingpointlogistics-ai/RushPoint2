import uuid
import secrets
from datetime import datetime, timezone, timedelta
from app.database import get_db_connection, init_db
from app.security import hash_password

def seed_database():
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if already seeded with vendors
    vendor_check = cursor.execute("SELECT id FROM vendors LIMIT 1").fetchone()
    if vendor_check:
        conn.close()
        return

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    
    print("Seeding initial RushPoint production master data...")

    # 1. System Settings
    settings = [
        ("base_delivery_fee", "1200.0", "Base delivery booking charge in NGN"),
        ("per_km_rate", "120.0", "Per kilometer pricing rate in NGN"),
        ("price_per_metre", "0.12", "Per metre pricing rate in NGN (120 NGN/km)"),
        ("default_vendor_commission", "10.0", "Default marketplace commission percentage (10%)"),
        ("rider_delivery_split_pct", "80.0", "Percentage of delivery fee awarded to rider (80%)"),
        ("min_withdrawal_amount", "500.0", "Minimum withdrawal threshold"),
        ("surge_multiplier", "1.0", "Active surge multiplier for high demand hours"),
        ("master_security_pin", "889900", "6-digit Master Security PIN for admin emergency actions"),
        ("flutterwave_client_id", "ce13bd3d-08af-496e-8bf9-37ec62f69819", "Flutterwave Client ID"),
        ("flutterwave_public_key", "FLWPUBK_TEST-ce13bd3d08af496e8bf937ec62f69819-X", "Flutterwave Public Key"),
        ("flutterwave_secret_key", "FLWSECK_TEST-Tr7wTwOvbk8vlbJOBVd4m37dYBqijPkJ-X", "Flutterwave Secret Key"),
        ("flutterwave_encryption_key", "yr8VlYO/iNhS/Kgd5t3MSlvJE7o6H5AbZr97vc6hFCg=", "Flutterwave Encryption Key"),
        ("flutterwave_secret_hash", "Atajrajah@123", "Flutterwave Webhook Verification Secret Hash"),
        ("flutterwave_webhook_url", "https://rushpoint2.onrender.com/webhooks/flutterwave", "Configured Flutterwave Webhook Endpoint URL"),
        ("flutterwave_mode", "LIVE", "Active payment gateway operating mode (LIVE/SANDBOX)")
    ]
    for k, v, d in settings:
        cursor.execute("INSERT OR REPLACE INTO system_settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)", (k, v, d, now_iso))

    # 2. Roles
    roles = [
        ("r-super-admin", "Super Admin", "Full unconstrained administrative override", '["*"]'),
        ("r-ops-manager", "Operations Manager", "Manages platform operations and logistics", '["marketplace.*", "orders.*", "dispatch.*", "riders.*"]'),
        ("r-dispatcher", "Dispatcher", "Manages active deliveries and rider assignments", '["dispatch.*", "orders.*", "riders.read"]'),
        ("r-finance-officer", "Finance Officer", "Manages ledger, settlements, and payouts", '["finance.*", "orders.read"]')
    ]
    for rid, name, desc, perms in roles:
        cursor.execute("INSERT OR REPLACE INTO roles (id, name, description, permissions_json, created_at) VALUES (?, ?, ?, ?, ?)", (rid, name, desc, perms, now_iso))

    # 3. Core Administrative Users
    admin_id = "u-admin-1"
    cursor.execute("""
        INSERT OR REPLACE INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, phone_verified, created_at, updated_at)
        VALUES (?, 'RP-ADM-001', 'Chief Super Administrator', 'admin@rushingpoint.com', '+2348000000001', ?, 'ADMIN', 'ACTIVE', 'Super Admin', 1, ?, ?)
    """, (admin_id, hash_password("admin123"), now_iso, now_iso))
    
    cursor.execute("INSERT OR REPLACE INTO wallets (id, user_id, balance, currency, updated_at) VALUES (?, ?, 0.0, 'NGN', ?)", (str(uuid.uuid4()), admin_id, now_iso))

    # 4. Standard Categories
    categories = [
        ("cat-food", "Food & Quick Bites", "food-and-quick-bites", "utensils", "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500", 1),
        ("cat-groc", "Groceries & Supermarket", "groceries-and-supermarket", "shopping-cart", "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500", 2),
        ("cat-tech", "Phones & Electronics", "phones-and-electronics", "tv", "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=500", 3),
        ("cat-build", "Building Materials & Blocks", "building-materials-and-blocks", "box", "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=500", 4),
        ("cat-land", "Real Estate & Estates", "real-estate-land-estates", "map-pin", "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=500", 5)
    ]
    for cid, cname, cslug, cicon, cimg, csort in categories:
        cursor.execute("INSERT OR REPLACE INTO categories (id, name, slug, icon, image_url, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)", (cid, cname, cslug, cicon, cimg, csort, now_iso, now_iso))

    # 5. Real Vendor 1: Almusik Venture
    v1_uid = "u-vendor-almusik"
    v1_id = "v-almusik-001"
    s1_id = "s-almusik-001"

    cursor.execute("""
        INSERT OR REPLACE INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, phone_verified, created_at, updated_at)
        VALUES (?, 'RP-VND-001', 'Alhaji Mustapha Almusik', 'almusik@rushingpoint.com', '+2348039876541', ?, 'VENDOR', 'ACTIVE', 'Vendor Merchant', 1, ?, ?)
    """, (v1_uid, hash_password("vendor123"), now_iso, now_iso))

    cursor.execute("INSERT OR REPLACE INTO wallets (id, user_id, balance, currency, updated_at) VALUES (?, ?, 25000.0, 'NGN', ?)", (str(uuid.uuid4()), v1_uid, now_iso))

    cursor.execute("""
        INSERT OR REPLACE INTO vendors (id, user_id, business_name, business_type, registration_number, tax_id, bank_name, account_number, account_name, kyc_status, commission_rate, created_at, updated_at)
        VALUES (?, ?, 'Almusik Venture', 'Supermarket & General Groceries', 'RC-998822', 'TAX-ALM-101', 'Guaranty Trust Bank', '0128847112', 'Almusik Venture Nig Ltd', 'APPROVED', 10.0, ?, ?)
    """, (v1_id, v1_uid, now_iso, now_iso))

    cursor.execute("""
        INSERT OR REPLACE INTO stores (id, vendor_id, store_name, slug, description, category, address, city, state, latitude, longitude, is_active, created_at, updated_at)
        VALUES (?, ?, 'Almusik Venture Store', 'almusik-venture', 'Premier Supermarket & Wholesale Groceries Hub in Katsina', 'Groceries & Supermarket', 'Katsina Central Commercial Market, Plot 14', 'Katsina', 'Katsina State', 12.9908, 7.6018, 1, ?, ?)
    """, (s1_id, v1_id, now_iso, now_iso))

    almusik_products = [
        ("p-alm-1", "RP-PRD-801", s1_id, "cat-groc", "Royal Chef Pure Vegetable Oil (5 Litres)", "Premium fortified cholesterol-free cooking oil", 14500.0, 45, "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500"),
        ("p-alm-2", "RP-PRD-802", s1_id, "cat-groc", "Golden Penny Semovita (10kg Bag)", "Superior quality fortified semolina flour for nutritious family meals", 12200.0, 60, "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=500"),
        ("p-alm-3", "RP-PRD-803", s1_id, "cat-groc", "Dangote Refined Fine Sugar (50kg Bag)", "Pure fortified granulated white sugar wholesale pack", 68000.0, 30, "https://images.unsplash.com/photo-1581441363689-1f3c3c414635?w=500")
    ]
    for pid, pref, st_id, cat_id, name, desc, price, stock, img in almusik_products:
        cursor.execute("""
            INSERT OR REPLACE INTO products (id, product_ref, store_id, category_id, name, description, sku, price, stock_qty, image_url, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        """, (pid, pref, st_id, cat_id, name, desc, f"SKU-{pref}", price, stock, img, now_iso, now_iso))

    # 6. Real Vendor 2: Muhabbik Bread
    v2_uid = "u-vendor-muhabbik"
    v2_id = "v-muhabbik-002"
    s2_id = "s-muhabbik-002"

    cursor.execute("""
        INSERT OR REPLACE INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, phone_verified, created_at, updated_at)
        VALUES (?, 'RP-VND-002', 'Mallam Sani Muhabbik', 'muhabbik@rushingpoint.com', '+2348031122334', ?, 'VENDOR', 'ACTIVE', 'Vendor Merchant', 1, ?, ?)
    """, (v2_uid, hash_password("vendor123"), now_iso, now_iso))

    cursor.execute("INSERT OR REPLACE INTO wallets (id, user_id, balance, currency, updated_at) VALUES (?, ?, 18000.0, 'NGN', ?)", (str(uuid.uuid4()), v2_uid, now_iso))

    cursor.execute("""
        INSERT OR REPLACE INTO vendors (id, user_id, business_name, business_type, registration_number, tax_id, bank_name, account_number, account_name, kyc_status, commission_rate, created_at, updated_at)
        VALUES (?, ?, 'Muhabbik Bread & Bakery', 'Bakery & Confectionery Specialist', 'RC-773311', 'TAX-MUH-202', 'Zenith Bank', '2081199441', 'Muhabbik Bakery Enterprise', 'APPROVED', 10.0, ?, ?)
    """, (v2_id, v2_uid, now_iso, now_iso))

    cursor.execute("""
        INSERT OR REPLACE INTO stores (id, vendor_id, store_name, slug, description, category, address, city, state, latitude, longitude, is_active, created_at, updated_at)
        VALUES (?, ?, 'Muhabbik Bakery & Confectionery', 'muhabbik-bread', 'Freshly baked premium bread, butter croissants, and gourmet pastries daily', 'Food & Quick Bites', 'GRA Main Road, Near Katsina City Gate', 'Katsina', 'Katsina State', 12.9820, 7.5950, 1, ?, ?)
    """, (s2_id, v2_id, now_iso, now_iso))

    muhabbik_products = [
        ("p-muh-1", "RP-PRD-901", s2_id, "cat-food", "Special Jumbo Family Loaf (Muhabbik)", "Freshly baked extra soft, golden crust family bread", 1200.0, 120, "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500"),
        ("p-muh-2", "RP-PRD-902", s2_id, "cat-food", "Butter Sliced Sandwich Loaf (Muhabbik)", "Enriched milk & pure butter sliced sandwich bread", 950.0, 150, "https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?w=500"),
        ("p-muh-3", "RP-PRD-903", s2_id, "cat-food", "Muhabbik Gourmet Chocolate Croissants (Pack of 6)", "Oven-baked flaky golden puff croissants with rich chocolate filling", 2400.0, 50, "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500")
    ]
    for pid, pref, st_id, cat_id, name, desc, price, stock, img in muhabbik_products:
        cursor.execute("""
            INSERT OR REPLACE INTO products (id, product_ref, store_id, category_id, name, description, sku, price, stock_qty, image_url, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        """, (pid, pref, st_id, cat_id, name, desc, f"SKU-{pref}", price, stock, img, now_iso, now_iso))

    # 7. Four Distinct Riders
    riders_data = [
        ("u-rider-moto-int", "RP-RDR-001", "Ibrahim Musa (Internal Rider)", "rider.internal.moto@rushingpoint.com", "+2348071112201", "INTERNAL", "MOTORCYCLE", "KTN-412-MTR", "DRV-KT-991101", 12.9900, 7.6010, 15000.0),
        ("u-rider-moto-ext", "RP-RDR-002", "Usman Bello (External Rider)", "rider.external.moto@rushingpoint.com", "+2348071112202", "EXTERNAL_PARTNER", "MOTORCYCLE", "KTN-884-MTR", "DRV-KT-991102", 12.9880, 7.6030, 8500.0),
        ("u-rider-tri-int", "RP-RDR-003", "Kabiru Sani (Internal Tricycle)", "rider.internal.tri@rushingpoint.com", "+2348071112203", "INTERNAL", "TRICYCLE", "KTN-519-KEKE", "DRV-KT-991103", 12.9920, 7.5980, 22000.0),
        ("u-rider-tri-ext", "RP-RDR-004", "Aliyu Umar (External Tricycle)", "rider.external.tri@rushingpoint.com", "+2348071112204", "EXTERNAL_PARTNER", "TRICYCLE", "KTN-723-KEKE", "DRV-KT-991104", 12.9850, 7.6050, 11500.0)
    ]
    for uid, rref, fname, email, phone, rtype, vtype, plate, lic, lat, lng, wbal in riders_data:
        cursor.execute("""
            INSERT OR REPLACE INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, phone_verified, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'RIDER', 'ACTIVE', 'Dispatch Courier', 1, ?, ?)
        """, (uid, rref, fname, email, phone, hash_password("rider123"), now_iso, now_iso))

        cursor.execute("INSERT OR REPLACE INTO wallets (id, user_id, balance, currency, updated_at) VALUES (?, ?, ?, 'NGN', ?)", (str(uuid.uuid4()), uid, wbal, now_iso))

        cursor.execute("""
            INSERT OR REPLACE INTO riders (id, user_id, rider_ref, rider_type, vehicle_type, plate_number, license_number, kyc_status, operational_status, current_lat, current_lng, last_ping_at, rating, total_deliveries, wallet_balance, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'AVAILABLE', ?, ?, ?, 5.0, 12, ?, ?, ?)
        """, (str(uuid.uuid4()), uid, rref, rtype, vtype, plate, lic, lat, lng, now_iso, wbal, now_iso, now_iso))

    # 8. Clean Verified Customer
    cust_uid = "u-customer-fatima"
    cursor.execute("""
        INSERT OR REPLACE INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, phone_verified, created_at, updated_at)
        VALUES (?, 'RP-CUS-001', 'Fatima Abubakar', 'customer@rushingpoint.com', '+2348031234567', ?, 'CUSTOMER', 'ACTIVE', 'Verified Shopper', 1, ?, ?)
    """, (cust_uid, hash_password("customer123"), now_iso, now_iso))

    cursor.execute("INSERT OR REPLACE INTO wallets (id, user_id, balance, currency, updated_at) VALUES (?, ?, 50000.0, 'NGN', ?)", (str(uuid.uuid4()), cust_uid, now_iso))

    # 9. Active 4-Hour Flash Sale Promo
    end_time = now + timedelta(hours=4)
    cursor.execute("""
        INSERT OR REPLACE INTO promos (
            id, promo_ref, title, description, promo_type, discount_value, scope, target_ids,
            min_order_amount, max_discount_cap, applies_to_delivery, free_delivery,
            status, start_time, end_time, banner_label, banner_color, countdown_visible,
            created_by, created_at, updated_at
        ) VALUES (?, 'FLASH20', 'Grand Store Opening Flash Sale',
            'Get 20% discount on all store purchases + 50% off road delivery fee!',
            'PERCENTAGE_DISCOUNT', 20.0, 'ALL', '[]',
            1000.0, 5000.0, 1, 0, 'ACTIVE', ?, ?, 'FLASH SALE ⚡', '#B91C1C', 1,
            ?, ?, ?)
    """, (str(uuid.uuid4()), now.isoformat(), end_time.isoformat(), "u-admin-1", now_iso, now_iso))

    conn.commit()
    conn.close()
    print("Database seeded with clean production data!")
