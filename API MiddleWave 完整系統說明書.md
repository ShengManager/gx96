# API MiddleWave 完整系統說明書

> **版本**：3.0 | **日期**：2026-04-05
> **技術棧**：Node.js + TypeScript + Express + tRPC + React + MySQL
> **認證方式**：帳號密碼 + JWT（獨立系統，不依賴第三方）

---

## 目錄

- [系統概覽](#系統概覽)
- [PART A：伺服器環境建立（DigitalOcean Ubuntu）](#part-a伺服器環境建立digitalocean-ubuntu)
- [PART B：本地開發環境（你的電腦 + Cursor）](#part-b本地開發環境你的電腦--cursor)
- [PART C：本地代碼上傳到伺服器](#part-c本地代碼上傳到伺服器)
- [PART D：修改廠商 API 適配器](#part-d修改廠商-api-適配器)
- [PART E：系統使用教學](#part-e系統使用教學)
- [PART F：Gateway API 完整文檔](#part-fgateway-api-完整文檔)
- [PART G：常見問題](#part-g常見問題)

---

## 系統概覽

API MiddleWave 是一個遊戲 API 聚合平台。整體架構分為兩個環境：

```
┌─────────────────────────────────────────────────────────────────┐
│                     你的電腦（本地開發）                           │
│                                                                 │
│   Cursor 編輯器 打開 api-middlewave 資料夾                        │
│   ├── client/src/pages/    ← 修改前端頁面（React）                │
│   ├── server/adapters/     ← 修改遊戲廠商 API 對接邏輯            │
│   ├── server/routers.ts    ← 修改後台管理 API                    │
│   └── drizzle/schema.ts   ← 修改資料庫結構                       │
│                                                                 │
│   修改完成後 → git push / scp / Cursor SSH Remote 上傳           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│           DigitalOcean Ubuntu Server                             │
│           Domain: api.gt96.xyz                                  │
│                                                                 │
│   Nginx (port 80/443)                                           │
│   ├── https://api.gt96.xyz       → Node.js :3000                │
│   └── https://db.gt96.xyz        → phpMyAdmin（資料庫管理）       │
│                                                                 │
│   Node.js + PM2 (port 3000)                                     │
│   ├── /                    ← 前端靜態文件（pnpm build 後產生）    │
│   ├── /api/auth/*          ← 帳號密碼 登入/註冊 API              │
│   ├── /api/trpc/*          ← 後台管理 API（tRPC）                │
│   └── /api/gateway/*       ← 遊戲 Gateway API（Token 認證）     │
│                                                                 │
│   MySQL 8.0 (port 3306)                                         │
│   └── api_middlewave 資料庫                                      │
│                                                                 │
│   phpMyAdmin → 用瀏覽器查看/編輯/搜尋資料庫                       │
└─────────────────────────────────────────────────────────────────┘
```

**已整合的遊戲廠商**：

| 廠商 | 認證方式 | 遊戲類型 |
|------|----------|----------|
| EpicWin | MD5 簽名 | Web |
| MegaH5 | MD5 簽名（與 EpicWin 共用適配器）| H5 |
| BigPot | MD5 Hash + 參數排序 | Web |
| PussyH5 | DES 加密 + MD5 簽名 | H5 |

---

## PART A：伺服器環境建立（DigitalOcean Ubuntu）

> 以下所有命令都在 **伺服器上** 執行（SSH 連線後）。

### A1. 購買 DigitalOcean Droplet

在 [DigitalOcean](https://www.digitalocean.com/) 建立 Droplet：

| 項目 | 推薦 |
|------|------|
| OS | Ubuntu 22.04 LTS |
| 規格 | 2 vCPU / 4GB RAM（$24/月）|
| 區域 | Singapore |
| 認證 | SSH Key（推薦）|

建立後記下 **IP 地址**（例如 `167.71.xxx.xxx`）。

### A2. SSH 連線到伺服器

```bash
ssh root@167.71.xxx.xxx
```

### A3. 安裝所有必要軟件

一次性執行以下命令：

```bash
# ═══ 1. 更新系統 ═══
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential unzip

# ═══ 2. 安裝 Node.js 22 ═══
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # 確認顯示 v22.x.x

# ═══ 3. 安裝 pnpm + PM2 ═══
sudo npm install -g pnpm pm2

# ═══ 4. 安裝 MySQL 8 ═══
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql

# ═══ 5. 安裝 Nginx ═══
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# ═══ 6. 防火牆 ═══
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw allow 8080/tcp    # phpMyAdmin
sudo ufw --force enable
```

### A4. 建立 MySQL 資料庫

```bash
sudo mysql
```

在 MySQL 命令行中執行（**請替換密碼**）：

```sql
CREATE DATABASE api_middlewave CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'middlewave'@'localhost' IDENTIFIED BY '替換成你的強密碼';
GRANT ALL PRIVILEGES ON api_middlewave.* TO 'middlewave'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### A5. 安裝 phpMyAdmin（可視化資料庫管理）

phpMyAdmin 讓你用瀏覽器直接查看、編輯、搜尋資料庫。

```bash
# 安裝 phpMyAdmin + PHP
sudo apt install -y phpmyadmin php-mbstring php-zip php-gd php-json php-curl php-fpm

# 安裝過程中：
# 1. 選擇 apache2（按空格選中，按 Tab 到 OK）
# 2. 選擇 Yes 配置 dbconfig-common
# 3. 設定 phpMyAdmin 密碼

sudo phpenmod mbstring
```

建立 phpMyAdmin 的 Nginx 配置：

```bash
sudo tee /etc/nginx/sites-available/db.gt96.xyz << 'NGINX'
server {
    listen 80;
    server_name db.gt96.xyz;

    root /usr/share/phpmyadmin;
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php-fpm.sock;
    }

    location ~ /\.ht {
        deny all;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/db.gt96.xyz /etc/nginx/sites-enabled/
sudo systemctl restart php*-fpm
sudo systemctl reload nginx
```

### A6. 設定 Domain（Namecheap DNS）

在 Namecheap 的 **Advanced DNS** 管理中，添加以下 A 記錄：

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | api | `你的伺服器IP` | Automatic |
| A | db | `你的伺服器IP` | Automatic |

等待 DNS 生效（通常 5-30 分鐘）。

### A7. 設定 Nginx 反向代理

```bash
# API 服務配置
sudo tee /etc/nginx/sites-available/api.gt96.xyz << 'NGINX'
server {
    listen 80;
    server_name api.gt96.xyz;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/api.gt96.xyz /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### A8. 安裝 SSL 憑證（HTTPS）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.gt96.xyz -d db.gt96.xyz
sudo systemctl enable certbot.timer
```

完成後：
- `https://api.gt96.xyz` → 你的 API 服務 + 前端管理後台
- `https://db.gt96.xyz` → phpMyAdmin 資料庫管理

### A9. 上傳專案到伺服器

```bash
# 建立專案目錄
sudo mkdir -p /opt/api-middlewave
sudo chown $USER:$USER /opt/api-middlewave
```

上傳方式見 [PART C](#part-c本地代碼上傳到伺服器)。

### A10. 建立環境變數

```bash
nano /opt/api-middlewave/.env
```

填入以下內容（**替換所有標記的值**）：

```env
# ═══ 資料庫 ═══
DATABASE_URL=mysql://middlewave:你的MySQL密碼@localhost:3306/api_middlewave

# ═══ 安全密鑰（用 openssl rand -hex 32 生成）═══
JWT_SECRET=貼上生成的隨機字串1
ENCRYPTION_KEY=貼上生成的隨機字串2

# ═══ CORS（允許哪些網址訪問 API）═══
CORS_ORIGINS=https://api.gt96.xyz

# ═══ 前端 API 地址 ═══
VITE_API_BASE_URL=https://api.gt96.xyz

# ═══ 環境 ═══
NODE_ENV=production
```

生成隨機密鑰：

```bash
# 執行兩次，分別用於 JWT_SECRET 和 ENCRYPTION_KEY
openssl rand -hex 32
```

> **重要**：`JWT_SECRET` 用於登入認證，`ENCRYPTION_KEY` 用於加密廠商 API 憑證。設定後不要隨意更改，否則已加密的憑證會無法解密。

### A11. 初始化資料庫 + 啟動服務

```bash
cd /opt/api-middlewave

# 安裝依賴
pnpm install

# 打包前端 + 編譯後端
pnpm build

# 導入資料庫結構
mysql -u middlewave -p api_middlewave < init-database.sql

# 用 PM2 啟動服務
pm2 start ecosystem.config.cjs

# 設為開機自動啟動
pm2 save
pm2 startup
# 按照提示執行顯示的 sudo 命令
```

### A12. 驗證安裝

```bash
# 確認服務運行中
pm2 status

# 確認 API 可訪問
curl http://localhost:3000/api/auth/register \
  -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","name":"Admin"}'
```

打開瀏覽器訪問 `https://api.gt96.xyz`，應該看到登入頁面。

### A13. phpMyAdmin 常用操作

打開 `https://db.gt96.xyz`，用 `middlewave` 帳號登入。

| 操作 | 步驟 |
|------|------|
| 查看所有表 | 左側點擊 `api_middlewave` |
| 瀏覽資料 | 點擊表名 → Browse |
| 編輯一筆資料 | 點擊該行的 Edit |
| 新增資料 | 點擊 Insert 標籤 |
| 執行 SQL | 點擊 SQL 標籤 |
| 匯出資料 | 點擊 Export 標籤（支援 CSV、SQL、Excel）|
| 搜尋資料 | 點擊 Search 標籤 |

**替代方案：DBeaver 桌面工具**

在你的電腦安裝 [DBeaver](https://dbeaver.io/download/)，透過 SSH Tunnel 連接：

```bash
# 在你的電腦建立 SSH 隧道
ssh -L 3307:localhost:3306 root@你的伺服器IP

# DBeaver 連接 localhost:3307，資料庫 api_middlewave
```

---

## PART B：本地開發環境（你的電腦 + Cursor）

### B1. 安裝本地工具

你的電腦只需要安裝：

| 工具 | 用途 | 下載 |
|------|------|------|
| Node.js 22 | 運行 JavaScript | [nodejs.org](https://nodejs.org) |
| pnpm | 套件管理器 | `npm install -g pnpm` |
| Cursor | 代碼編輯器 | [cursor.sh](https://cursor.sh) |
| Git | 版本控制 | [git-scm.com](https://git-scm.com) |

### B2. 解壓專案

將下載的 `api-middlewave-complete.zip` 解壓到你想要的位置：

```bash
# Windows 例子
C:\Projects\api-middlewave\

# Mac 例子
~/Projects/api-middlewave/
```

### B3. 用 Cursor 打開

1. 打開 Cursor
2. File → Open Folder → 選擇 `api-middlewave`
3. 按 `` Ctrl+` `` 打開終端機
4. 執行 `pnpm install`

### B4. 專案結構（你需要知道的文件）

```
api-middlewave/
│
├── client/src/                    ← ★ 前端代碼
│   ├── pages/
│   │   ├── Login.tsx              ← 登入/註冊頁面
│   │   ├── Home.tsx               ← Dashboard 首頁
│   │   ├── Projects.tsx           ← 專案列表
│   │   ├── ProjectDetail.tsx      ← 專案詳情（配置 Provider、填 API 憑證）
│   │   ├── Players.tsx            ← 玩家管理
│   │   ├── Transactions.tsx       ← 交易記錄
│   │   ├── GameLogs.tsx           ← 遊戲日誌
│   │   └── ApiDocs.tsx            ← API 文檔頁面
│   ├── components/
│   │   └── DashboardLayout.tsx    ← 側邊欄佈局
│   ├── App.tsx                    ← 路由配置
│   ├── main.tsx                   ← 入口（VITE_API_BASE_URL 在這裡讀取）
│   └── index.css                  ← 全局樣式
│
├── server/                        ← ★ 後端代碼
│   ├── adapters/                  ← ★★★ 遊戲廠商適配器（最常修改）
│   │   ├── base.ts                ← 適配器介面（不要改）
│   │   ├── epicwin.ts             ← EpicWin / MegaH5
│   │   ├── bigpot.ts              ← BigPot
│   │   ├── pussyh5.ts             ← PussyH5
│   │   └── index.ts               ← 適配器註冊中心
│   ├── gateway/
│   │   ├── routes.ts              ← Gateway API 路由（Token 認證）
│   │   └── service.ts             ← Gateway 業務邏輯（轉帳錢包等）
│   ├── services/
│   │   ├── crypto.ts              ← 加密工具（AES-256-CBC）
│   │   └── gamelogCollector.ts    ← GameLog 定時收集器（每5分鐘）
│   ├── _core/                     ← ⚠️ 框架核心（不要改）
│   │   ├── sdk.ts                 ← JWT 認證邏輯
│   │   ├── oauth.ts               ← 登入/註冊 API 路由
│   │   └── index.ts               ← Express 入口
│   ├── db.ts                      ← 資料庫查詢
│   └── routers.ts                 ← tRPC 路由（後台管理 API）
│
├── drizzle/
│   └── schema.ts                  ← 資料庫表結構定義
│
├── .env.example                   ← 環境變數範例（複製為 .env）
├── init-database.sql              ← 資料庫初始化 SQL
├── ecosystem.config.cjs           ← PM2 配置
└── package.json                   ← 依賴管理
```

### B5. 設定本地環境變數（可選）

如果你想在本地運行開發伺服器（連接遠端資料庫）：

```bash
cp .env.example .env
```

編輯 `.env`：

```env
# 連接伺服器的 MySQL（需要先開放遠端訪問，見 PART G Q1）
DATABASE_URL=mysql://middlewave:密碼@你的伺服器IP:3306/api_middlewave

# 與伺服器相同的密鑰
JWT_SECRET=與伺服器.env相同的值
ENCRYPTION_KEY=與伺服器.env相同的值

# 本地開發用
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
VITE_API_BASE_URL=http://localhost:3000
```

啟動本地開發：

```bash
pnpm dev
```

- 前端：`http://localhost:5173`（自動熱更新）
- 後端：`http://localhost:3000`

> **注意**：如果不想開放伺服器 MySQL 的遠端訪問，你也可以在本地安裝 MySQL（見 PART G Q2），或者直接用 Cursor SSH Remote 在伺服器上編輯（見 PART C 方法三）。

### B6. 你會修改哪些文件？

| 目的 | 文件 |
|------|------|
| 調整廠商 API 邏輯（URL、簽名、參數）| `server/adapters/epicwin.ts` 等 |
| 新增遊戲廠商 | 新建 `server/adapters/xxx.ts` + 修改 `index.ts` |
| 修改前端頁面 | `client/src/pages/*.tsx` |
| 修改後台管理 API | `server/routers.ts` |
| 修改 Gateway API 邏輯 | `server/gateway/service.ts` |
| 修改資料庫結構 | `drizzle/schema.ts` |
| 修改全局樣式/主題 | `client/src/index.css` |

---

## PART C：本地代碼上傳到伺服器

### 方法一：Git（推薦）

**第一次設定**：

```bash
# ─── 在你的電腦 ───
cd api-middlewave
git init
git add .
git commit -m "Initial commit"

# 在 GitHub 建立倉庫後
git remote add origin https://github.com/你的帳號/api-middlewave.git
git push -u origin main

# ─── 在伺服器 ───
cd /opt
git clone https://github.com/你的帳號/api-middlewave.git
cd api-middlewave
pnpm install
# 建立 .env（見 PART A A10）
```

**每次修改後**：

```bash
# ─── 在你的電腦（Cursor 終端機）───
git add .
git commit -m "修改了什麼"
git push

# ─── 在伺服器 ───
cd /opt/api-middlewave
git pull
pnpm install    # 如果有新依賴
pnpm build
pm2 restart api-middlewave
```

**快速部署腳本**（在伺服器上建立一次）：

```bash
cat > /opt/api-middlewave/deploy.sh << 'EOF'
#!/bin/bash
cd /opt/api-middlewave
echo ">>> 拉取最新代碼..."
git pull
echo ">>> 安裝依賴..."
pnpm install
echo ">>> 編譯打包..."
pnpm build
echo ">>> 重啟服務..."
pm2 restart api-middlewave
echo ">>> 完成！"
pm2 status
EOF
chmod +x /opt/api-middlewave/deploy.sh
```

以後每次部署只需：`/opt/api-middlewave/deploy.sh`

### 方法二：SCP / SFTP 直接上傳

```bash
# 在你的電腦執行
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='.env' \
  ./api-middlewave/ root@你的伺服器IP:/opt/api-middlewave/
```

或用圖形化 SFTP 工具（FileZilla / WinSCP / Cyberduck）連接伺服器，拖拽上傳。

### 方法三：Cursor SSH Remote（最方便）

直接在 Cursor 中編輯伺服器上的文件，不需要上傳步驟：

1. 安裝 Cursor 的 **Remote - SSH** 擴展
2. `Ctrl+Shift+P` → `Remote-SSH: Connect to Host`
3. 輸入 `root@你的伺服器IP`
4. File → Open Folder → `/opt/api-middlewave`
5. 現在你直接在伺服器上編輯文件
6. 修改後在 Cursor 終端機中執行 `pnpm build && pm2 restart api-middlewave`

---

## PART D：修改廠商 API 適配器

### D1. 修改現有廠商

以 EpicWin 為例，打開 `server/adapters/epicwin.ts`：

**修改 API URL**：找到 `DEFAULT_URLS` 常量

```typescript
const DEFAULT_URLS: Record<string, string> = {
  EpicWin: "https://api.epicwin88.com",   // ← 改這裡
  MegaH5: "https://api.megah5.com",       // ← 改這裡
};
```

**修改簽名算法**：找到 `buildSign` 方法

```typescript
private buildSign(functionName: string, dateTime: string): string {
  const raw = functionName + dateTime + this.operatorId + this.secretKey;
  return crypto.createHash("md5").update(raw).digest("hex");
}
```

### D2. 新增一個新廠商

**步驟 1**：建立 `server/adapters/newgame.ts`

```typescript
import crypto from "crypto";
import axios from "axios";
import {
  GameAdapter, AdapterConfig, GameInfo, PlayerResult,
  BalanceResult, TransferResult, GameLaunchResult, GameLogEntry
} from "./base";

export class NewGameAdapter implements GameAdapter {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: AdapterConfig) {
    this.apiKey = config.credentials.apiKey;
    this.baseUrl = config.apiBaseUrl || "https://api.newgame.com";
  }

  async createPlayer(playerId: string): Promise<PlayerResult> {
    // 根據廠商 API 文檔實現
    const res = await axios.post(`${this.baseUrl}/player/create`, {
      api_key: this.apiKey,
      player_id: playerId,
    });
    return { success: true, playerId };
  }

  async getBalance(playerId: string): Promise<BalanceResult> {
    // 實現查詢餘額
    return { success: true, balance: 0 };
  }

  async deposit(playerId: string, amount: number, txnId: string): Promise<TransferResult> {
    // 實現存款
    return { success: true, balance: amount, txnId };
  }

  async withdraw(playerId: string, amount: number, txnId: string): Promise<TransferResult> {
    // 實現提款
    return { success: true, balance: 0, txnId };
  }

  async kickPlayer(playerId: string): Promise<{ success: boolean }> {
    return { success: true };
  }

  async getGameList(): Promise<GameInfo[]> {
    return [];
  }

  async launchGame(playerId: string, gameCode: string, lang: string): Promise<GameLaunchResult> {
    return { success: true, url: "", type: "web" };
  }

  async pullGameLogs(startTime: Date, endTime: Date): Promise<GameLogEntry[]> {
    return [];
  }

  async testConnection(): Promise<{ success: boolean; message: string; latency: number }> {
    const start = Date.now();
    try {
      await this.getGameList();
      return { success: true, message: "OK", latency: Date.now() - start };
    } catch (e: any) {
      return { success: false, message: e.message, latency: Date.now() - start };
    }
  }
}
```

**步驟 2**：在 `server/adapters/index.ts` 註冊

```typescript
import { NewGameAdapter } from "./newgame";
// 在 adapterMap 中添加：
adapterMap.set("NewGame", NewGameAdapter);
```

**步驟 3**：在資料庫添加廠商記錄（用 phpMyAdmin 或 SQL）

```sql
INSERT INTO providers (name, code, type, status, supportedCurrencies)
VALUES ('New Game', 'NewGame', 'web', 'active', 'MYR,USD,THB');
```

**步驟 4**：在前端 `client/src/pages/ProjectDetail.tsx` 的 `PROVIDER_FIELDS` 添加憑證欄位

```typescript
const PROVIDER_FIELDS: Record<string, FieldConfig[]> = {
  // ... 現有廠商 ...
  NewGame: [
    { key: "apiKey", label: "API Key", required: true },
    { key: "secretKey", label: "Secret Key", required: true },
  ],
};
```

---

## PART E：系統使用教學

### E1. 登入系統

打開 `https://api.gt96.xyz`，你會看到登入頁面。

**首次使用**：
1. 點擊「Register」標籤
2. 填入用戶名、密碼、姓名、Email
3. 點擊「Register」完成註冊
4. 自動跳轉到 Dashboard

**設定管理員**：在 phpMyAdmin 打開 `users` 表，將你的帳號的 `role` 改為 `admin`。

### E2. 建立專案

1. 左側選單 → Projects
2. 點擊 New Project
3. 填入：
   - Project Name：`MyGameSite`
   - Currency：`MYR`
   - Timezone：`Asia/Kuala_Lumpur`
4. 系統自動生成 **Token**（用於調用 Gateway API）

### E3. 添加遊戲廠商

1. 進入專案詳情 → Providers 標籤
2. 點擊 Add Provider
3. 選擇廠商（如 EpicWin）
4. 填入廠商提供的 API 憑證
5. 點擊 Add Provider
6. 點擊 **Test** 按鈕驗證連線

### E4. 使用 Gateway API

複製專案的 Token，用 curl 或你的應用程式調用：

```bash
curl -X POST https://api.gt96.xyz/api/gateway/GameList \
  -H "Authorization: Bearer 你的Token" \
  -H "Content-Type: application/json" \
  -d '{"provider": "EpicWin"}'
```

---

## PART F：Gateway API 完整文檔

**Base URL**：`https://api.gt96.xyz/api/gateway/`
**認證**：Header `Authorization: Bearer <project_token>`

### CreatePlayer — 建立玩家

```
POST /api/gateway/CreatePlayer
```

```json
{ "provider": "EpicWin", "playerId": "player001" }
```

### CheckBalance — 查詢餘額

```
POST /api/gateway/CheckBalance
```

```json
{ "provider": "EpicWin", "playerId": "player001" }
```

回應：`{ "success": true, "balance": 1500.50 }`

### Deposit — 存款

```
POST /api/gateway/Deposit
```

```json
{ "provider": "EpicWin", "playerId": "player001", "amount": 100 }
```

### Withdrawal — 提款

```
POST /api/gateway/Withdrawal
```

```json
{ "provider": "EpicWin", "playerId": "player001", "amount": 50 }
```

### KickPlayer — 踢出玩家

```
POST /api/gateway/KickPlayer
```

```json
{ "provider": "EpicWin", "playerId": "player001" }
```

### GameList — 遊戲列表

```
POST /api/gateway/GameList
```

```json
{ "provider": "EpicWin" }
```

不填 provider 則返回所有廠商的遊戲。

### LoginGame — 登入遊戲（自動轉帳錢包）

```
POST /api/gateway/LoginGame
```

```json
{
  "provider": "BigPot",
  "playerId": "player001",
  "gameCode": "slot_001",
  "lang": "en"
}
```

系統自動執行：
1. 從前一個遊戲回收餘額
2. 將餘額轉入新遊戲
3. 返回遊戲 URL

### SyncGameLog — 手動同步遊戲記錄

```
POST /api/gateway/SyncGameLog
```

```json
{ "provider": "EpicWin" }
```

不填 provider 則同步所有廠商。

---

## PART G：常見問題

### Q1：本地開發時如何連接伺服器的 MySQL？

在伺服器上開放 MySQL 遠端訪問：

```bash
# 修改 MySQL 配置
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
# 找到 bind-address，改為：
# bind-address = 0.0.0.0

sudo systemctl restart mysql
sudo ufw allow 3306/tcp

# 授權遠端訪問
sudo mysql -e "CREATE USER 'middlewave'@'%' IDENTIFIED BY '你的密碼'; GRANT ALL ON api_middlewave.* TO 'middlewave'@'%'; FLUSH PRIVILEGES;"
```

> **安全建議**：生產環境建議用 SSH Tunnel 而不是直接開放 3306 端口。

### Q2：不想開放遠端 MySQL，如何在本地安裝？

**Windows**：下載 [MySQL Installer](https://dev.mysql.com/downloads/installer/)
**Mac**：`brew install mysql && brew services start mysql`

```sql
CREATE DATABASE api_middlewave CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
mysql -u root -p api_middlewave < init-database.sql
```

### Q3：更新代碼後伺服器沒有生效？

```bash
cd /opt/api-middlewave
git pull           # 或重新上傳文件
pnpm install       # 安裝新依賴
pnpm build         # 重新編譯
pm2 restart api-middlewave   # 重啟服務
```

### Q4：如何查看伺服器日誌？

```bash
pm2 logs api-middlewave           # 即時日誌
pm2 logs api-middlewave --lines 100  # 最近 100 行
pm2 logs --err                    # 只看錯誤
```

### Q5：JWT_SECRET 或 ENCRYPTION_KEY 改了怎麼辦？

- `JWT_SECRET` 改了：所有用戶需要重新登入
- `ENCRYPTION_KEY` 改了：所有已加密的廠商 API 憑證會無法解密，需要在 phpMyAdmin 中刪除 `project_providers` 表的記錄，重新填寫

### Q6：如何備份/還原資料庫？

```bash
# 備份
mysqldump -u middlewave -p api_middlewave > backup_$(date +%Y%m%d).sql

# 還原
mysql -u middlewave -p api_middlewave < backup_20260405.sql
```

### Q7：如何生成隨機密鑰？

```bash
openssl rand -hex 32
```

### Q8：phpMyAdmin 無法訪問？

```bash
sudo systemctl status php*-fpm    # 確認 PHP 運行中
sudo nginx -t                     # 確認 Nginx 配置正確
sudo ufw allow 8080/tcp           # 確認防火牆開放
```

---

> **有任何問題，隨時詢問！**
