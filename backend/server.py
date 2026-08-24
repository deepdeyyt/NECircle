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
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
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
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
ORDER_PRICE_PAISE = int(os.environ.get("ORDER_PRICE_PAISE", "9900"))
SHIPPING_TRIPURA_PAISE = int(os.environ.get("SHIPPING_TRIPURA_PAISE", "2100"))  # ₹21
SHIPPING_OTHER_PAISE = int(os.environ.get("SHIPPING_OTHER_PAISE", "8000"))  # ₹80
TAGS_PER_ORDER = 1  # one QR/id per ₹99 order — printed in 3 languages


def shipping_for_pincode(pincode: str) -> int:
    """Return shipping cost in paise for the given Indian pincode."""
    p = (pincode or "").strip()
    if p.startswith("799") and len(p) == 6 and p.isdigit():
        return SHIPPING_TRIPURA_PAISE
    return SHIPPING_OTHER_PAISE

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
    pincode: str = Field(min_length=6, max_length=6)
    quantity: int = Field(ge=1, le=20, default=1)

    @field_validator("customer_phone")
    @classmethod
    def _p(cls, v: str) -> str:
        n = normalize_phone(v)
        if not n:
            raise ValueError("Enter a valid Indian phone number")
        return n

    @field_validator("pincode")
    @classmethod
    def _pin(cls, v: str) -> str:
        v = re.sub(r"\D", "", v or "")
        if len(v) != 6:
            raise ValueError("Enter a valid 6-digit PIN code")
        return v


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
    orders_paid = await db.orders.count_documents(
        {"status": {"$in": ["paid", "shipped"]}}
    )
    orders_to_ship = await db.orders.count_documents({"status": "paid"})
    return {
        "printed": printed,
        "activated": activated,
        "unassigned": unassigned,
        "orders_paid": orders_paid,
        "orders_to_ship": orders_to_ship,
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
        "shipping_tripura_paise": SHIPPING_TRIPURA_PAISE,
        "shipping_other_paise": SHIPPING_OTHER_PAISE,
        "tags_per_order": 3,
        "currency": "INR",
    }


@api.post("/orders/create")
async def create_order(body: CreateOrderIn):
    item_paise = ORDER_PRICE_PAISE * body.quantity
    shipping_paise = shipping_for_pincode(body.pincode)
    amount_paise = item_paise + shipping_paise
    order_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    await db.orders.insert_one(
        {
            "id": order_id,
            "customer_name": body.customer_name.strip(),
            "customer_phone": body.customer_phone,
            "address": body.address.strip(),
            "pincode": body.pincode,
            "quantity": body.quantity,
            "item_paise": item_paise,
            "shipping_paise": shipping_paise,
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
                    "pincode": body.pincode,
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
        "item_paise": item_paise,
        "shipping_paise": shipping_paise,
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

    if order.get("status") == "paid" or order.get("status") == "shipped":
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
                "reconciled_via": "verify",
            }
        },
    )
    return {"ok": True, "order_id": order["id"], "tag_ids": tag_ids}


# ---------- Razorpay webhook (server-to-server reconciliation) ----------
def _verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """Razorpay signs webhooks with HMAC-SHA256(secret, raw_body)."""
    if not RAZORPAY_WEBHOOK_SECRET or not signature:
        return False
    expected = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _reconcile_paid_order(razorpay_order_id: str, razorpay_payment_id: str) -> dict:
    """Idempotent: mark order paid and allocate tags exactly once."""
    order = await db.orders.find_one({"razorpay_order_id": razorpay_order_id})
    if not order:
        return {"skipped": "order_not_found", "razorpay_order_id": razorpay_order_id}

    if order.get("status") in ("paid", "shipped"):
        return {"ok": True, "already": True, "order_id": order["id"]}

    total_tags = TAGS_PER_ORDER * (order.get("quantity") or 1)
    tag_ids = await _allocate_tags_for_order(total_tags)

    await db.orders.update_one(
        {"id": order["id"], "status": {"$ne": "paid"}},
        {
            "$set": {
                "status": "paid",
                "razorpay_payment_id": razorpay_payment_id,
                "tag_ids": tag_ids,
                "paid_at": datetime.now(timezone.utc).isoformat(),
                "reconciled_via": "webhook",
            }
        },
    )
    return {"ok": True, "already": False, "order_id": order["id"], "tag_ids": tag_ids}


