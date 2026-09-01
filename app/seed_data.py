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
        print("Database is already seeded with initial records.")
        conn.close()
        return

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    yesterday_iso = (now - timedelta(days=1)).isoformat()
    
    print("Seeding initial RushingPoint V1.0 master data...")

    # 1. System Settings
    settings = [
        ("base_delivery_fee", "1200.0", "Base delivery booking charge in NGN"),
        ("per_km_rate", "120.0", "Per kilometer pricing rate in NGN"),
        ("default_vendor_commission", "10.0", "Default marketplace commission percentage (10%)"),
        ("rider_delivery_split_pct", "80.0", "Percentage of delivery fee awarded to rider (80%)"),
        ("surge_multiplier", "1.0", "Active surge multiplier for high demand hours"),
        ("flutterwave_client_id", "ce13bd3d-08af-496e-8bf9-37ec62f69819", "Flutterwave Client ID"),
        ("flutterwave_secret_key", "Tr7wTwOvbk8vlbJOBVd4m37dYBqijPkJ", "Flutterwave Live Secret Key"),
        ("flutterwave_encryption_key", "yr8VlYO/iNhS/Kgd5t3MSlvJE7o6H5AbZr97vc6hFCg=", "Flutterwave Encryption Key"),
        ("flutterwave_secret_hash", "Atajrajah@123", "Flutterwave Webhook Verification Secret Hash"),
        ("flutterwave_webhook_url", "https://api.rushingpoint.com/webhooks/flutterwave", "Configured Flutterwave Webhook Endpoint URL"),
        ("flutterwave_mode", "LIVE", "Active payment gateway operating mode (LIVE/SANDBOX)"),
        ("webhook_failed_enabled", "true", "Enable webhook processing for failed transactions"),
        ("webhook_refunds_enabled", "true", "Enable webhook processing for refunds and chargebacks")
    ]
    for k, v, d in settings:
        cursor.execute("INSERT OR REPLACE INTO system_settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)", (k, v, d, now_iso))

    # 2. Roles
    roles = [
        ("r-super-admin", "Super Admin", "Full unconstrained administrative override", '["*"]'),
        ("r-ops-manager", "Operations Manager", "Manages platform operations and logistics", '["marketplace.*", "orders.*", "dispatch.*", "riders.*"]'),
        ("r-dispatcher", "Dispatcher", "Manages active deliveries and rider assignments", '["dispatch.*", "orders.*", "riders.read"]'),
        ("r-finance-officer", "Finance Officer", "Manages ledger, settlements, and payouts", '["finance.*", "orders.read"]'),
        ("r-vendor-manager", "Vendor Manager", "Handles vendor onboarding and KYC review", '["vendors.*", "marketplace.stores"]'),
        ("r-customer-support", "Customer Support", "Handles customer support tickets and disputes", '["support.*", "orders.read", "customers.read"]')
    ]
    for rid, name, desc, perms in roles:
        cursor.execute("INSERT OR REPLACE INTO roles (id, name, description, permissions_json, created_at) VALUES (?, ?, ?, ?, ?)", (rid, name, desc, perms, now_iso))

    # 3. Core Administrative Users
    admin_users = [
        ("u-admin-1", "RP-ADM-001", "Chief Super Admin", "admin@rushingpoint.com", "+2348000000001", hash_password("admin123"), "ADMIN", "Super Admin"),
        ("u-ops-1", "RP-STF-001", "Chidi Okafor (Ops)", "ops@rushingpoint.com", "+2348000000002", hash_password("ops123"), "STAFF", "Operations Manager"),
        ("u-disp-1", "RP-STF-002", "Babatunde Lawal (Dispatch)", "dispatch@rushingpoint.com", "+2348000000003", hash_password("dispatch123"), "STAFF", "Dispatcher"),
        ("u-fin-1", "RP-STF-003", "Ngozi Adeleke (Finance)", "finance@rushingpoint.com", "+2348000000004", hash_password("finance123"), "STAFF", "Finance Officer"),
        ("u-sup-1", "RP-STF-004", "Fatima Bello (Support)", "support@rushingpoint.com", "+2348000000005", hash_password("support123"), "STAFF", "Customer Support")
    ]
    for uid, uref, fname, email, phone, pwd, atype, rname in admin_users:
        cursor.execute("""
            INSERT OR REPLACE INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, phone_verified, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 1, ?, ?)
        """, (uid, uref, fname, email, phone, pwd, atype, rname, now_iso, now_iso))
        
        # Wallets for staff
        w_exists = cursor.execute("SELECT id FROM wallets WHERE user_id = ?", (uid,)).fetchone()
        if not w_exists:
            cursor.execute("INSERT INTO wallets (id, user_id, balance, currency, updated_at) VALUES (?, ?, 0.0, 'NGN', ?)", (str(uuid.uuid4()), uid, now_iso))

    # 4. Admin-Controlled Categories & Subcategories (Strictly Excluding Medicine)
    categories_data = [
        ("cat-land", "Real Estate, Land & Estates", "real-estate-land-estates", "map-pin", "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=500", 1),
        ("cat-build", "Building Materials & Blocks", "building-materials-and-blocks", "box", "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=500", 2),
        ("cat-food", "Food & Quick Bites", "food-and-quick-bites", "utensils", "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500", 3),
        ("cat-groc", "Groceries & Supermarket", "groceries-and-supermarket", "shopping-cart", "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500", 4),
        ("cat-tech", "Phones & Electronics", "phones-and-electronics", "tv", "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=500", 5),
        ("cat-fash", "Fashion & Apparel", "fashion-and-apparel", "shirt", "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=500", 6),
        ("cat-house", "Home & Appliances", "home-and-appliances", "home", "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=500", 7)
    ]
    for cid, cname, cslug, cicon, cimg, csort in categories_data:
        cursor.execute("INSERT OR REPLACE INTO categories (id, name, slug, icon, image_url, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)", (cid, cname, cslug, cicon, cimg, csort, now_iso, now_iso))

    subcategories_data = [
        ("sub-land-1", "cat-land", "Dry Residential Plots (500sqm+)", "residential-plots"),
        ("sub-land-2", "cat-land", "Agricultural Farmlands (Hectares)", "agricultural-farmlands"),
        ("sub-land-3", "cat-land", "Commercial Estates & Duplexes", "commercial-estates"),
        ("sub-build-1", "cat-build", "Sandcrete Vibrated Blocks", "sandcrete-blocks"),
        ("sub-build-2", "cat-build", "Cement & Aggregate Bags", "cement-aggregate"),
        ("sub-build-3", "cat-build", "Iron Rods & Structural Steel", "iron-rods-steel"),
        ("sub-food-1", "cat-food", "Hot Grills & Sharwama", "hot-grills"),
        ("sub-food-2", "cat-food", "Rice & Continental Dishes", "rice-continental"),
        ("sub-groc-1", "cat-groc", "Fresh Fruits & Farm Veggies", "fresh-fruits"),
        ("sub-groc-2", "cat-groc", "Packaged Pantry Staples", "pantry-staples"),
        ("sub-tech-1", "cat-tech", "Smartphones & Tablets", "smartphones"),
        ("sub-tech-2", "cat-tech", "Audio & Accessories", "audio-accessories"),
        ("sub-fash-1", "cat-fash", "Men's Sneakers & Footwear", "mens-sneakers"),
        ("sub-house-1", "cat-house", "Kitchen & Home Appliances", "home-appliances")
    ]
    for sid, cid, sname, sslug in subcategories_data:
        cursor.execute("INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)", (sid, cid, sname, sslug, now_iso))

    # 5. Vendors, Stores & Products
    vendors_data = [
        {
            "uid": "u-vnd-4", "uref": "RP-VND-1004", "name": "Alhaji Garba Danladi", "email": "estates@rushingpoint.com", "phone": "+2348033330004", "pwd": "vendor123",
            "vid": "v-4", "bname": "Prime Acres & Mega Estates Ltd", "btype": "Real Estate & Land Development", "reg": "RC-551122", "bank": "First Bank of Nigeria", "acc": "3091182741",
            "sid": "s-4", "sname": "Prime Acres & Lekki-Epe Lands", "slug": "prime-acres-lekki-epe-lands", "cat": "Real Estate, Land & Estates", "addr": "Plot 12, Lekki-Epe Expressway, Ibeju-Lekki, Lagos",
            "lat": 6.4821, "lng": 3.6120
        },
        {
            "uid": "u-vnd-5", "uref": "RP-VND-1005", "name": "Chief Sunday Okoro", "email": "materials@rushingpoint.com", "phone": "+2348033330005", "pwd": "vendor123",
            "vid": "v-5", "bname": "Alaba Standard Blocks & Building Materials", "btype": "Building Materials Depot", "reg": "RC-663344", "bank": "Access Bank", "acc": "0812993847",
            "sid": "s-5", "sname": "Alaba Sandcrete Blocks & Cement Depot", "slug": "alaba-blocks-cement-depot", "cat": "Building Materials & Blocks", "addr": "Stall 28, Block B, Building Materials Market, Orile, Lagos",
            "lat": 6.4710, "lng": 3.3411
        },
        {
            "uid": "u-vnd-1", "uref": "RP-VND-1001", "name": "Emeka Chukwudi", "email": "vendor@rushingpoint.com", "phone": "+2348033330001", "pwd": "vendor123",
            "vid": "v-1", "bname": "Tasty Kitchen Bites Ltd", "btype": "Fast Food & Grills", "reg": "RC-889911", "bank": "Guaranty Trust Bank", "acc": "0128847112",
            "sid": "s-1", "sname": "Tasty Kitchen Bites", "slug": "tasty-kitchen-bites", "cat": "Food & Quick Bites", "addr": "Shop 14, Food Court Promenade, 18 Admiralty Way, Lekki Phase 1, Lagos",
            "lat": 6.4474, "lng": 3.4723
        },
        {
            "uid": "u-vnd-2", "uref": "RP-VND-1002", "name": "Amina Danjuma", "email": "groceries@rushingpoint.com", "phone": "+2348033330002", "pwd": "vendor123",
            "vid": "v-2", "bname": "Mega Groceries Direct", "btype": "Supermarket Retail", "reg": "RC-772211", "bank": "Zenith Bank", "acc": "1019948271",
            "sid": "s-2", "sname": "Mega Groceries Hub", "slug": "mega-groceries-hub", "cat": "Groceries & Supermarket", "addr": "Stall 5, Fresh Market Mall, 45 Isaac John St, Ikeja GRA, Lagos",
            "lat": 6.5861, "lng": 3.3578
        },
        {
            "uid": "u-vnd-3", "uref": "RP-VND-1003", "name": "Tunde Bakare", "email": "gadgets@rushingpoint.com", "phone": "+2348033330003", "pwd": "vendor123",
            "vid": "v-3", "bname": "Gadget Vault Nigeria", "btype": "Electronics Wholesale", "reg": "RC-445566", "bank": "Access Bank", "acc": "0691128394",
            "sid": "s-3", "sname": "Gadget Vault Lagos", "slug": "gadget-vault-lagos", "cat": "Phones & Electronics", "addr": "Shop 8, Tech Plaza, 12 Otigba Street, Computer Village, Ikeja",
            "lat": 6.5983, "lng": 3.3421
        }
    ]

    for v in vendors_data:
        cursor.execute("""
            INSERT OR REPLACE INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'VENDOR', 'ACTIVE', 'Vendor', ?, ?)
        """, (v["uid"], v["uref"], v["name"], v["email"], v["phone"], hash_password(v["pwd"]), now_iso, now_iso))
        
        cursor.execute("""
            INSERT OR REPLACE INTO vendors (id, user_id, business_name, business_type, registration_number, bank_name, account_number, account_name, kyc_status, commission_rate, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 10.0, ?, ?)
        """, (v["vid"], v["uid"], v["bname"], v["btype"], v["reg"], v["bank"], v["acc"], v["name"], now_iso, now_iso))
        
        cursor.execute("""
            INSERT OR REPLACE INTO stores (id, vendor_id, store_name, slug, description, category, address, city, state, latitude, longitude, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Lagos', 'Lagos State', ?, ?, 1, ?, ?)
        """, (v["sid"], v["vid"], v["sname"], v["slug"], f"Official store of {v['bname']}", v["cat"], v["addr"], v["lat"], v["lng"], now_iso, now_iso))
        
        cursor.execute("INSERT OR REPLACE INTO wallets (id, user_id, balance, currency, updated_at) VALUES (?, ?, 0.0, 'NGN', ?)", (str(uuid.uuid4()), v["uid"], now_iso))

    # Products catalog (Featuring Real Estate, Hectares, Building Materials, Blocks, Food, Gadgets, Groceries)
    products_data = [
        # Real Estate & Hectares
        ("p-land-1", "RP-PRD-401", "s-4", "cat-land", "sub-land-1", "500sqm Prime Dry Residential Plot (Ibeju-Lekki)", "100% dry table land located inside a fully gated perimeter estate along the expanding Lekki-Epe expressway corridor with instant allocation and deed of assignment.", "SKU-LAND-500SQM", 4500000.0, 4200000.0, 8, "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=500"),
        ("p-land-2", "RP-PRD-402", "s-4", "cat-land", "sub-land-2", "1 Full Hectare (2.5 Acres) Agricultural Farmland (Epe)", "Fertile agricultural farmland suitable for mechanized farming, agro-processing, poultry, or long-term investment with registered survey and excision.", "SKU-LAND-1HECTARE", 8200000.0, 7800000.0, 4, "https://images.unsplash.com/photo-1500076656116-558758c991c1?w=500"),
        ("p-land-3", "RP-PRD-403", "s-4", "cat-land", "sub-land-3", "Luxury 4-Bedroom Contemporary Terrace Duplex (Lekki)", "Fully finished 4-bedroom terrace duplex with private BQ, fitted European kitchen, stamped concrete floor, solar inverter system, and 24/7 security.", "SKU-EST-DUPLEX-04", 65000000.0, 62000000.0, 2, "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=500"),

        # Building Materials & Blocks
        ("p-build-1", "RP-PRD-501", "s-5", "cat-build", "sub-build-1", "9-Inch Vibrated Sandcrete Hollow Blocks (Pack of 100)", "Machine-compressed 9-inch load-bearing vibrated hollow sandcrete blocks manufactured with sharp river sand and high-strength Dangote cement.", "SKU-BLK-9INCH-100", 45000.0, 42000.0, 50, "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=500"),
        ("p-build-2", "RP-PRD-502", "s-5", "cat-build", "sub-build-2", "Dangote 3X 50kg Portland Limestone Cement (50 Bags Bundle)", "Grade 42.5N rapid-hardening cement bundle for multi-storey building columns, slabs, casting, and plastering with site delivery.", "SKU-CEM-DANG-50B", 380000.0, 370000.0, 20, "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500"),
        ("p-build-3", "RP-PRD-503", "s-5", "cat-build", "sub-build-3", "16mm TMT High-Yield Deformed Iron Rods (1 Tonne Bundle)", "Certified 16mm high-yield structural reinforcing rebar steel rods for foundation, pillars, and suspended beam decking.", "SKU-ROD-16MM-TON", 1150000.0, 1100000.0, 15, "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=500"),

        # Food & Bites
        ("p-1", "RP-PRD-101", "s-1", "cat-food", "sub-food-1", "Special Grilled Chicken & Chips Combo", "Crispy golden fried potatoes served with savory flame-grilled quarter chicken and spicy dip.", "SKU-FOOD-001", 4500.0, 4000.0, 45, "https://images.unsplash.com/photo-1562967914-608f82629710?w=500"),
        ("p-2", "RP-PRD-102", "s-1", "cat-food", "sub-food-2", "Jollof Rice Fiesta Bowl with Beef Suya", "Signature smoky Nigerian party jollof rice served with plantain and tender seasoned suya beef.", "SKU-FOOD-002", 3800.0, None, 30, "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500"),
        ("p-3", "RP-PRD-103", "s-1", "cat-food", "sub-food-1", "Double Beef Gourmet Burger with Bacon", "Juicy double quarter-pound patties with melted cheddar, crisp lettuce, and special onion relish.", "SKU-FOOD-003", 5200.0, 4800.0, 25, "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500"),
        
        # Groceries
        ("p-4", "RP-PRD-201", "s-2", "cat-groc", "sub-groc-1", "Organic Farm Fresh Vegetable Basket", "Handpicked basket containing fresh spinach, tomatoes, bell peppers, carrots, and organic onions.", "SKU-GROC-001", 6500.0, 5900.0, 50, "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500"),
        ("p-5", "RP-PRD-202", "s-2", "cat-groc", "sub-groc-2", "Golden Premium Basmati Rice 5KG", "Long grain aromatic aged basmati rice for royal dining and daily quality cooking.", "SKU-GROC-002", 12500.0, 11800.0, 40, "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500"),

        # Electronics
        ("p-7", "RP-PRD-301", "s-3", "cat-tech", "sub-tech-2", "Wireless ANC Over-Ear Bluetooth Headphones", "Active noise cancelling with 40-hour battery life, deep bass response, and studio microphone.", "SKU-TECH-001", 35000.0, 32000.0, 15, "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500"),
        ("p-8", "RP-PRD-302", "s-3", "cat-tech", "sub-tech-1", "Ultra Slim Fast-Charge Power Bank 30,000mAh", "Dual USB-C PD 65W fast charging support for smartphones, tablets, and laptops.", "SKU-TECH-002", 18500.0, 16900.0, 35, "https://images.unsplash.com/photo-1609592424368-80956cfa1902?w=500")
    ]
    for pid, pref, sid, cid, subid, pname, pdesc, psku, price, disc, stock, pimg in products_data:
        cursor.execute("""
            INSERT INTO products (id, product_ref, store_id, category_id, subcategory_id, name, description, sku, price, discount_price, stock_qty, image_url, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        """, (pid, pref, sid, cid, subid, pname, pdesc, psku, price, disc, stock, pimg, now_iso, now_iso))

    # 6. Riders Fleet (Motorcycles, Tricycles / Keke Cargo, and Vans - Internal & External)
    riders_data = [
        {
            "uid": "u-rdr-1", "uref": "RP-RDR-701", "name": "Kayode Adeleke (Internal Bike)", "email": "rider@rushingpoint.com", "phone": "+2348055550001", "pwd": "rider123",
            "rid": "r-1", "type": "INTERNAL", "vtype": "MOTORCYCLE", "plate": "LAG-782-KT", "lic": "DL-908172", "status": "AVAILABLE", "lat": 6.4531, "lng": 3.4682, "rating": 4.9, "trips": 0
        },
        {
            "uid": "u-rdr-2", "uref": "RP-RDR-702", "name": "Ibrahim Musa (Internal Tricycle Cargo)", "email": "rider2@rushingpoint.com", "phone": "+2348055550002", "pwd": "rider123",
            "rid": "r-2", "type": "INTERNAL", "vtype": "TRICYCLE", "plate": "KT-419-KEKE", "lic": "DL-554129", "status": "AVAILABLE", "lat": 6.4720, "lng": 3.3420, "rating": 4.8, "trips": 0
        },
        {
            "uid": "u-rdr-3", "uref": "RP-RDR-703", "name": "Samuel Okon (External Partner Van)", "email": "rider3@rushingpoint.com", "phone": "+2348055550003", "pwd": "rider123",
            "rid": "r-3", "type": "EXTERNAL_PARTNER", "vtype": "VAN", "plate": "ABJ-901-YZ", "lic": "DL-334991", "status": "AVAILABLE", "lat": 6.5244, "lng": 3.3792, "rating": 4.7, "trips": 0
        },
        {
            "uid": "u-rdr-4", "uref": "RP-RDR-704", "name": "Usman Katsina (Partner Tricycle)", "email": "rider4@rushingpoint.com", "phone": "+2348055550004", "pwd": "rider123",
            "rid": "r-4", "type": "EXTERNAL_PARTNER", "vtype": "TRICYCLE", "plate": "KT-882-TRK", "lic": "DL-771822", "status": "AVAILABLE", "lat": 6.4800, "lng": 3.3500, "rating": 4.9, "trips": 0
        }
    ]
    for r in riders_data:
        cursor.execute("""
            INSERT OR REPLACE INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, phone_verified, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'RIDER', 'ACTIVE', 'Rider', 1, ?, ?)
        """, (r["uid"], r["uref"], r["name"], r["email"], r["phone"], hash_password(r["pwd"]), now_iso, now_iso))
        
        cursor.execute("""
            INSERT OR REPLACE INTO riders (id, user_id, rider_ref, rider_type, vehicle_type, plate_number, license_number, kyc_status, operational_status, current_lat, current_lng, last_ping_at, rating, total_deliveries, wallet_balance, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?, ?, ?, ?, 0.0, ?, ?)
        """, (r["rid"], r["uid"], r["uref"], r["type"], r["vtype"], r["plate"], r["lic"], r["status"], r["lat"], r["lng"], now_iso, r["rating"], r["trips"], now_iso, now_iso))
        
        w_exists = cursor.execute("SELECT id FROM wallets WHERE user_id = ?", (r["uid"],)).fetchone()
        if not w_exists:
            cursor.execute("INSERT INTO wallets (id, user_id, balance, currency, updated_at) VALUES (?, ?, 0.0, 'NGN', ?)", (str(uuid.uuid4()), r["uid"], now_iso))

    # 7. Customer Account (Real Initial Balance: 0.00 NGN)
    cust_uid = "u-cust-1"
    cursor.execute("""
        INSERT OR REPLACE INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, phone_verified, created_at, updated_at)
        VALUES (?, 'RP-CUS-880011', 'Tariq Al-Mansoor', 'customer@rushingpoint.com', '+2348077770001', ?, 'CUSTOMER', 'ACTIVE', 'Customer', 1, ?, ?)
    """, (cust_uid, hash_password("customer123"), now_iso, now_iso))
    
    cust_wallet = cursor.execute("SELECT id FROM wallets WHERE user_id = ?", (cust_uid,)).fetchone()
    if not cust_wallet:
        cust_wallet_id = str(uuid.uuid4())
        cursor.execute("INSERT INTO wallets (id, user_id, balance, currency, updated_at) VALUES (?, ?, 0.0, 'NGN', ?)", (cust_wallet_id, cust_uid, now_iso))

    # 8. Sample Delivered Order (with cleared 4-way settlement)
    ord1_id = "ord-delivered-01"
    ord1_ref = "RP-ORD-901122"
    cursor.execute("""
        INSERT INTO orders (id, order_ref, customer_id, store_id, rider_id, subtotal, delivery_fee, platform_fee, total_amount, delivery_address, delivery_lat, delivery_lng, customer_phone, payment_method, payment_status, status, pod_otp, pod_verified_at, created_at, updated_at)
        VALUES (?, ?, ?, 's-1', 'r-1', 4000.0, 1200.0, 150.0, 5350.0, 'Flat 4B, Victoria Crest Estate, Lekki, Lagos', 6.4410, 3.4810, '+2348077770001', 'WALLET', 'PAID', 'DELIVERED', '4912', ?, ?, ?)
    """, (ord1_id, ord1_ref, cust_uid, yesterday_iso, yesterday_iso, yesterday_iso))
    
    cursor.execute("""
        INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, total_price)
        VALUES (?, ?, 'p-1', 'Special Grilled Chicken & Chips Combo', 4000.0, 1, 4000.0)
    """, (str(uuid.uuid4()), ord1_id))
    
    cursor.execute("""
        INSERT INTO financial_settlements (id, settlement_ref, order_id, customer_id, vendor_id, rider_id, total_customer_paid, vendor_amount, rider_earnings, platform_revenue, status, created_at)
        VALUES (?, 'RP-SETTLE-88192', ?, ?, 'v-1', 'r-1', 5350.0, 3600.0, 960.0, 790.0, 'CLEARED', ?)
    """, (str(uuid.uuid4()), ord1_id, cust_uid, yesterday_iso))

    # 9. Sample Active Order (Ready for Dispatch / Live Demo)
    ord2_id = "ord-active-02"
    ord2_ref = "RP-ORD-901123"
    cursor.execute("""
        INSERT INTO orders (id, order_ref, customer_id, store_id, rider_id, subtotal, delivery_fee, platform_fee, total_amount, delivery_address, delivery_lat, delivery_lng, customer_phone, payment_method, payment_status, status, pod_otp, created_at, updated_at)
        VALUES (?, ?, ?, 's-2', 'r-2', 5900.0, 1200.0, 150.0, 7250.0, 'Block C, 14 Bourdillon Road, Ikoyi, Lagos', 6.4520, 3.4350, '+2348077770001', 'WALLET', 'PAID', 'IN_TRANSIT', '7731', ?, ?)
    """, (ord2_id, ord2_ref, cust_uid, now_iso, now_iso))

    cursor.execute("""
        INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, total_price)
        VALUES (?, ?, 'p-4', 'Organic Farm Fresh Vegetable Basket', 5900.0, 1, 5900.0)
    """, (str(uuid.uuid4()), ord2_id))

    cursor.execute("""
        INSERT INTO financial_settlements (id, settlement_ref, order_id, customer_id, vendor_id, rider_id, total_customer_paid, vendor_amount, rider_earnings, platform_revenue, status, created_at)
        VALUES (?, 'RP-SETTLE-88193', ?, ?, 'v-2', 'r-2', 7250.0, 5310.0, 960.0, 980.0, 'ESCROW_HELD', ?)
    """, (str(uuid.uuid4()), ord2_id, cust_uid, now_iso))

    cursor.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES 
        (?, ?, NULL, 'NEW', ?, 'Customer', 'Order placed & paid via wallet.', ?),
        (?, ?, 'NEW', 'CONFIRMED', 'u-vnd-2', 'Vendor', 'Mega Groceries accepted & packed.', ?),
        (?, ?, 'CONFIRMED', 'ASSIGNED', 'u-disp-1', 'Dispatcher', 'Rider Ibrahim Musa assigned.', ?),
        (?, ?, 'ASSIGNED', 'PICKED_UP', 'u-rdr-2', 'Rider', 'Package collected from store.', ?),
        (?, ?, 'PICKED_UP', 'IN_TRANSIT', 'u-rdr-2', 'Rider', 'Rider heading to Ikoyi destination.', ?)
    """, (
        str(uuid.uuid4()), ord2_id, cust_uid, now_iso,
        str(uuid.uuid4()), ord2_id, now_iso,
        str(uuid.uuid4()), ord2_id, now_iso,
        str(uuid.uuid4()), ord2_id, now_iso,
        str(uuid.uuid4()), ord2_id, now_iso
    ))

    # 10. Sample Support Ticket
    cursor.execute("""
        INSERT INTO support_tickets (id, ticket_ref, user_id, order_id, category, subject, description, priority, status, created_at, updated_at)
        VALUES (?, 'RP-TCK-50119', ?, ?, 'DELIVERY_DELAY', 'Delivery ETA inquiry', 'Just checking ETA for my evening grocery delivery.', 'MEDIUM', 'OPEN', ?, ?)
    """, (str(uuid.uuid4()), cust_uid, ord2_id, now_iso, now_iso))

    conn.commit()
    conn.close()
    print("Seeding complete: All users, roles, stores, products, orders, wallets, and settings created.")

if __name__ == "__main__":
    seed_database()
