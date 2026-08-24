# NECircle — VPS Deployment Guide (necircle.in)

Full instructions to migrate the app from Emergent's preview environment onto your own Ubuntu VPS, with the domain **necircle.in**, HTTPS, systemd services, and MongoDB.

Estimated time end-to-end: **60–90 minutes**.

---

## 0. Prerequisites checklist

- [ ] A VPS running **Ubuntu 22.04 LTS** or **24.04 LTS** (Hetzner CX22 / DigitalOcean 2 GB / AWS t3.small are all fine).
- [ ] Root or `sudo` SSH access to the VPS.
- [ ] Domain **necircle.in** pointed at the VPS. Add these DNS A records at your registrar:
  - `necircle.in → <VPS public IP>`
  - `www.necircle.in → <VPS public IP>`
  - Wait until `dig +short necircle.in` returns the IP before requesting SSL.
- [ ] Razorpay LIVE keys ready — same values that are already in `/app/backend/.env`.
- [ ] The zipped project code (or push the current `/app` to your GitHub first — see §12).

---

## 1. Server hardening (one-time)

```bash
# on the VPS as root
adduser necircle
usermod -aG sudo necircle
rsync --archive --chown=necircle:necircle ~/.ssh /home/necircle
# from now on, log in as: ssh necircle@<VPS_IP>

sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw fail2ban curl git build-essential ca-certificates gnupg lsb-release

# firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

---

## 2. Install the runtime stack

### 2.1 Python 3.11

```bash
sudo apt -y install python3.11 python3.11-venv python3.11-dev python3-pip
```

### 2.2 Node.js 20 + Yarn

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
sudo corepack enable
sudo corepack prepare yarn@stable --activate
node -v && yarn -v
```

### 2.3 MongoDB 7.x

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt -y install mongodb-org
sudo systemctl enable --now mongod
```

MongoDB binds to `127.0.0.1` by default in Ubuntu packages — do not expose it to the internet.
Optional but recommended: enable auth (see §11).

### 2.4 Nginx + Certbot

```bash
sudo apt -y install nginx snapd
sudo snap install core && sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### 2.5 Poppler (for the address-label PDF preview thumbnail — optional)

```bash
sudo apt -y install libjpeg-dev zlib1g-dev  # already covered by build-essential usually
```

---

## 3. Fetch the code

```bash
# as necircle user
mkdir -p ~/apps && cd ~/apps
git clone https://github.com/<your-org>/necircle.git
cd necircle
```

If you don't have a GitHub repo yet, follow §12 first, then come back.

---

## 4. Backend setup

```bash
cd ~/apps/necircle/backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 4.1 Create `backend/.env`

Copy the sample below into `~/apps/necircle/backend/.env` — **replace the JWT_SECRET** with a fresh 64-char value (`openssl rand -hex 32`) and confirm all other values.

```dotenv
MONGO_URL="mongodb://127.0.0.1:27017"
DB_NAME="necircle"
CORS_ORIGINS="https://necircle.in,https://www.necircle.in"

JWT_SECRET="__REPLACE_WITH_openssl rand -hex 32__"

ADMIN_EMAIL="admin@necircle.in"
ADMIN_PASSWORD="__CHANGE_ME_STRONG_PASSWORD__"

RAZORPAY_KEY_ID="rzp_live_TTgLLDvSqaQyjB"
RAZORPAY_KEY_SECRET="gX6EON7J3AuYjH2seiO0Hkxt"
ORDER_PRICE_PAISE="9900"