@api.post("/orders/webhook")
async def razorpay_webhook(request: Request):
    """
    Razorpay → server webhook. Handles `payment.captured` and `order.paid`
    events. Verifies HMAC-SHA256 signature with RAZORPAY_WEBHOOK_SECRET,
    then idempotently marks the matching order as paid + allocates tags.
    Always returns 200 quickly (Razorpay retries 4xx/5xx for up to 24h).
    """
    raw = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    if not RAZORPAY_WEBHOOK_SECRET:
        logger.error("Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is unset")
        raise HTTPException(status_code=503, detail="Webhook not configured")

    if not _verify_webhook_signature(raw, signature):
        logger.warning("Razorpay webhook signature mismatch")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        import json as _json

        event = _json.loads(raw.decode())
    except Exception as e:
        logger.error("Razorpay webhook JSON parse failed: %s", e)
        raise HTTPException(status_code=400, detail="Invalid JSON") from e

    event_type = event.get("event") or ""
    payload = event.get("payload") or {}

    # Extract order + payment ids from every event shape we care about.
    rz_order_id = None
    rz_payment_id = None

    pay_entity = (payload.get("payment") or {}).get("entity") or {}
    ord_entity = (payload.get("order") or {}).get("entity") or {}

    if pay_entity:
        rz_order_id = pay_entity.get("order_id")
        rz_payment_id = pay_entity.get("id")
    if not rz_order_id and ord_entity:
        rz_order_id = ord_entity.get("id")

    if event_type not in ("payment.captured", "payment.authorized", "order.paid"):
        logger.info("Razorpay webhook ignored event=%s", event_type)
        return {"ok": True, "ignored": event_type}

    if not rz_order_id:
        logger.warning("Razorpay webhook missing order id, event=%s", event_type)
        return {"ok": True, "skipped": "no_order_id"}

    # Only mark paid on captured / order.paid — authorized alone doesn't guarantee funds.
    if event_type == "payment.authorized":
        return {"ok": True, "noted": "authorized"}

    result = await _reconcile_paid_order(rz_order_id, rz_payment_id or "")
    logger.info(
        "Razorpay webhook event=%s order=%s result=%s",
        event_type,
        rz_order_id,
        result,
    )
    return {"ok": True, "event": event_type, **result}


@api.get("/admin/orders")
async def list_orders(_: dict = Depends(require_admin)):
    docs = (
        await db.orders.find(
            {},
            {
                "_id": 0,
                "razorpay_signature": 0,
                "razorpay_payment_id": 0,
            },
        )
        .sort("created_at", -1)
        .to_list(length=500)
    )
    return docs


