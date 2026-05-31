# BUILD GUIDE — No Docker
## Fully Manual Installation on Bare Metal

---

## Table of Contents

1. [What OS are you using?](#1-os)
2. [Install Node.js 20+](#2-install-nodejs-20)
3. [Install PostgreSQL](#3-install-postgresql)
4. [Install Redis (Linux/macOS) or Memurai (Windows)](#4-install-redis--memurai)
5. [Clone / Extract the project](#5-clone--extract-project)
6. [Initialize the Database](#6-initialize-database)
7. [Install dependencies](#7-install-dependencies)
8. [Run Backend](#8-run-backend)
9. [Run Frontend](#9-run-frontend)
10. [Build WASM SIMD (optional)](#10-build-wasm-simd-optional)
11. [Production Build](#11-production-build)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. OS

This guide covers all three:

| OS | Read section |
|----|-------------|
| **Windows 10/11** | All — Windows-specific notes included |
| **macOS (Intel + Apple Silicon)** | All — uses Homebrew |
| **Ubuntu / Debian / WSL2** | All — uses apt |

---

## 2. Install Node.js 20+

### Windows

Download installer at: https://nodejs.org/en/download
→ Choose **LTS** → **Windows Installer (.msi)** → run installer

Or use `winget`:
```powershell
winget install OpenJS.NodeJS.LTS
```

Verify:
```powershell
node --version   # v20.x.x
npm --version    # 10.x.x
```

### macOS

```bash
# Using Homebrew (recommended)
brew install node@20
brew link node@20 --force

# Or use nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc   # or ~/.zshrc
nvm install 20
nvm use 20
```

### Ubuntu / Debian / WSL2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

node --version   # v20.x.x
npm --version    # 10.x.x
```

---

## 3. Install PostgreSQL

### Windows

**Option A — EDB Installer (recommended):**
1. Download at: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
2. Choose PostgreSQL 16 → Windows x86-64
3. Run installer, set a password for user `postgres` (remember this password)
4. Default port: `5432`
5. Tick "Stack Builder" → skip it

After installing, open **SQL Shell (psql)** from the Start Menu, or add to PATH:
```
C:\Program Files\PostgreSQL\16\bin
```

Verify:
```powershell
psql --version   # psql (PostgreSQL) 16.x
```

**Option B — Chocolatey:**
```powershell
choco install postgresql16
```

### macOS

```bash
# Homebrew (recommended)
brew install postgresql@16
brew services start postgresql@16

# Add to PATH (add to ~/.zshrc or ~/.bash_profile)
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

# Verify
psql --version
```

### Ubuntu / Debian / WSL2

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify
psql --version
```

---

## 4. Install Redis / Memurai

### Windows → Use Memurai (Redis-compatible, native Windows)

1. Download at: https://www.memurai.com/get-memurai
2. Run installer → installs as a Windows service
3. Runs on port `6379` by default
4. Verify:
```powershell
# Download redis-cli from: https://github.com/microsoftarchive/redis/releases
redis-cli ping   # PONG
```

**Or use WSL2:**
```bash
# In WSL2 terminal
sudo apt install redis-server
sudo service redis-server start
redis-cli ping   # PONG
```

### macOS

```bash
brew install redis
brew services start redis

redis-cli ping   # PONG
```

### Ubuntu / Debian / WSL2

```bash
sudo apt install -y redis-server
sudo systemctl start redis
sudo systemctl enable redis

redis-cli ping   # PONG
```

---

## 5. Clone / Extract Project

```bash
# Extract zip
unzip browser-fingerprint-analyzer.zip

# Enter directory
cd browser-fingerprint-analyzer

# Directory structure
ls
# BUILD.md  README.md  backend/  frontend/  package.json  wasm-simd/  .env.example
```

---

## 6. Initialize Database

### Step 6.1 — Create user and database

**Windows (run in PowerShell or CMD):**
```powershell
# Connect with postgres user
psql -U postgres

# In the psql shell, type:
CREATE DATABASE fingerprint_db;
\q
```

**macOS / Linux:**
```bash
# Create database
createdb fingerprint_db

# Or
psql -U postgres -c "CREATE DATABASE fingerprint_db;"
```

**Ubuntu (postgres is a system user):**
```bash
sudo -u postgres createdb fingerprint_db
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
```

### Step 6.2 — Run SQL schema

```bash
# Windows (PowerShell or CMD)
psql -U postgres -d fingerprint_db -f backend\sql\init.sql

# macOS / Linux
psql -U postgres -d fingerprint_db -f backend/sql/init.sql

# Ubuntu (if sudo is needed)
sudo -u postgres psql -d fingerprint_db -f backend/sql/init.sql
```

Expected output:
```
CREATE EXTENSION
CREATE TABLE
CREATE INDEX
...
CREATE FUNCTION
INSERT 0 8
```

### Step 6.3 — Verify

```bash
psql -U postgres -d fingerprint_db -c "\dt"
```

Output should include:
```
 Schema |        Name        | Type  |  Owner
--------+--------------------+-------+----------
 public | anomaly_log        | table | postgres
 public | entropy_clusters   | table | postgres
 public | fingerprint_scans  | table | postgres
 public | identity_graph     | table | postgres
```

---

## 7. Install Dependencies

### Step 7.1 — Copy environment file

```bash
# macOS / Linux
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

### Step 7.2 — Edit the .env file

Open `.env` in a text editor and review:

```env
# Backend
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# PostgreSQL — change password if you set a different one during install
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fingerprint_db

# Redis / Memurai
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# CORS
CORS_ORIGINS=http://localhost:3000

# Frontend
NUXT_PUBLIC_API_URL=http://localhost:3001
```

> If you set a different password for PostgreSQL, update the `postgres:postgres` part in `DATABASE_URL` to `postgres:YOUR_PASSWORD`.

### Step 7.3 — Install frontend dependencies

```bash
cd frontend
npm install --legacy-peer-deps
cd ..
```

> `--legacy-peer-deps` is required because some packages (radix-vue, monaco-editor) have peer dependency conflicts.

This takes 1–3 minutes. Final output should be:
```
added 1234 packages in 90s
```

### Step 7.4 — Install backend dependencies

```bash
cd backend
npm install --legacy-peer-deps
cd ..
```

---

## 8. Run Backend

### Copy .env file into the backend directory

```bash
# macOS / Linux
cp .env backend/.env

# Windows
Copy-Item .env backend\.env
```

### Start backend

```bash
cd backend
npm run dev
```

Expected output:
```
[Server] Starting Browser Fingerprint Analyzer backend...
[Redis] Connected
[DB] Schema bootstrapped
[Server] Listening on http://0.0.0.0:3001
[Server] tRPC endpoint: http://0.0.0.0:3001/trpc
[Server] Health check: http://0.0.0.0:3001/health
```

### Verify backend is running

Open browser or use curl:
```bash
curl http://localhost:3001/health
```

Response should be:
```json
{
  "server": "ok",
  "database": "ok",
  "redis": "ok",
  "timestamp": "2024-...",
  "uptime": 5.2
}
```

> If `"database": "error"` → check `DATABASE_URL` in `.env`
> If `"redis": "error"` → Redis/Memurai is not running; the app still works but without caching

**Keep this terminal open.** The backend must keep running.

---

## 9. Run Frontend

Open a **new** terminal (keep the backend terminal running):

```bash
cd frontend
npm run dev
```

Expected output:
```
Nuxt 3.x.x with Nitro 2.x.x

  ➜ Local:    http://localhost:3000/
  ➜ Network:  http://192.168.x.x:3000/
```

### Open the app

Navigate to: **http://localhost:3000**

You'll see a start screen with the FP rings animation. Click **▶ Begin Analysis**.

Collection takes roughly **3–8 seconds** depending on the browser:
- Canvas fingerprint: ~0.5s
- Audio fingerprint: ~0.2s
- Font detection (100+ fonts): ~1–3s
- WebRTC ICE gathering: ~2s (auto timeout)
- Permission queries: ~0.5s

---

## 10. Build WASM SIMD (Optional)

> **Skip this step if you don't need it.**
> The app automatically falls back to JS implementations — all features still work fully.
> WASM only provides a performance boost (~4x) for cosine similarity and k-means.

### Install Emscripten SDK

**macOS / Linux / WSL2:**
```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk

./emsdk install 3.1.56
./emsdk activate 3.1.56

# Activate environment (must run every time you open a new terminal)
source ~/emsdk/emsdk_env.sh

# Verify
emcc --version
# emcc (Emscripten gcc/clang-like replacement ...) 3.1.56
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/emscripten-core/emsdk.git C:\emsdk
cd C:\emsdk

.\emsdk install 3.1.56
.\emsdk activate 3.1.56

# Activate
.\emsdk_env.ps1

emcc --version
```

### Build

```bash
cd browser-fingerprint-analyzer/wasm-simd

# Linux / macOS
chmod +x build_wasm.sh
bash build_wasm.sh

# Windows (Git Bash or WSL2)
bash build_wasm.sh
```

Build takes ~30–60 seconds. Output:
```
[WASM] Building fingerprint_simd with Emscripten + SIMD128...
[WASM] Build complete: .../frontend/public/wasm/fingerprint_simd.js + fingerprint_simd.wasm
[WASM] TypeScript stubs written.
```

Files created:
```
frontend/public/wasm/
├── fingerprint_simd.js      # ~350KB
├── fingerprint_simd.wasm    # ~120KB
└── fingerprint_simd.d.ts    # TypeScript types
```

After building, restart the frontend (`Ctrl+C` then `npm run dev` again).
The app will load WASM automatically — check DevTools Console: `[WASM] fingerprint_simd loaded — SIMD acceleration active`

---

## 11. Production Build

### Frontend

```bash
cd frontend
npm run build
# Output: frontend/.output/

# Run production server
node .output/server/index.mjs
# → http://localhost:3000
```

### Backend

```bash
cd backend
npm run build
# Output: backend/dist/

# Run production server
node dist/server.js
```

### Using PM2 (process manager — recommended for production)

```bash
# Install PM2 globally
npm install -g pm2

# Start backend
cd backend
npm run build
pm2 start dist/server.js --name fp-backend

# Start frontend
cd ../frontend
npm run build
pm2 start .output/server/index.mjs --name fp-frontend

# View status
pm2 status

# View logs
pm2 logs fp-backend
pm2 logs fp-frontend

# Auto-restart on reboot
pm2 startup
pm2 save
```

---

## 12. Troubleshooting

### ❌ `npm install` peer dep error

```
npm error ERESOLVE unable to resolve dependency tree
```

**Fix:** Always use `--legacy-peer-deps`:
```bash
npm install --legacy-peer-deps
```

---

### ❌ Backend database connection error

```
[DB] Schema bootstrap failed: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix — Windows:** Open Services (`Win+R` → `services.msc`) → find **postgresql-x64-16** → Start

**Fix — macOS:**
```bash
brew services start postgresql@16
# or
pg_ctl -D /opt/homebrew/var/postgresql@16 start
```

**Fix — Ubuntu:**
```bash
sudo systemctl start postgresql
sudo systemctl status postgresql
```

---

### ❌ Backend Redis error

```
[Redis] Connection failed — running without Redis
```

App still runs normally, just without caching. To fix:

**Windows:** Open Services → find **Memurai** → Start. Or run manually:
```powershell
memurai-server.exe
```

**macOS:**
```bash
brew services start redis
redis-cli ping  # PONG
```

**Ubuntu:**
```bash
sudo systemctl start redis
redis-cli ping  # PONG
```

---

### ❌ Frontend error `Cannot connect to backend`

Check:
1. Is the backend running? (`http://localhost:3001/health`)
2. Does `frontend/.env` or root `.env` have `NUXT_PUBLIC_API_URL=http://localhost:3001`?

```bash
# Test backend from terminal
curl http://localhost:3001/health
```

---

### ❌ Port 3000 or 3001 already in use

**macOS / Linux:**
```bash
lsof -ti :3000 | xargs kill -9
lsof -ti :3001 | xargs kill -9
```

**Windows:**
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F
```

Or change the port in `.env`:
```env
PORT=3002   # backend
```

And in `frontend/nuxt.config.ts`:
```typescript
devServer: { port: 3001 }
```

---

### ❌ `psql: command not found`

**Windows:** Add PostgreSQL to PATH:
```powershell
$env:PATH += ";C:\Program Files\PostgreSQL\16\bin"
# Or add permanently via System Properties → Environment Variables
```

**macOS:**
```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

### ❌ `SharedArrayBuffer is not defined` in Console

Does not affect functionality — only workers can't use lock-free progress.
To fix, serve over HTTP (not `file://`) with the correct headers.
When using `npm run dev`, Nuxt sets headers automatically → this error won't appear.

---

### ❌ Monaco Editor won't load (Raw JSON tab is blank)

Monaco is lazy-loaded when you click the "Raw JSON" tab. The first load may take 2–3 seconds.
If it's still blank, check the DevTools Console for import errors.

```bash
# Try clearing cache and reinstalling
cd frontend
rm -rf node_modules .nuxt
npm install --legacy-peer-deps
npm run dev
```

---

### ❌ WebRTC always returns `No IPs`

This is normal if:
- You're using a VPN (VPN blocks WebRTC leak detection)
- Browser has WebRTC disabled (Firefox `media.peerconnection.enabled = false`)
- Network admin blocks STUN servers

---

## Quick Summary

```
1. Install Node 20+, PostgreSQL 16, Redis/Memurai
2. createdb fingerprint_db
3. psql -U postgres -d fingerprint_db -f backend/sql/init.sql
4. cp .env.example .env  (update password if needed)
5. cd frontend && npm install --legacy-peer-deps
6. cd backend && npm install --legacy-peer-deps
7. Terminal 1: cd backend && npm run dev
8. Terminal 2: cd frontend && npm run dev
9. Open http://localhost:3000
```