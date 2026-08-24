from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import re
import zipfile
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

import bcrypt
import jwt
import qrcode
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

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

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
    """Return 10-digit Indian mobile number, else None."""
    if not raw:
        return None
    cleaned = re.sub(r"[\s()-]", "", raw)
    m = PHONE_RE.match(cleaned)
    if not m:
        return None
    return m.group(1)


# Tripura plate: TR + 2 digits (district) + 1-3 letters (series) + 1-4 digits (number)
PLATE_RE = re.compile(r"^TR(\d{2})([A-Z]{1,3})(\d{1,4})$")


def normalize_plate(raw: str) -> Optional[str]:
    """Return canonical 'TR-01-A-1234' or None if invalid."""
    if not raw:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9]", "", raw).upper()
    m = PLATE_RE.match(cleaned)
    if not m:
        return None
    return f"TR-{m.group(1)}-{m.group(2)}-{m.group(3)}"


def next_id_from(max_id: Optional[str]) -> int:
    if not max_id:
        return 1
    try:
        return int(max_id) + 1
    except ValueError:
        return 1


def zero_pad(n: int) -> str:
    return f"{n:05d}"


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
        norm = normalize_phone(v)
        if not norm:
            raise ValueError("Enter a valid Indian phone number")
        return norm

    @field_validator("vehicle_number")
    @classmethod
    def _plate(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        norm = normalize_plate(v)
        if not norm:
            raise ValueError("Enter a valid Tripura plate (e.g. TR-01-A-1234)")
        return norm


def tag_to_public(doc: dict) -> dict:
    profile = doc.get("profile")
    return {
        "id": doc["id"],
        "status": doc["status"],
        "created_at": doc.get("created_at"),
        "profile": profile,
    }


# ------------------------------------------------------------
# Startup
# ------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.tags.create_index("id", unique=True)
    await db.users.create_index("email", unique=True)
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
        logger.info(f"Seeded admin {ADMIN_EMAIL}")
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        await db.users.update_one(
            {"email": ADMIN_EMAIL},
            {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}},
        )
        logger.info(f"Updated admin password for {ADMIN_EMAIL}")


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
        "phone": body.phone,  # already normalized to 10-digit
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
# Admin endpoints
# ------------------------------------------------------------
@api.get("/admin/stats")
async def stats(_: dict = Depends(require_admin)):
    printed = await db.tags.count_documents({})
    activated = await db.tags.count_documents({"status": "active"})
    unassigned = await db.tags.count_documents({"status": "unassigned"})
    return {"printed": printed, "activated": activated, "unassigned": unassigned}


@api.get("/admin/tags")
async def list_tags(_: dict = Depends(require_admin)):
    docs = await db.tags.find({}, {"_id": 0}).sort("id", 1).to_list(length=10000)
    return [tag_to_public(d) for d in docs]


@api.post("/admin/tags/batch")
async def create_batch(body: BatchIn, _: dict = Depends(require_admin)):
    latest = await db.tags.find({}, {"id": 1, "_id": 0}).sort("id", -1).limit(1).to_list(1)
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
    docs = await db.tags.find(query, {"_id": 0, "id": 1}).sort("id", 1).to_list(length=10000)
    if not docs:
        raise HTTPException(status_code=404, detail="No tags to export")

    base = _public_base_url(request)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for d in docs:
            tid = d["id"]
            url = f"{base}/p/{tid}"
            qr = qrcode.QRCode(
                version=None,
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
