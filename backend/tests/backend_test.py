"""NECircle backend regression suite (MongoDB revert verification)."""
import io
import os
import re
import uuid
import zipfile
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")


def _creds():
    p = Path("/app/memory/test_credentials.md")
    content = p.read_text(encoding="utf-8")
    e = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?email(?:\*\*)?\s*:\s*`?([^`\s]+)', content)
    pw = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?password(?:\*\*)?\s*:\s*`?([^`\s]+)', content)
    if not e or not pw:
        pytest.skip("credentials missing")
    return {"email": e.group(1), "password": pw.group(1)}


@pytest.fixture(scope="module")
def creds():
    return _creds()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def token(client, creds):
    r = client.post(f"{BASE_URL}/api/auth/login", json=creds)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# ---------------- health ----------------
class TestHealth:
    def test_root(self, client):
        r = client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json() == {"service": "NECircle", "ok": True}


# ---------------- auth (PRIMARY BUG) ----------------
class TestAuth:
    def test_login_success_sets_cookie(self, creds):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json=creds)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["email"] == creds["email"].lower()
        assert d["role"] == "admin"
        assert isinstance(d["token"], str) and len(d["token"]) > 20
        # cookie
        set_cookie = r.headers.get("set-cookie", "")
        assert "access_token=" in set_cookie, f"no cookie: {set_cookie}"
        assert "HttpOnly" in set_cookie
        assert "Secure" in set_cookie

    def test_login_wrong_password(self, client, creds):
        r = client.post(f"{BASE_URL}/api/auth/login", json={"email": creds["email"], "password": "WrongPass!1"})
        assert r.status_code == 401
        assert "Invalid" in r.json().get("detail", "")

    def test_login_unknown_email(self, client):
        r = client.post(f"{BASE_URL}/api/auth/login", json={"email": "nobody@necircle.in", "password": "x"})
        assert r.status_code == 401

    def test_login_email_case_insensitive(self, client, creds):
        r = client.post(f"{BASE_URL}/api/auth/login", json={"email": creds["email"].upper(), "password": creds["password"]})
        assert r.status_code == 200

    def test_me_with_bearer(self, auth, creds):
        r = auth.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        assert r.json() == {"email": creds["email"].lower(), "role": "admin"}

    def test_me_no_token(self, client):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_bad_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer garbage.token.x"})
        assert r.status_code == 401
        assert "token" in r.json()["detail"].lower()

    def test_me_with_cookie_only(self, creds):
        s = requests.Session()
        s.post(f"{BASE_URL}/api/auth/login", json=creds)
        r = s.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200, "cookie-based auth should work"

    def test_logout(self, creds):
        s = requests.Session()
        s.post(f"{BASE_URL}/api/auth/login", json=creds)
        r = s.post(f"{BASE_URL}/api/auth/logout")
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        assert not s.cookies.get("access_token")

    def test_bcrypt_hash_format(self):
        """Verify stored admin hash is bcrypt $2b$."""
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        env = dotenv_values("/app/backend/.env")

        async def go():
            c = AsyncIOMotorClient(env["MONGO_URL"])
            u = await c[env["DB_NAME"]].users.find_one({"email": _creds()["email"].lower()})
            c.close()
            return u

        u = asyncio.get_event_loop().run_until_complete(go()) if False else asyncio.run(go())
        assert u is not None, "admin user not seeded in Mongo"
        assert u["password_hash"].startswith("$2b$"), u["password_hash"][:10]
        assert u["role"] == "admin"

    def test_brute_force_lockout(self, creds):
        """Playbook: lockout after 5 failed attempts."""
        s = requests.Session()
        codes = []
        for _ in range(6):
            r = s.post(f"{BASE_URL}/api/auth/login", json={"email": creds["email"], "password": "Bad!12345"})
            codes.append(r.status_code)
        assert 429 in codes or 423 in codes, f"no lockout applied, codes={codes}"


# ---------------- admin tags ----------------
class TestAdminTags:
    created = []

    def test_batch_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/admin/tags/batch", json={"count": 1})
        assert r.status_code == 401

    def test_batch_creates_sequential(self, auth):
        r = auth.post(f"{BASE_URL}/api/admin/tags/batch", json={"count": 5})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["created"] == 5
        assert int(d["to"]) - int(d["from"]) == 4
        assert len(d["from"]) == 5
        TestAdminTags.created = [f"{i:05d}" for i in range(int(d["from"]), int(d["to"]) + 1)]
        # verify persistence
        g = requests.get(f"{BASE_URL}/api/tags/{TestAdminTags.created[0]}")
        assert g.status_code == 200
        assert g.json()["status"] == "unassigned"

    def test_batch_invalid_count(self, auth):
        assert auth.post(f"{BASE_URL}/api/admin/tags/batch", json={"count": 0}).status_code == 422
        assert auth.post(f"{BASE_URL}/api/admin/tags/batch", json={"count": 5000}).status_code == 422

    def test_stats(self, auth):
        r = auth.get(f"{BASE_URL}/api/admin/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ("printed", "activated", "unassigned", "orders_paid"):
            assert k in d and isinstance(d[k], int)
        assert d["printed"] >= d["activated"] + d["unassigned"]

    def test_stats_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/admin/stats").status_code == 401

    def test_list_tags_no_mongo_id(self, auth):
        r = auth.get(f"{BASE_URL}/api/admin/tags")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) > 0
        assert "_id" not in arr[0]
        assert set(arr[0].keys()) == {"id", "status", "created_at", "profile"}

    def test_qr_zip(self, auth):
        r = auth.get(f"{BASE_URL}/api/admin/tags/qr-zip?scope=unassigned")
        assert r.status_code == 200, r.text[:200]
        assert r.headers["content-type"] == "application/zip"
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        assert len(names) > 0
        assert all(re.fullmatch(r"NECircle-\d{5}\.png", n) for n in names), names[:5]
        assert z.read(names[0])[:8] == b"\x89PNG\r\n\x1a\n"

    def test_qr_zip_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/admin/tags/qr-zip").status_code == 401