PUBLIC_BASE_URL="https://necircle.in"
```

Important:

- `CORS_ORIGINS` must NOT be `*` in production. Use the exact scheme + host.
- `DB_NAME` is `necircle` here (not `test_database`) so live data isn't mixed with dev.
- `PUBLIC_BASE_URL` is what QR codes will encode, so once you're on necircle.in every generated QR points at the production domain.

### 4.2 Smoke-test locally on the VPS

```bash
cd ~/apps/necircle/backend
source .venv/bin/activate
uvicorn server:app --host 127.0.0.1 --port 8001
# in another shell:
curl -s http://127.0.0.1:8001/api/ | head
# expect: {"service":"NECircle","ok":true}
# ctrl-c the uvicorn
```

### 4.3 systemd unit — `necircle-backend`

Create `/etc/systemd/system/necircle-backend.service`:

```ini
[Unit]
Description=NECircle FastAPI backend
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=necircle
Group=necircle
WorkingDirectory=/home/necircle/apps/necircle/backend
EnvironmentFile=/home/necircle/apps/necircle/backend/.env
ExecStart=/home/necircle/apps/necircle/backend/.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=on-failure
RestartSec=3
# Hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now necircle-backend
sudo systemctl status necircle-backend --no-pager
```

Logs: `sudo journalctl -u necircle-backend -f`.

---

## 5. Frontend build

```bash
cd ~/apps/necircle/frontend
```

### 5.1 Create `frontend/.env` (build-time)

```dotenv
REACT_APP_BACKEND_URL=https://necircle.in
REACT_APP_RAZORPAY_KEY_ID=rzp_live_TTgLLDvSqaQyjB
WDS_SOCKET_PORT=443
GENERATE_SOURCEMAP=false
```

Because `REACT_APP_*` values are **baked into the JS bundle at build time**, you must rebuild after changing them.

### 5.2 Build

```bash
yarn install --frozen-lockfile
yarn build
```

The compiled site lands in `~/apps/necircle/frontend/build/`. Nginx will serve that directory directly — no Node process needed in production.

---

## 6. Nginx reverse proxy

Create `/etc/nginx/sites-available/necircle.in`:

```nginx
# ---------- HTTP → HTTPS redirect ----------
server {
    listen 80;
    listen [::]:80;
    server_name necircle.in www.necircle.in;
    return 301 https://necircle.in$request_uri;
}

# ---------- HTTPS main server ----------
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name necircle.in;

    # Let's Encrypt certs will be filled in by certbot in step 7
    # ssl_certificate     /etc/letsencrypt/live/necircle.in/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/necircle.in/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Client body limit — enough for QR ZIP + label PDFs
    client_max_body_size 25m;

    # Serve the built React app
    root /home/necircle/apps/necircle/frontend/build;
    index index.html;

    # Static assets: long cache
    location /static/ {
        expires 30d;
        access_log off;
        add_header Cache-Control "public, immutable";
    }
    location = /necircle-logo.png    { expires 30d; access_log off; }
    location = /sticker-sample.webp  { expires 30d; access_log off; }

    # ---------- API → FastAPI backend ----------
    location /api/ {
        proxy_pass         http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;

        # Bigger read for PDF / ZIP endpoints
        proxy_buffering        off;
    }

    # SPA fallback — every non-API, non-static route serves index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Optional: redirect www → apex
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.necircle.in;
    # ssl_certificate     /etc/letsencrypt/live/necircle.in/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/necircle.in/privkey.pem;
    return 301 https://necircle.in$request_uri;
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/necircle.in /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

At this point `http://necircle.in` should already serve the built React app. The `/api/*` calls will fail until step 7 completes SSL.

---

## 7. HTTPS with Let's Encrypt

```bash
sudo certbot --nginx -d necircle.in -d www.necircle.in \
             --agree-tos --redirect --no-eff-email \
             -m admin@necircle.in
```

Certbot will:

1. Confirm both hostnames resolve to this VPS.
2. Uncomment the `ssl_certificate` lines automatically.
3. Reload Nginx.

Verify:

```bash
curl -sI https://necircle.in | head -3       # expect 200
curl -s  https://necircle.in/api/ | head     # expect {"service":"NECircle","ok":true}
```

Certbot registers a systemd timer for auto-renewal — check with `sudo systemctl list-timers | grep certbot`.

---

## 8. Razorpay production checks

The keys already in `.env` are LIVE. On necircle.in:

- Log in to https://dashboard.razorpay.com → **Settings → Webhooks** → *+ Add New Webhook*.
- URL: `https://necircle.in/api/orders/webhook`
- Active events: `payment.captured` and `order.paid` (both, for redundancy).
- Razorpay generates a **webhook secret** once — copy it into `backend/.env` as `RAZORPAY_WEBHOOK_SECRET=...`, then `sudo systemctl restart necircle-backend`.
- Whitelisted domains: add `necircle.in`.
- Confirm KYC + settlement bank account are approved (otherwise capture will fail even with valid signatures).
- Do a **₹1 test order** by temporarily setting `ORDER_PRICE_PAISE=100`, buying it yourself, refunding from the dashboard, then reverting to `9900`. After a successful payment you should see in Razorpay's webhook log: `200 OK` from `/api/orders/webhook` and the order marked `status=paid` with `reconciled_via=webhook` in Mongo.

