from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import re
import hmac
import hashlib
import zipfile
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

import bcrypt
import jwt
import qrcode
import razorpay
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator

# ------------------------------------------------------------
# Config
# ------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 24
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@necircle.in").lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@123")

RAZORPAY_KEY_ID = os.environ["RAZORPAY_KEY_ID"]
RAZORPAY_KEY_SECRET = os.environ["RAZORPAY_KEY_SECRET"]
ORDER_PRICE_PAISE = int(os.environ.get("ORDER_PRICE_PAISE", "9900"))
TAGS_PER_ORDER = 1  # one QR/id per ₹99 order — printed in 3 languages

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
rzp = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

app = FastAPI(title="NECircle API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("necircle")


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(email: str) -> str:
    payload = {
        "sub": email,
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def require_admin(request: Request) -> dict:
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return payload


PHONE_RE = re.compile(r"^(?:\+91[\s-]?|0)?([6-9]\d{9})$")


def normalize_phone(raw: str) -> Optional[str]:
    if not raw:
        return None
    cleaned = re.sub(r"[\s()-]", "", raw)
    m = PHONE_RE.match(cleaned)
    return m.group(1) if m else None


PLATE_RE = re.compile(r"^TR(\d{2})([A-Z]{1,3})(\d{1,4})$")


def normalize_plate(raw: str) -> Optional[str]:
    if not raw:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9]", "", raw).upper()
    m = PLATE_RE.match(cleaned)
    return f"TR-{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def zero_pad(n: int) -> str:
    return f"{n:05d}"


def next_id_from(max_id: Optional[str]) -> int:
    if not max_id:
        return 1
    try:
        return int(max_id) + 1
    except ValueError:
        return 1


def tag_to_public(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "status": doc["status"],
        "created_at": doc.get("created_at"),
        "profile": doc.get("profile"),
    }


# ------------------------------------------------------------
# Models
# ------------------------------------------------------------
class LoginIn(BaseModel):
    email: str
    password: str


class BatchIn(BaseModel):
    count: int = Field(ge=1, le=1000)


class ClaimIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str
    type: Literal["vehicle", "business"]
    note: Optional[str] = Field(default=None, max_length=280)
    vehicle_number: Optional[str] = Field(default=None, max_length=20)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        n = normalize_phone(v)
        if not n:
            raise ValueError("Enter a valid Indian phone number")
        return n

    @field_validator("vehicle_number")
    @classmethod
    def _plate(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        n = normalize_plate(v)
        if not n:
            raise ValueError("Enter a valid Tripura plate (e.g. TR-01-A-1234)")
        return n


class CreateOrderIn(BaseModel):
    customer_name: str = Field(min_length=1, max_length=80)
    customer_phone: str
    address: str = Field(min_length=6, max_length=400)
    quantity: int = Field(ge=1, le=20, default=1)

    @field_validator("customer_phone")
    @classmethod
    def _p(cls, v: str) -> str:
        n = normalize_phone(v)
        if not n:
            raise ValueError("Enter a valid Indian phone number")
        return n


class VerifyPaymentIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


# ------------------------------------------------------------
# Startup
# ------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.tags.create_index("id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.orders.create_index("razorpay_order_id", unique=True, sparse=True)
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one(
            {
                "email": ADMIN_EMAIL,
                "password_hash": hash_password(ADMIN_PASSWORD),
                "role": "admin",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        logger.info("Seeded admin %s", ADMIN_EMAIL)
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        await db.users.update_one(
            {"email": ADMIN_EMAIL},
            {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}},
        )
        logger.info("Updated admin password for %s", ADMIN_EMAIL)


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ------------------------------------------------------------
# Auth
# ------------------------------------------------------------
@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(email)
    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=JWT_EXPIRE_HOURS * 3600,
        path="/",
    )
    return {"token": token, "email": email, "role": "admin"}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(payload: dict = Depends(require_admin)):
    return {"email": payload["sub"], "role": payload.get("role", "admin")}


# ------------------------------------------------------------
# Public tag endpoints
# ------------------------------------------------------------
@api.get("/tags/{tag_id}")
async def get_tag(tag_id: str):
    doc = await db.tags.find_one({"id": tag_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag_to_public(doc)


@api.post("/tags/{tag_id}/claim")
async def claim_tag(tag_id: str, body: ClaimIn):
    doc = await db.tags.find_one({"id": tag_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Tag not found")
    if doc.get("status") == "active":
        raise HTTPException(status_code=409, detail="Tag already activated")
    if body.type == "vehicle" and not body.vehicle_number:
        raise HTTPException(status_code=422, detail="Vehicle number is required")

    profile = {
        "name": body.name,
        "phone": body.phone,
        "type": body.type,
        "note": (body.note or "").strip() if body.type == "business" else None,
        "vehicle_number": body.vehicle_number if body.type == "vehicle" else None,
        "claimed_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tags.update_one(
        {"id": tag_id},
        {"$set": {"status": "active", "profile": profile}},
    )
    updated = await db.tags.find_one({"id": tag_id})
    return tag_to_public(updated)


# ------------------------------------------------------------
# Admin
# ------------------------------------------------------------
@api.get("/admin/stats")
async def stats(_: dict = Depends(require_admin)):
    printed = await db.tags.count_documents({})
    activated = await db.tags.count_documents({"status": "active"})
    unassigned = await db.tags.count_documents({"status": "unassigned"})
    orders_paid = await db.orders.count_documents({"status": "paid"})
    return {
        "printed": printed,
        "activated": activated,
        "unassigned": unassigned,
        "orders_paid": orders_paid,
    }


@api.get("/admin/tags")
async def list_tags(_: dict = Depends(require_admin)):
    docs = (
        await db.tags.find({}, {"_id": 0}).sort("id", 1).to_list(length=10000)
    )
    return [tag_to_public(d) for d in docs]


@api.post("/admin/tags/batch")
async def create_batch(body: BatchIn, _: dict = Depends(require_admin)):
    latest = (
        await db.tags.find({}, {"id": 1, "_id": 0}).sort("id", -1).limit(1).to_list(1)
    )
    start = next_id_from(latest[0]["id"] if latest else None)
    now = datetime.now(timezone.utc).isoformat()
    new_docs = [
        {
            "id": zero_pad(start + i),
            "status": "unassigned",
            "created_at": now,
            "profile": None,
        }
        for i in range(body.count)
    ]
    if new_docs:
        await db.tags.insert_many(new_docs)
    return {
        "created": len(new_docs),
        "from": new_docs[0]["id"] if new_docs else None,
        "to": new_docs[-1]["id"] if new_docs else None,
    }


def _public_base_url(request: Request) -> str:
    env_url = os.environ.get("PUBLIC_BASE_URL")
    if env_url:
        return env_url.rstrip("/")
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")
    referer = request.headers.get("referer")
    if referer:
        from urllib.parse import urlparse

        p = urlparse(referer)
        if p.scheme and p.netloc:
            return f"{p.scheme}://{p.netloc}"
    return str(request.base_url).rstrip("/")


@api.get("/admin/tags/qr-zip")
async def qr_zip(
    request: Request,
    scope: str = "unassigned",
    _: dict = Depends(require_admin),
):
    query = {} if scope == "all" else {"status": "unassigned"}
    docs = (
        await db.tags.find(query, {"_id": 0, "id": 1})
        .sort("id", 1)
        .to_list(length=10000)
    )
    if not docs:
        raise HTTPException(status_code=404, detail="No tags to export")

    base = _public_base_url(request)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for d in docs:
            tid = d["id"]
            url = f"{base}/p/{tid}"
            qr = qrcode.QRCode(
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=10,
                border=2,
            )
            qr.add_data(url)
            qr.make(fit=True)
            img = qr.make_image(fill_color="#2A2521", back_color="#FBF7F1").convert(
                "RGB"
            )
            png = io.BytesIO()
            img.save(png, format="PNG")
            zf.writestr(f"NECircle-{tid}.png", png.getvalue())
    buf.seek(0)
    filename = f"necircle-qr-{scope}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ------------------------------------------------------------
# Orders + Razorpay
# ------------------------------------------------------------
@api.get("/orders/config")
async def order_config():
    return {
        "razorpay_key_id": RAZORPAY_KEY_ID,
        "price_paise": ORDER_PRICE_PAISE,
        "price_display": f"₹{ORDER_PRICE_PAISE / 100:.0f}",
        "tags_per_order": 3,
        "currency": "INR",
    }


@api.post("/orders/create")
async def create_order(body: CreateOrderIn):
    amount_paise = ORDER_PRICE_PAISE * body.quantity
    order_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    await db.orders.insert_one(
        {
            "id": order_id,
            "customer_name": body.customer_name.strip(),
            "customer_phone": body.customer_phone,
            "address": body.address.strip(),
            "quantity": body.quantity,
            "amount_paise": amount_paise,
            "status": "pending",
            "created_at": now,
        }
    )

    receipt = f"nec_{order_id[:8]}"
    try:
        rz_order = rzp.order.create(
            {
                "amount": amount_paise,
                "currency": "INR",
                "receipt": receipt,
                "notes": {
                    "customer_name": body.customer_name,
                    "customer_phone": body.customer_phone,
                    "order_id": order_id,
                },
            }
        )
    except Exception as e:
        await db.orders.update_one({"id": order_id}, {"$set": {"status": "failed"}})
        raise HTTPException(status_code=502, detail=f"Razorpay error: {e}") from e

    await db.orders.update_one(
        {"id": order_id}, {"$set": {"razorpay_order_id": rz_order["id"]}}
    )

    return {
        "order_id": order_id,
        "razorpay_order_id": rz_order["id"],
        "amount_paise": amount_paise,
        "currency": "INR",
        "razorpay_key_id": RAZORPAY_KEY_ID,
        "customer": {"name": body.customer_name, "phone": body.customer_phone},
    }


def _verify_signature(rz_order_id: str, rz_payment_id: str, signature: str) -> bool:
    body = f"{rz_order_id}|{rz_payment_id}".encode()
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _allocate_tags_for_order(count: int) -> list[str]:
    latest = (
        await db.tags.find({}, {"id": 1, "_id": 0}).sort("id", -1).limit(1).to_list(1)
    )
    start = next_id_from(latest[0]["id"] if latest else None)
    ids = [zero_pad(start + i) for i in range(count)]
    now = datetime.now(timezone.utc).isoformat()
    await db.tags.insert_many(
        [
            {"id": tid, "status": "unassigned", "created_at": now, "profile": None}
            for tid in ids
        ]
    )
    return ids


@api.post("/orders/verify")
async def verify_payment(body: VerifyPaymentIn):
    if not _verify_signature(
        body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature
    ):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    order = await db.orders.find_one({"razorpay_order_id": body.razorpay_order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("status") == "paid":
        return {
            "ok": True,
            "order_id": order["id"],
            "tag_ids": order.get("tag_ids") or [],
        }

    total_tags = TAGS_PER_ORDER * (order.get("quantity") or 1)
    tag_ids = await _allocate_tags_for_order(total_tags)

    await db.orders.update_one(
        {"id": order["id"]},
        {
            "$set": {
                "status": "paid",
                "razorpay_payment_id": body.razorpay_payment_id,
                "razorpay_signature": body.razorpay_signature,
                "tag_ids": tag_ids,
                "paid_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {"ok": True, "order_id": order["id"], "tag_ids": tag_ids}


@api.get("/admin/orders")
async def list_orders(_: dict = Depends(require_admin)):
    docs = (
        await db.orders.find({}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(length=500)
    )
    return docs


# ------------------------------------------------------------
# Health
# ------------------------------------------------------------
@api.get("/")
async def root():
    return {"service": "NECircle", "ok": True}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
