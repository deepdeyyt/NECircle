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
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

import bcrypt
import jwt
import qrcode
import razorpay
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from supabase import create_client, Client

# ------------------------------------------------------------
# Config
# ------------------------------------------------------------
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 24
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@necircle.in").lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@123")

RAZORPAY_KEY_ID = os.environ["RAZORPAY_KEY_ID"]
RAZORPAY_KEY_SECRET = os.environ["RAZORPAY_KEY_SECRET"]
ORDER_PRICE_PAISE = int(os.environ.get("ORDER_PRICE_PAISE", "9900"))
TAGS_PER_ORDER = 1  # one QR/id per ₹99 order — printed in 3 languages

sb: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
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


def tag_row_to_public(row: dict) -> dict:
    return {
        "id": row["id"],
        "status": row["status"],
        "created_at": row.get("created_at"),
        "profile": row.get("profile"),
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
# Startup: verify schema + seed admin
# ------------------------------------------------------------
@app.on_event("startup")
async def startup():
    try:
        sb.table("tags").select("id").limit(1).execute()
    except Exception as e:
        logger.error(
            "Supabase schema not ready. Paste /app/backend/schema.sql into "
            "Supabase Dashboard → SQL Editor → Run once. Details: %s",
            e,
        )
        return

    # Seed admin
    try:
        existing = sb.table("users").select("*").eq("email", ADMIN_EMAIL).limit(1).execute()
        if not existing.data:
            sb.table("users").insert(
                {
                    "email": ADMIN_EMAIL,
                    "password_hash": hash_password(ADMIN_PASSWORD),
                    "role": "admin",
                }
            ).execute()
            logger.info("Seeded admin %s", ADMIN_EMAIL)
        else:
            u = existing.data[0]
            if not verify_password(ADMIN_PASSWORD, u["password_hash"]):
                sb.table("users").update(
                    {"password_hash": hash_password(ADMIN_PASSWORD)}
                ).eq("email", ADMIN_EMAIL).execute()
                logger.info("Updated admin password for %s", ADMIN_EMAIL)
    except Exception as e:
        logger.error("Admin seed failed: %s", e)


# ------------------------------------------------------------
# Auth
# ------------------------------------------------------------
@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.strip().lower()
    res = sb.table("users").select("*").eq("email", email).limit(1).execute()
    user = res.data[0] if res.data else None
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
    res = sb.table("tags").select("*").eq("id", tag_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag_row_to_public(res.data[0])


@api.post("/tags/{tag_id}/claim")
async def claim_tag(tag_id: str, body: ClaimIn):
    res = sb.table("tags").select("*").eq("id", tag_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Tag not found")
    tag = res.data[0]
    if tag["status"] == "active":
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
    upd = (
        sb.table("tags")
        .update({"status": "active", "profile": profile})
        .eq("id", tag_id)
        .execute()
    )
    return tag_row_to_public(upd.data[0])


# ------------------------------------------------------------
# Admin: stats + tag inventory + batch
# ------------------------------------------------------------
def _count(table: str, filters: dict | None = None) -> int:
    q = sb.table(table).select("id", count="exact")
    if filters:
        for k, v in filters.items():
            q = q.eq(k, v)
    return q.execute().count or 0


@api.get("/admin/stats")
async def stats(_: dict = Depends(require_admin)):
    printed = _count("tags")
    activated = _count("tags", {"status": "active"})
    unassigned = _count("tags", {"status": "unassigned"})
    orders_paid = _count("orders", {"status": "paid"})
    return {
        "printed": printed,
        "activated": activated,
        "unassigned": unassigned,
        "orders_paid": orders_paid,
    }


@api.get("/admin/tags")
async def list_tags(_: dict = Depends(require_admin)):
    res = sb.table("tags").select("*").order("id").limit(10000).execute()
    return [tag_row_to_public(r) for r in res.data]


@api.post("/admin/tags/batch")
async def create_batch(body: BatchIn, _: dict = Depends(require_admin)):
    latest = sb.table("tags").select("id").order("id", desc=True).limit(1).execute()
    start = next_id_from(latest.data[0]["id"] if latest.data else None)
    new_rows = [
        {"id": zero_pad(start + i), "status": "unassigned", "profile": None}
        for i in range(body.count)
    ]
    if new_rows:
        sb.table("tags").insert(new_rows).execute()
    return {
        "created": len(new_rows),
        "from": new_rows[0]["id"] if new_rows else None,
        "to": new_rows[-1]["id"] if new_rows else None,
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
    q = sb.table("tags").select("id")
    if scope != "all":
        q = q.eq("status", "unassigned")
    docs = q.order("id").limit(10000).execute().data
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
            img = qr.make_image(fill_color="#2A2521", back_color="#FBF7F1").convert("RGB")
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

    # Insert local pending order first
    order_row = (
        sb.table("orders")
        .insert(
            {
                "customer_name": body.customer_name.strip(),
                "customer_phone": body.customer_phone,
                "address": body.address.strip(),
                "quantity": body.quantity,
                "amount_paise": amount_paise,
                "status": "pending",
            }
        )
        .execute()
        .data[0]
    )

    # Create Razorpay order
    receipt = f"nec_{order_row['id'][:8]}"
    try:
        rz_order = rzp.order.create(
            {
                "amount": amount_paise,
                "currency": "INR",
                "receipt": receipt,
                "notes": {
                    "customer_name": body.customer_name,
                    "customer_phone": body.customer_phone,
                    "order_id": order_row["id"],
                },
            }
        )
    except Exception as e:
        sb.table("orders").update({"status": "failed"}).eq("id", order_row["id"]).execute()
        raise HTTPException(status_code=502, detail=f"Razorpay error: {e}") from e

    sb.table("orders").update({"razorpay_order_id": rz_order["id"]}).eq(
        "id", order_row["id"]
    ).execute()

    return {
        "order_id": order_row["id"],
        "razorpay_order_id": rz_order["id"],
        "amount_paise": amount_paise,
        "currency": "INR",
        "razorpay_key_id": RAZORPAY_KEY_ID,
        "customer": {
            "name": body.customer_name,
            "phone": body.customer_phone,
        },
    }


def _verify_signature(rz_order_id: str, rz_payment_id: str, signature: str) -> bool:
    body = f"{rz_order_id}|{rz_payment_id}".encode()
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def _allocate_tags_for_order(count: int) -> list[str]:
    """Allocate 'count' new unassigned tag IDs at the tail of the sequence."""
    latest = sb.table("tags").select("id").order("id", desc=True).limit(1).execute()
    start = next_id_from(latest.data[0]["id"] if latest.data else None)
    ids = [zero_pad(start + i) for i in range(count)]
    sb.table("tags").insert(
        [{"id": tid, "status": "unassigned", "profile": None} for tid in ids]
    ).execute()
    return ids


@api.post("/orders/verify")
async def verify_payment(body: VerifyPaymentIn):
    if not _verify_signature(
        body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature
    ):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    res = (
        sb.table("orders")
        .select("*")
        .eq("razorpay_order_id", body.razorpay_order_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Order not found")
    order = res.data[0]

    if order["status"] == "paid":
        return {
            "ok": True,
            "order_id": order["id"],
            "tag_ids": order.get("tag_ids") or [],
        }

    # Allocate tags for this order (1 per order — printed in 3 languages)
    total_tags = TAGS_PER_ORDER * (order.get("quantity") or 1)
    tag_ids = _allocate_tags_for_order(total_tags)

    sb.table("orders").update(
        {
            "status": "paid",
            "razorpay_payment_id": body.razorpay_payment_id,
            "razorpay_signature": body.razorpay_signature,
            "tag_ids": tag_ids,
            "paid_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", order["id"]).execute()

    return {"ok": True, "order_id": order["id"], "tag_ids": tag_ids}


@api.get("/admin/orders")
async def list_orders(_: dict = Depends(require_admin)):
    res = (
        sb.table("orders")
        .select("*")
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    return res.data


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
