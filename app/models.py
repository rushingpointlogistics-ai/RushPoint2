from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any

# Auth Models
class LoginRequest(BaseModel):
    login: str # Email or Phone
    password: str

class SendPhoneOtpRequest(BaseModel):
    phone: str

class VerifyPhoneOtpRequest(BaseModel):
    phone: str
    otp_code: str

class CustomerSignupRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str
    otp_code: Optional[str] = None

class GenerateInviteRequest(BaseModel):
    target_role: str # VENDOR or RIDER
    recipient_name: Optional[str] = None
    recipient_email: Optional[EmailStr] = None
    recipient_phone: Optional[str] = None

class AcceptInviteSignupRequest(BaseModel):
    invite_token: str
    full_name: str
    email: EmailStr
    phone: str
    password: str
    # Vendor specific fields
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    registration_number: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    store_name: Optional[str] = None
    store_category: Optional[str] = None
    store_address: Optional[str] = None
    # Rider specific fields
    vehicle_type: Optional[str] = None # MOTORCYCLE, BICYCLE, VAN, CAR
    plate_number: Optional[str] = None
    license_number: Optional[str] = None
    rider_type: Optional[str] = "INTERNAL"

# Category Models
class CategoryCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    icon: Optional[str] = None
    image_url: Optional[str] = None
    sort_order: Optional[int] = 0

class SubcategoryCreate(BaseModel):
    name: str
    slug: Optional[str] = None

# Product Models
class ProductCreate(BaseModel):
    name: str
    category_id: str
    subcategory_id: Optional[str] = None
    store_id: Optional[str] = None
    description: Optional[str] = None
    price: float
    discount_price: Optional[float] = None
    stock_qty: int = 10
    image_url: Optional[str] = None
    sku: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    discount_price: Optional[float] = None
    stock_qty: Optional[int] = None
    status: Optional[str] = None
    category_id: Optional[str] = None
    subcategory_id: Optional[str] = None
    description: Optional[str] = None
    sku: Optional[str] = None
    image_url: Optional[str] = None
    image_url: Optional[str] = None

# Order & Cart Models
class CartItem(BaseModel):
    product_id: str
    quantity: int

class CheckoutRequest(BaseModel):
    store_id: str
    items: List[CartItem]
    delivery_address: str
    customer_phone: Optional[str] = None
    payment_method: str = "WALLET" # WALLET, CARD, CASH_ON_DELIVERY
    delivery_lat: Optional[float] = 6.5244
    delivery_lng: Optional[float] = 3.3792

class OrderStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

class PODVerificationRequest(BaseModel):
    otp: Optional[str] = None
    signature: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None

# Logistics Request Models
class LogisticsQuoteRequest(BaseModel):
    pickup_address: str
    dropoff_address: str
    package_size: str = "MEDIUM" # SMALL, MEDIUM, LARGE, HEAVY
    item_description: str
    pickup_contact: str
    dropoff_contact: str

# Support Models
class TicketCreate(BaseModel):
    category: str
    subject: str
    description: str
    order_id: Optional[str] = None
    priority: Optional[str] = "MEDIUM"

class TicketMessageCreate(BaseModel):
    message: str

# RBAC Staff Creation
class StaffCreateRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str
    role_name: str # Operations Manager, Dispatcher, Finance Officer, Vendor Manager, Customer Support

class SystemSettingsUpdate(BaseModel):
    settings: dict[str, Any]

# Delivery Zone Models
class DeliveryZoneCreate(BaseModel):
    name: str
    base_fee: float = 800.0
    per_km_rate: float = 150.0
    min_distance_km: float = 2.0
    is_active: bool = True

class DeliveryZoneUpdate(BaseModel):
    name: Optional[str] = None
    base_fee: Optional[float] = None
    per_km_rate: Optional[float] = None
    min_distance_km: Optional[float] = None
    is_active: Optional[bool] = None

# Expense Models
class ExpenseCreate(BaseModel):
    title: str
    category: str # FUEL, MAINTENANCE, LOGISTICS, TECH, SALARY, OTHER
    amount: float
    notes: Optional[str] = None

# Extended Order Control Models
class OrderCancelRequest(BaseModel):
    cancellation_reason: str
    notes: Optional[str] = None

class OrderRescheduleRequest(BaseModel):
    rescheduled_eta: str
    notes: Optional[str] = None

# Extended Proof of Pickup Model
class ProofOfPickupRequest(BaseModel):
    otp: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None

# KYC & Profile Update Models
class VendorKYCUpdateRequest(BaseModel):
    cac_doc_url: Optional[str] = None
    id_card_url: Optional[str] = None
    utility_bill_url: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    onboarding_step: Optional[int] = None

class BulkProductUpdateRequest(BaseModel):
    product_ids: List[str]
    action: str # UPDATE_STATUS, UPDATE_CATEGORY, UPDATE_DISCOUNT, UPDATE_STOCK
    value: Any
    confirmation_token: Optional[str] = None
