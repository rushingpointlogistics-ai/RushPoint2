import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "rushingpoint.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")   # Write-Ahead Logging — allows concurrent reads during writes
    conn.execute("PRAGMA synchronous = NORMAL")  # Faster writes without sacrificing crash safety
    conn.execute("PRAGMA busy_timeout = 30000")  # Wait up to 30s before giving up on a locked db
    return conn

def init_db():

    # Dedicated Virtual Account Columns for Wallets
    try:
        cursor.execute("ALTER TABLE wallets ADD COLUMN dedicated_bank_name TEXT DEFAULT 'Wema Bank (Flutterwave)'")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE wallets ADD COLUMN dedicated_account_number TEXT DEFAULT NULL")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE wallets ADD COLUMN dedicated_account_name TEXT DEFAULT NULL")
    except Exception:
        pass

    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        user_ref TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        account_type TEXT NOT NULL, -- ADMIN, STAFF, VENDOR, RIDER, CUSTOMER
        status TEXT NOT NULL DEFAULT 'ACTIVE', -- PENDING, UNDER_REVIEW, ACTIVE, SUSPENDED, DISABLED, REJECTED
        role_name TEXT NOT NULL DEFAULT 'Customer',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

    # 2. Roles & Permissions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        permissions_json TEXT NOT NULL, -- JSON array of permission strings
        created_at TEXT NOT NULL
    )
    """)

    # 3. 5-Minute Expiring Admin Invite Links (For Vendors & Riders)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_invite_links (
        id TEXT PRIMARY KEY,
        invite_token TEXT UNIQUE NOT NULL,
        target_role TEXT NOT NULL, -- VENDOR, RIDER
        recipient_name TEXT,
        recipient_email TEXT,
        recipient_phone TEXT,
        created_by_admin_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL, -- strictly created_at + 5 minutes
        is_used INTEGER NOT NULL DEFAULT 0,
        used_at TEXT,
        FOREIGN KEY (created_by_admin_id) REFERENCES users (id)
    )
    """)

    # 4. Vendors & Stores
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vendors (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        business_name TEXT NOT NULL,
        business_type TEXT NOT NULL,
        registration_number TEXT,
        tax_id TEXT,
        bank_name TEXT,
        account_number TEXT,
        account_name TEXT,
        kyc_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, UNDER_REVIEW, APPROVED, REJECTED
        kyc_notes TEXT,
        commission_rate REAL DEFAULT 10.0, -- Default 10%
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stores (
        id TEXT PRIMARY KEY,
        vendor_id TEXT UNIQUE NOT NULL,
        store_name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        logo_url TEXT,
        banner_url TEXT,
        custom_delivery_fee REAL DEFAULT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (vendor_id) REFERENCES vendors (id)
    )
    """)

    # Check for custom_delivery_fee column migration on existing databases
    try:
        cursor.execute("ALTER TABLE stores ADD COLUMN custom_delivery_fee REAL DEFAULT NULL")
    except Exception:
        pass

    # Users transaction PIN migration
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN transaction_pin_hash TEXT DEFAULT NULL")
    except Exception:
        pass

    except Exception:
        pass

    # 5. Categories & Subcategories (Admin Controlled Only)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        icon TEXT,
        image_url TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS subcategories (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories (id)
    )
    """)

    # 6. Products
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        product_ref TEXT UNIQUE NOT NULL,
        store_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        subcategory_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        sku TEXT UNIQUE NOT NULL,
        price REAL NOT NULL,
        discount_price REAL,
        stock_qty INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, DRAFT, DISABLED, OUT_OF_STOCK
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (store_id) REFERENCES stores (id),
        FOREIGN KEY (category_id) REFERENCES categories (id),
        FOREIGN KEY (subcategory_id) REFERENCES subcategories (id)
    )
    """)

    # 7. Riders Fleet
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS riders (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        rider_ref TEXT UNIQUE NOT NULL,
        rider_type TEXT NOT NULL DEFAULT 'INTERNAL', -- INTERNAL, EXTERNAL_PARTNER
        vehicle_type TEXT NOT NULL, -- MOTORCYCLE, BICYCLE, VAN, CAR
        plate_number TEXT NOT NULL,
        license_number TEXT NOT NULL,
        kyc_status TEXT NOT NULL DEFAULT 'APPROVED', -- PENDING, APPROVED, REJECTED
        operational_status TEXT NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, APPROACHING_PICKUP, ON_DELIVERY, DELAYED_PROBLEM, OFFLINE
        current_lat REAL,
        current_lng REAL,
        last_ping_at TEXT,
        rating REAL DEFAULT 5.0,
        total_deliveries INTEGER DEFAULT 0,
        wallet_balance REAL DEFAULT 0.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)

    # 8. Orders & State Transitions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_ref TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        rider_id TEXT,
        subtotal REAL NOT NULL,
        delivery_fee REAL NOT NULL,
        platform_fee REAL NOT NULL DEFAULT 0.0,
        total_amount REAL NOT NULL,
        delivery_address TEXT NOT NULL,
        delivery_lat REAL,
        delivery_lng REAL,
        customer_phone TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'WALLET', -- WALLET, CARD, CASH_ON_DELIVERY
        payment_status TEXT NOT NULL DEFAULT 'PAID', -- PENDING, PAID, FAILED, REFUNDED
        status TEXT NOT NULL DEFAULT 'NEW', -- NEW, CONFIRMED, ASSIGNED, PICKED_UP, IN_TRANSIT, ARRIVED, DELIVERED, CANCELLED, FAILED, RETURNED, RESCHEDULED
        pod_otp TEXT, -- 4-digit OTP for delivery verification
        pod_signature TEXT,
        pod_photo_url TEXT,
        pod_notes TEXT,
        pod_verified_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES users (id),
        FOREIGN KEY (store_id) REFERENCES stores (id),
        FOREIGN KEY (rider_id) REFERENCES riders (id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        unit_price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        total_price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id),
        FOREIGN KEY (product_id) REFERENCES products (id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS order_timeline (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        notes TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id)
    )
    """)

    # 9. 4-Way Financial Ledger & Settlements
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS financial_settlements (
        id TEXT PRIMARY KEY,
        settlement_ref TEXT UNIQUE NOT NULL,
        order_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        rider_id TEXT,
        total_customer_paid REAL NOT NULL,
        vendor_amount REAL NOT NULL,
        rider_earnings REAL NOT NULL,
        platform_revenue REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'CLEARED', -- ESCROW_HELD, CLEARED, REFUNDED_REVERSED, ADJUSTED
        created_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        balance REAL NOT NULL DEFAULT 0.0,
        currency TEXT NOT NULL DEFAULT 'NGN',
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS wallet_transactions (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        reference TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL, -- CREDIT, DEBIT, REFUND, ADJUSTMENT, PAYOUT
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        running_balance REAL NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (wallet_id) REFERENCES wallets (id)
    )
    """)

    # 10. Independent Logistics Engine
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS logistics_requests (
        id TEXT PRIMARY KEY,
        request_ref TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        item_description TEXT NOT NULL,
        package_size TEXT NOT NULL, -- SMALL, MEDIUM, LARGE, HEAVY
        pickup_address TEXT NOT NULL,
        pickup_contact TEXT NOT NULL,
        pickup_lat REAL,
        pickup_lng REAL,
        dropoff_address TEXT NOT NULL,
        dropoff_contact TEXT NOT NULL,
        dropoff_lat REAL,
        dropoff_lng REAL,
        distance_km REAL NOT NULL,
        estimated_price REAL NOT NULL,
        rider_id TEXT,
        status TEXT NOT NULL DEFAULT 'REQUESTED', -- REQUESTED, QUOTED, PAID, ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, CANCELLED
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES users (id),
        FOREIGN KEY (rider_id) REFERENCES riders (id)
    )
    """)

    # 11. Support Tickets
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY,
        ticket_ref TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        order_id TEXT,
        category TEXT NOT NULL, -- MISSING_ITEM, DAMAGED_ITEM, DELIVERY_DELAY, REFUND_REQUEST, OTHER
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, URGENT
        status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, RESOLVED, CLOSED
        assigned_staff_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ticket_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_role TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (ticket_id) REFERENCES support_tickets (id)
    )
    """)

    # 12. Audit Logs (Immutable)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details_json TEXT,
        ip_address TEXT DEFAULT '127.0.0.1',
        created_at TEXT NOT NULL
    )
    """)

    # 13. System Settings & Delivery Zone Config
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TEXT NOT NULL
    )
    """)

    # 14. Notifications Hub
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        category TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)

    # 15. Delivery Zones
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS delivery_zones (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        base_fee REAL NOT NULL DEFAULT 800.0,
        per_km_rate REAL NOT NULL DEFAULT 150.0,
        min_distance_km REAL NOT NULL DEFAULT 2.0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    )
    """)

    # 16. Platform Expenses
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        expense_ref TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL, -- FUEL, MAINTENANCE, LOGISTICS, TECH, SALARY, OTHER
        amount REAL NOT NULL,
        notes TEXT,
        recorded_by TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    # Graceful column migrations for SQLite
    def add_col_if_missing(table, col, col_type):
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
        except Exception:
            pass

    add_col_if_missing("vendors", "cac_doc_url", "TEXT")
    add_col_if_missing("vendors", "id_card_url", "TEXT")
    add_col_if_missing("vendors", "utility_bill_url", "TEXT")
    add_col_if_missing("vendors", "onboarding_step", "INTEGER DEFAULT 4")

    add_col_if_missing("riders", "driver_license_url", "TEXT")
    add_col_if_missing("riders", "national_id_url", "TEXT")
    add_col_if_missing("riders", "profile_photo_url", "TEXT")

    add_col_if_missing("orders", "cancellation_reason", "TEXT")
    add_col_if_missing("orders", "rescheduled_eta", "TEXT")

    add_col_if_missing("logistics_requests", "pickup_otp", "TEXT")
    add_col_if_missing("logistics_requests", "pickup_photo_url", "TEXT")
    add_col_if_missing("logistics_requests", "pickup_notes", "TEXT")
    add_col_if_missing("logistics_requests", "pickup_completed_at", "TEXT")
    add_col_if_missing("logistics_requests", "weight_kg", "REAL DEFAULT 1.0")
    add_col_if_missing("logistics_requests", "pay_rider_before_delivery", "INTEGER DEFAULT 0")
    add_col_if_missing("logistics_requests", "payment_link", "TEXT")

    add_col_if_missing("products", "is_featured", "INTEGER DEFAULT 0")
    add_col_if_missing("products", "review_status", "TEXT DEFAULT 'APPROVED'")
    add_col_if_missing("users", "phone_verified", "INTEGER DEFAULT 1")

    # Vendor Partnership Requests (from public landing page)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vendor_requests (
        id TEXT PRIMARY KEY,
        request_ref TEXT UNIQUE NOT NULL,
        business_name TEXT NOT NULL,
        business_type TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        whatsapp TEXT,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, CONTACTED, APPROVED, REJECTED
        admin_notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)


    # PROMOS & FLASH SALES (Temu-style time-limited promotions)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS promos (
        id TEXT PRIMARY KEY,
        promo_ref TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        promo_type TEXT NOT NULL, -- PERCENTAGE_DISCOUNT, FIXED_DISCOUNT, FREE_DELIVERY, FLASH_SALE
        discount_value REAL NOT NULL DEFAULT 0.0,
        scope TEXT NOT NULL DEFAULT 'ALL', -- ALL, SPECIFIC_VENDORS, SPECIFIC_PRODUCTS, SPECIFIC_CATEGORIES
        target_ids TEXT, -- JSON array of vendor_ids or product_ids or category_ids
        min_order_amount REAL NOT NULL DEFAULT 0.0,
        max_discount_cap REAL, -- maximum discount capped at this NGN value
        applies_to_delivery INTEGER NOT NULL DEFAULT 0, -- 1 = also discounts delivery fee
        free_delivery INTEGER NOT NULL DEFAULT 0, -- 1 = completely free delivery
        max_uses INTEGER, -- NULL = unlimited
        uses_per_user INTEGER NOT NULL DEFAULT 1,
        total_used INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED, ACTIVE, EXPIRED, PAUSED, CANCELLED
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        banner_label TEXT, -- e.g. "BLACK FRIDAY", "FLASH SALE"
        banner_color TEXT DEFAULT '#B91C1C', -- banner background
        countdown_visible INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS promo_usages (
        id TEXT PRIMARY KEY,
        promo_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        order_id TEXT,
        discount_applied REAL NOT NULL DEFAULT 0.0,
        used_at TEXT NOT NULL,
        FOREIGN KEY (promo_id) REFERENCES promos (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)

    conn.commit()
    conn.close()
    print("RushingPoint V1.0 Database schemas initialized successfully.")

if __name__ == "__main__":
    init_db()