# ---------------- public tags + claim ----------------
class TestPublicTags:
    def test_unknown_tag_404(self, client):
        r = client.get(f"{BASE_URL}/api/tags/99999")
        assert r.status_code == 404
        assert r.json()["detail"] == "Tag not found"

    def _fresh_tag(self, auth):
        r = auth.post(f"{BASE_URL}/api/admin/tags/batch", json={"count": 1})
        return r.json()["from"]

    def test_claim_vehicle_normalizes_plate(self, auth, client):
        tid = self._fresh_tag(auth)
        r = client.post(f"{BASE_URL}/api/tags/{tid}/claim", json={
            "name": "TEST Owner", "phone": "9876543210", "type": "vehicle",
            "vehicle_number": "tr 01 a 1234"})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["status"] == "active"
        assert d["profile"]["vehicle_number"] == "TR-01-A-1234"
        assert d["profile"]["phone"] == "9876543210"
        # persisted
        g = client.get(f"{BASE_URL}/api/tags/{tid}").json()
        assert g["profile"]["vehicle_number"] == "TR-01-A-1234"
        assert g["status"] == "active"
        TestPublicTags.vehicle_tag = tid

    def test_claim_phone_normalization(self, auth, client):
        tid = self._fresh_tag(auth)
        r = client.post(f"{BASE_URL}/api/tags/{tid}/claim", json={
            "name": "TEST Owner2", "phone": "+91 98765 43210", "type": "business",
            "note": "TEST shop"})
        assert r.status_code == 200
        assert r.json()["profile"]["phone"] == "9876543210"
        assert r.json()["profile"]["note"] == "TEST shop"

    def test_claim_missing_vehicle_number(self, auth, client):
        tid = self._fresh_tag(auth)
        r = client.post(f"{BASE_URL}/api/tags/{tid}/claim", json={
            "name": "TEST", "phone": "9876543210", "type": "vehicle"})
        assert r.status_code == 422, r.text[:200]

    @pytest.mark.parametrize("phone", ["12345", "5555555555", "abcdefghij"])
    def test_claim_invalid_phone(self, auth, client, phone):
        tid = self._fresh_tag(auth)
        r = client.post(f"{BASE_URL}/api/tags/{tid}/claim", json={
            "name": "TEST", "phone": phone, "type": "business"})
        assert r.status_code == 422

    def test_claim_invalid_plate(self, auth, client):
        tid = self._fresh_tag(auth)
        r = client.post(f"{BASE_URL}/api/tags/{tid}/claim", json={
            "name": "TEST", "phone": "9876543210", "type": "vehicle",
            "vehicle_number": "XYZ-999"})
        assert r.status_code == 422

    def test_claim_already_active_409(self, auth, client):
        tid = self._fresh_tag(auth)
        body = {"name": "TEST", "phone": "9876543210", "type": "vehicle", "vehicle_number": "TR-02-B-9"}
        assert client.post(f"{BASE_URL}/api/tags/{tid}/claim", json=body).status_code == 200
        r = client.post(f"{BASE_URL}/api/tags/{tid}/claim", json=body)
        assert r.status_code == 409

    def test_claim_unknown_tag_404(self, client):
        r = client.post(f"{BASE_URL}/api/tags/99999/claim", json={
            "name": "TEST", "phone": "9876543210", "type": "business"})
        assert r.status_code == 404


# ---------------- orders / razorpay ----------------
class TestOrders:
    def test_config(self, client):
        r = client.get(f"{BASE_URL}/api/orders/config")
        assert r.status_code == 200
        d = r.json()
        assert d["razorpay_key_id"].startswith("rzp_live_")
        assert d["price_paise"] == 9900
        assert d["currency"] == "INR"
        assert d["tags_per_order"] == 3

    def test_create_order(self, client):
        r = client.post(f"{BASE_URL}/api/orders/create", json={
            "customer_name": "TEST Buyer", "customer_phone": "9876543210",
            "address": "H1, Agartala, 799001", "quantity": 1})
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        uuid.UUID(d["order_id"])
        assert d["razorpay_order_id"].startswith("order_")
        assert d["amount_paise"] == 9900
        assert d["currency"] == "INR"
        assert d["razorpay_key_id"].startswith("rzp_live_")
        assert d["customer"]["phone"] == "9876543210"
        TestOrders.rz_order = d["razorpay_order_id"]

    def test_create_order_invalid_phone(self, client):
        r = client.post(f"{BASE_URL}/api/orders/create", json={
            "customer_name": "TEST", "customer_phone": "12345",
            "address": "H1, Agartala, 799001", "quantity": 1})
        assert r.status_code == 422

    def test_create_order_short_address(self, client):
        r = client.post(f"{BASE_URL}/api/orders/create", json={
            "customer_name": "TEST", "customer_phone": "9876543210",
            "address": "H1", "quantity": 1})
        assert r.status_code == 422

    def test_verify_bad_signature(self, client):
        r = client.post(f"{BASE_URL}/api/orders/verify", json={
            "razorpay_order_id": "order_FAKE123", "razorpay_payment_id": "pay_FAKE123",
            "razorpay_signature": "deadbeef" * 8})
        assert r.status_code == 400
        assert r.json()["detail"] == "Invalid payment signature"

    def test_admin_orders(self, auth):
        r = auth.get(f"{BASE_URL}/api/admin/orders")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        if arr:
            assert "_id" not in arr[0]
            assert "id" in arr[0]

    def test_admin_orders_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/admin/orders").status_code == 401