@api.post("/admin/orders/{order_id}/ship")
async def mark_shipped(order_id: str, _: dict = Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") != "paid" and order.get("status") != "shipped":
        raise HTTPException(status_code=400, detail="Only paid orders can be shipped")
    new_status = "paid" if order.get("status") == "shipped" else "shipped"
    update = {"status": new_status}
    if new_status == "shipped":
        update["shipped_at"] = datetime.now(timezone.utc).isoformat()
    else:
        update["shipped_at"] = None
    await db.orders.update_one({"id": order_id}, {"$set": update})
    return {"ok": True, "status": new_status}


# ---------------- Address labels PDF ----------------
def _wrap_text(text: str, max_chars: int) -> list[str]:
    """Simple word-wrap that respects newlines."""
    lines: list[str] = []
    for para in (text or "").splitlines():
        para = para.strip()
        if not para:
            lines.append("")
            continue
        words = para.split()
        cur = ""
        for w in words:
            candidate = f"{cur} {w}".strip()
            if len(candidate) <= max_chars:
                cur = candidate
            else:
                if cur:
                    lines.append(cur)
                # single word longer than line — hard-split
                while len(w) > max_chars:
                    lines.append(w[:max_chars])
                    w = w[max_chars:]
                cur = w
        if cur:
            lines.append(cur)
    return lines


def _draw_label(c, x, y, w, h, order, base_url):
    """Draw one shipping label at (x, y) with size (w, h). Origin is bottom-left."""
    # Frame
    c.setLineWidth(0.6)
    c.setDash(2, 2)
    c.setStrokeColorRGB(0.6, 0.6, 0.6)
    c.rect(x, y, w, h)
    c.setDash()

    pad = 4 * mm
    inner_x = x + pad
    inner_w = w - 2 * pad
    top = y + h - pad

    # Sender / brand strip
    c.setFillColorRGB(1.0, 0.867, 0.055)  # neon yellow
    c.rect(x, y + h - 8 * mm, w, 8 * mm, fill=1, stroke=0)
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(inner_x, y + h - 5.5 * mm, "NECIRCLE · CONNECTING THE NORTHEAST")
    c.setFont("Helvetica", 6.5)
    c.drawRightString(
        x + w - pad,
        y + h - 5.5 * mm,
        f"Order #{(order.get('id') or '')[:8]}",
    )

    # "SHIP TO" label
    cur_y = y + h - 8 * mm - 5 * mm
    c.setFillColorRGB(0.36, 0.34, 0.31)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(inner_x, cur_y, "SHIP TO")

    # Name
    cur_y -= 5.5 * mm
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont("Helvetica-Bold", 12)
    name = order.get("customer_name") or "—"
    c.drawString(inner_x, cur_y, name[:40])

    # Address (wrapped)
    cur_y -= 4.5 * mm
    c.setFont("Helvetica", 9)
    address_lines = _wrap_text(order.get("address") or "", max_chars=40)[:4]
    for line in address_lines:
        c.drawString(inner_x, cur_y, line)
        cur_y -= 3.8 * mm

    # Phone
    cur_y -= 1 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(inner_x, cur_y, f"Phone: +91 {order.get('customer_phone', '')}")

    # QR (bottom-right) linking to first tag
    tag_ids = order.get("tag_ids") or []
    if tag_ids:
        qr = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=6,
            border=1,
        )
        qr.add_data(f"{base_url}/p/{tag_ids[0]}")
        qr.make(fit=True)
        img = qr.make_image(fill_color="#1a1a1a", back_color="#ffffff").convert("RGB")
        import io as _io

        buf = _io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        qr_size = 18 * mm
        from reportlab.lib.utils import ImageReader

        c.drawImage(
            ImageReader(buf),
            x + w - pad - qr_size,
            y + pad,
            width=qr_size,
            height=qr_size,
            mask="auto",
        )

    # Tag IDs strip (bottom-left)
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColorRGB(0.36, 0.34, 0.31)
    c.drawString(inner_x, y + pad + 12 * mm, "STICKERS IN THIS PACK")
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont("Courier-Bold", 10)
    tag_line = " · ".join(f"#{t}" for t in tag_ids) or "— none —"
    c.drawString(inner_x, y + pad + 7 * mm, tag_line[:36])
    c.setFont("Helvetica", 7)
    c.setFillColorRGB(0.36, 0.34, 0.31)
    c.drawString(inner_x, y + pad + 3 * mm, "3 language stickers · Rs. 99 paid")


@api.get("/admin/orders/labels-pdf")
async def orders_labels_pdf(
    request: Request,
    _: dict = Depends(require_admin),
):
    orders = (
        await db.orders.find(
            {"status": "paid"},
            {"_id": 0, "razorpay_signature": 0, "razorpay_payment_id": 0},
        )
        .sort("paid_at", 1)
        .to_list(length=500)
    )
    if not orders:
        raise HTTPException(status_code=404, detail="No paid orders to ship")

    base_url = _public_base_url(request)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    page_w, page_h = A4

    # 2 columns × 5 rows = 10 labels per A4 page. Each label ≈ 99×57 mm.
    cols, rows = 2, 5
    margin_x = 6 * mm
    margin_y = 12 * mm
    label_w = (page_w - 2 * margin_x) / cols
    label_h = (page_h - 2 * margin_y) / rows

    idx = 0
    for o in orders:
        col = idx % cols
        row = (idx // cols) % rows
        x = margin_x + col * label_w
        # y from bottom
        y = page_h - margin_y - (row + 1) * label_h
        _draw_label(c, x, y, label_w, label_h, o, base_url)
        idx += 1
        if idx % (cols * rows) == 0 and idx < len(orders):
            c.showPage()

    c.save()
    buf.seek(0)
    filename = f"necircle-labels-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