Why a webhook AND `/api/orders/verify`? The client-side verify only runs if the buyer waits on the page. The server-side webhook reconciles the order even if the browser tab is closed. Both paths hit the same idempotent code — allocation happens exactly once.

---

## 9. Post-deploy smoke test (5 minutes)

Run every check below against `https://necircle.in` and don't move on until each passes:

```bash
# health
curl -s https://necircle.in/api/ | jq

# admin login (use the password from your .env)
TOKEN=$(curl -s -X POST https://necircle.in/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@necircle.in","password":"__YOUR_ADMIN_PASSWORD__"}' \
  | jq -r .token)
echo "$TOKEN" | head -c 30; echo

# me
curl -s https://necircle.in/api/auth/me -H "Authorization: Bearer $TOKEN" | jq

# create a small batch
curl -s -X POST https://necircle.in/api/admin/tags/batch \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"count":10}' | jq

# stats
curl -s https://necircle.in/api/admin/stats -H "Authorization: Bearer $TOKEN" | jq

# QR zip (should download a real zip)
curl -s -o labels-check.zip \
  -H "Authorization: Bearer $TOKEN" \
  https://necircle.in/api/admin/tags/qr-zip?scope=unassigned
file labels-check.zip
```

Then in the browser:

1. Open `https://necircle.in` — landing page + logo + hero visible.
2. Click **Buy a tag · ₹99** → modal opens → Razorpay checkout loads → **close it** (do not pay).
3. Open `https://necircle.in/admin` → log in → verify stats, batch generator, Print labels, Inventory collapse all work.
4. Scan one of the QR codes from the ZIP with your phone camera → it should open `https://necircle.in/p/00001` (the claim form).

---

## 10. Backups & log rotation

### 10.1 MongoDB nightly backup

```bash
sudo mkdir -p /var/backups/necircle
sudo tee /etc/cron.daily/necircle-backup > /dev/null <<'EOF'
#!/bin/bash
set -e
DATE=$(date +%F)
DEST=/var/backups/necircle/necircle-$DATE.gz
mongodump --db=necircle --archive=$DEST --gzip
# Keep 14 days
find /var/backups/necircle -name 'necircle-*.gz' -mtime +14 -delete
EOF
sudo chmod +x /etc/cron.daily/necircle-backup
sudo /etc/cron.daily/necircle-backup   # run once now to prove it works
```

Restore with: `mongorestore --db=necircle --gzip --archive=/var/backups/necircle/necircle-YYYY-MM-DD.gz --drop`.

For offsite: `rsync` the `/var/backups/necircle/` folder to S3/Backblaze once a day.

### 10.2 Log rotation

Systemd + Nginx already rotate their logs. Backend uses stdout → captured by journald → auto-rotated.

---

## 11. Optional MongoDB auth (recommended before going public)

```bash
mongosh <<'EOF'
use admin
db.createUser({
  user: "necircle_app",
  pwd:  "__STRONG_MONGO_PASSWORD__",
  roles: [ { role: "readWrite", db: "necircle" } ]
})
EOF

sudo sed -i 's/#security:/security:\n  authorization: enabled/' /etc/mongod.conf
sudo systemctl restart mongod
```

Update `MONGO_URL` in `backend/.env` to:

```
MONGO_URL="mongodb://necircle_app:__STRONG_MONGO_PASSWORD__@127.0.0.1:27017/necircle?authSource=admin"
```

Then `sudo systemctl restart necircle-backend`.

---

## 12. Push the code to GitHub (do this once from Emergent, before touching the VPS)

From the Emergent side (or your workstation with a copy of `/app`):

```bash
cd /app
git init
git add .
git commit -m "Initial NECircle production drop"
git branch -M main
git remote add origin git@github.com:<your-github-handle>/necircle.git
git push -u origin main
```

