import uuid
import secrets
from datetime import datetime, timezone
from app.database import get_db_connection
from app.security import hash_password

def populate_diverse_market():
    conn = get_db_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Clean up medicine category
    cursor.execute("DELETE FROM subcategories WHERE category_id = 'cat-phar'")
    cursor.execute("DELETE FROM categories WHERE id = 'cat-phar'")

    # 2. Add Real Estate, Building Materials, Home Appliances
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

    # 3. Add Real Estate & Building Materials Vendors & Stores
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
        }
    ]

    for v in vendors_data:
        cursor.execute("INSERT OR REPLACE INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'VENDOR', 'ACTIVE', 'Vendor', ?, ?)", (v["uid"], v["uref"], v["name"], v["email"], v["phone"], hash_password(v["pwd"]), now_iso, now_iso))
        cursor.execute("INSERT OR REPLACE INTO vendors (id, user_id, business_name, business_type, registration_number, bank_name, account_number, account_name, kyc_status, commission_rate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 10.0, ?, ?)", (v["vid"], v["uid"], v["bname"], v["btype"], v["reg"], v["bank"], v["acc"], v["name"], now_iso, now_iso))
        cursor.execute("INSERT OR REPLACE INTO stores (id, vendor_id, store_name, slug, description, category, address, city, state, latitude, longitude, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'Lagos', 'Lagos State', ?, ?, 1, ?, ?)", (v["sid"], v["vid"], v["sname"], v["slug"], f"Official store of {v['bname']}", v["cat"], v["addr"], v["lat"], v["lng"], now_iso, now_iso))
        cursor.execute("INSERT OR REPLACE INTO wallets (id, user_id, balance, currency, updated_at) VALUES (?, ?, 25000.0, 'NGN', ?)", (str(uuid.uuid4()), v["uid"], now_iso))

    products_data = [
        ("p-land-1", "RP-PRD-401", "s-4", "cat-land", "sub-land-1", "500sqm Prime Dry Residential Plot (Ibeju-Lekki)", "100% dry table land located inside a fully gated perimeter estate along the expanding Lekki-Epe expressway corridor with instant allocation and deed of assignment.", "SKU-LAND-500SQM", 4500000.0, 4200000.0, 8, "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=500"),
        ("p-land-2", "RP-PRD-402", "s-4", "cat-land", "sub-land-2", "1 Full Hectare (2.5 Acres) Agricultural Farmland (Epe)", "Fertile agricultural farmland suitable for mechanized farming, agro-processing, poultry, or long-term investment with registered survey and excision.", "SKU-LAND-1HECTARE", 8200000.0, 7800000.0, 4, "https://images.unsplash.com/photo-1500076656116-558758c991c1?w=500"),
        ("p-land-3", "RP-PRD-403", "s-4", "cat-land", "sub-land-3", "Luxury 4-Bedroom Contemporary Terrace Duplex (Lekki)", "Fully finished 4-bedroom terrace duplex with private BQ, fitted European kitchen, stamped concrete floor, solar inverter system, and 24/7 security.", "SKU-EST-DUPLEX-04", 65000000.0, 62000000.0, 2, "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=500"),
        ("p-build-1", "RP-PRD-501", "s-5", "cat-build", "sub-build-1", "9-Inch Vibrated Sandcrete Hollow Blocks (Pack of 100)", "Machine-compressed 9-inch load-bearing vibrated hollow sandcrete blocks manufactured with sharp river sand and high-strength Dangote cement.", "SKU-BLK-9INCH-100", 45000.0, 42000.0, 50, "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=500"),
        ("p-build-2", "RP-PRD-502", "s-5", "cat-build", "sub-build-2", "Dangote 3X 50kg Portland Limestone Cement (50 Bags Bundle)", "Grade 42.5N rapid-hardening cement bundle for multi-storey building columns, slabs, casting, and plastering with site delivery.", "SKU-CEM-DANG-50B", 380000.0, 370000.0, 20, "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500"),
        ("p-build-3", "RP-PRD-503", "s-5", "cat-build", "sub-build-3", "16mm TMT High-Yield Deformed Iron Rods (1 Tonne Bundle)", "Certified 16mm high-yield structural reinforcing rebar steel rods for foundation, pillars, and suspended beam decking.", "SKU-ROD-16MM-TON", 1150000.0, 1100000.0, 15, "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=500")
    ]

    for pid, pref, sid, cid, subid, pname, pdesc, psku, price, disc, stock, pimg in products_data:
        cursor.execute("INSERT OR REPLACE INTO products (id, product_ref, store_id, category_id, subcategory_id, name, description, sku, price, discount_price, stock_qty, image_url, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)", (pid, pref, sid, cid, subid, pname, pdesc, psku, price, disc, stock, pimg, now_iso, now_iso))

    conn.commit()
    conn.close()
    print("[SUCCESS] Real Estate, Hectares, Lands, Building Materials & Blocks populated into RushingPoint!")

if __name__ == "__main__":
    populate_diverse_market()