**Do NOT commit `.env`** — the current `/app/backend/.env` contains a Razorpay LIVE secret. Add a `.gitignore` (see §12.1) BEFORE the first commit.

### 12.1 `.gitignore` you need at repo root

```gitignore
# secrets
backend/.env
frontend/.env
frontend/.env.local

# python
backend/.venv/
backend/__pycache__/
backend/**/__pycache__/
backend/*.pyc

# node
frontend/node_modules/
frontend/build/
frontend/.yarn/*
!frontend/.yarn/patches
!frontend/.yarn/plugins
!frontend/.yarn/releases
!frontend/.yarn/sdks
!frontend/.yarn/versions

# assets scratch
frontend/public/tmp-*

# OS
.DS_Store
Thumbs.db
```

Then commit a **redacted** sample env for other devs: `backend/.env.example` (copy the shape from §4.1 with the values blanked out).

---

## 13. Redeploy workflow after a code change

Once §3 is done and `deploy.sh` is on the VPS, every future deploy is one command:

```bash
# on the VPS
cd ~/apps/necircle
./deploy.sh                   # pulls main, rebuilds frontend, restarts backend
./deploy.sh --backend         # only backend
./deploy.sh --frontend        # only frontend
./deploy.sh --branch staging  # deploy a different branch
./deploy.sh --no-pull         # deploy current working tree without git pull
```

The script fails loudly (exit code ≠ 0) if the backend fails to come back up, so it's safe to wire into a CI hook or a cron.

Manual equivalent (if you skip the script):

```bash
cd ~/apps/necircle
git pull --ff-only

# backend deps changed?
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
sudo systemctl restart necircle-backend

# frontend changed?
cd frontend
yarn install --frozen-lockfile
yarn build
# no restart needed — Nginx serves the fresh build/ directly
```

---

## 14. Known operational backlog

- CORS is now scoped, but there is still **no brute-force lockout on `/api/auth/login`** — add rate-limiting at Nginx (`limit_req`) or in the app for extra safety.
- `_public_base_url()` derives the QR URL from request headers as a fallback. On the VPS, **always** set `PUBLIC_BASE_URL=https://necircle.in` so QR codes never accidentally embed the preview URL.
- Admin uses JWT in localStorage + an httpOnly cookie. Pick one before opening the operator dashboard to public networks.

---

## 15. Rollback

If a deploy breaks the site:

```bash
cd ~/apps/necircle
git log --oneline -n 10                 # find the last-known-good SHA
git checkout <SHA>
# rebuild frontend if needed, restart backend
cd frontend && yarn build && cd ..
sudo systemctl restart necircle-backend
```

Or roll back only the frontend by keeping a `build.bak/` folder:

```bash
mv frontend/build frontend/build.bak_$(date +%s)
git checkout <good-SHA> -- frontend/
cd frontend && yarn build
```

---

## 16. Quick reference — every URL and port

| What                          | Where                             |
| ----------------------------- | --------------------------------- |
| Landing page                  | https://necircle.in/              |
| Public QR page                | https://necircle.in/p/{tag_id}    |
| Combined admin login+dash     | https://necircle.in/admin         |
| API base                      | https://necircle.in/api/          |
| Backend systemd service       | `necircle-backend`                |
| Backend port (internal only)  | `127.0.0.1:8001`                  |
| Nginx site config             | `/etc/nginx/sites-available/necircle.in` |
| Backend env                   | `~/apps/necircle/backend/.env`    |
| Frontend env (build-time)     | `~/apps/necircle/frontend/.env`   |
| MongoDB data dir              | `/var/lib/mongodb/`               |
| Backups                       | `/var/backups/necircle/`          |
| Let's Encrypt certs           | `/etc/letsencrypt/live/necircle.in/` |
| Admin login                   | `admin@necircle.in` / **change from `Admin@123`** |

---

**Everything above assumes a fresh VPS.** If you're migrating an existing Emergent snapshot, dump the DB there first (`mongodump --db=test_database --archive=... --gzip`) and restore into `necircle` on the VPS with `mongorestore --nsFrom='test_database.*' --nsTo='necircle.*' ...`.
