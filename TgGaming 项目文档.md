# TgGaming 项目文档

> **Telegram 博弈平台管理系统** — 基于 React + Express + tRPC + MySQL 的全栈应用

---

## 1. 项目概述

TgGaming 是一个 Telegram 博弈平台管理系统，包含三大核心模块：

| 模块 | 说明 | 访问路径 |
|------|------|----------|
| **Admin 后台** | 管理面板（玩家、存取款、奖金、银行、报表、设置） | `/admin` |
| **Player 前台** | 玩家网页端（游戏、存取款、奖金、个人中心） | `/` |
| **Telegram Bot** | Telegram 机器人（注册、存取款、游戏、奖金） | Telegram App |

---

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui |
| **后端** | Express 4 + tRPC 11 + Drizzle ORM |
| **数据库** | MySQL / TiDB (通过 `mysql2` 驱动) |
| **Telegram Bot** | `node-telegram-bot-api` (长轮询模式) |
| **实时通信** | Socket.IO (WebSocket) |
| **文件存储** | AWS S3 |
| **构建工具** | Vite 7 + esbuild |
| **包管理** | pnpm |

---

## 3. 项目结构

```
tggaming/
├── client/                      # 前端代码
│   ├── src/
│   │   ├── App.tsx              # 路由配置
│   │   ├── main.tsx             # 入口 + Provider
│   │   ├── index.css            # 全局样式 + 主题变量
│   │   ├── const.ts             # 前端常量
│   │   ├── lib/
│   │   │   ├── trpc.ts          # tRPC 客户端绑定
│   │   │   └── utils.ts         # 工具函数
│   │   ├── contexts/
│   │   │   ├── AdminAuthContext.tsx   # Admin JWT 认证
│   │   │   ├── PlayerAuthContext.tsx  # Player JWT 认证
│   │   │   └── ThemeContext.tsx       # 主题切换
│   │   ├── pages/
│   │   │   ├── admin/           # Admin 后台页面 (12 个)
│   │   │   │   ├── AdminLogin.tsx
│   │   │   │   ├── AdminDashboard.tsx
│   │   │   │   ├── AdminPlayers.tsx
│   │   │   │   ├── AdminDeposits.tsx
│   │   │   │   ├── AdminWithdrawals.tsx
│   │   │   │   ├── AdminBonuses.tsx
│   │   │   │   ├── AdminBanks.tsx
│   │   │   │   ├── AdminBanners.tsx
│   │   │   │   ├── AdminReports.tsx
│   │   │   │   ├── AdminSettings.tsx
│   │   │   │   ├── AdminLogs.tsx
│   │   │   │   └── AdminSetupGuide.tsx
│   │   │   └── player/          # Player 前台页面 (8 个)
│   │   │       ├── PlayerLogin.tsx
│   │   │       ├── PlayerHome.tsx
│   │   │       ├── PlayerGames.tsx
│   │   │       ├── PlayerDeposit.tsx
│   │   │       ├── PlayerWithdraw.tsx
│   │   │       ├── PlayerBonus.tsx
│   │   │       ├── PlayerHistory.tsx
│   │   │       └── PlayerProfile.tsx
│   │   └── components/          # 共享 UI 组件 (shadcn/ui)
│   └── public/                  # 静态文件 (favicon, robots.txt)
│
├── server/                      # 后端代码
│   ├── _core/                   # 框架层 (不要修改)
│   │   ├── index.ts             # Express 服务器入口
│   │   ├── env.ts               # 环境变量
│   │   ├── trpc.ts              # tRPC 配置
│   │   ├── context.ts           # 请求上下文
│   │   ├── oauth.ts             # OAuth 处理
│   │   ├── llm.ts               # LLM 调用
│   │   ├── notification.ts      # 通知服务
│   │   └── ...
│   ├── db.ts                    # 数据库查询助手
│   ├── storage.ts               # S3 文件存储
│   ├── routers.ts               # 路由汇总
│   ├── routers/
│   │   ├── adminAuth.ts         # Admin + Player 认证路由
│   │   ├── adminBusiness.ts     # Admin 业务路由 (设置/Telegram/银行)
│   │   ├── adminFinance.ts      # Admin 财务路由 (存取款/报表)
│   │   ├── adminPlayers.ts      # Admin 玩家管理路由
│   │   └── playerApi.ts         # Player API 路由
│   └── services/
│       ├── auth.ts              # 认证服务 (JWT/密码)
│       ├── telegramBot.ts       # Telegram Bot 服务
│       ├── middlewave.ts        # Middlewave 游戏 API 整合
│       ├── depositCycle.ts      # 存款周期管理
│       ├── bonus.ts             # 奖金逻辑
│       ├── websocket.ts         # WebSocket 实时通信
│       └── timezone.ts          # 时区管理
│
├── drizzle/                     # 数据库
│   ├── schema.ts                # 表结构定义 (24 张表)
│   ├── relations.ts             # 表关系
│   └── 0000-0004_*.sql          # 迁移文件
│
├── shared/                      # 前后端共享
│   ├── types.ts                 # 共享类型
│   ├── const.ts                 # 共享常量
│   └── i18n.ts                  # 多语言 (EN/ZH)
│
├── package.json
├── vite.config.ts
├── tsconfig.json
├── vitest.config.ts
└── drizzle.config.ts
```

---

## 4. 数据库表结构

共 **24 张表**，以下为核心表说明：

| 表名 | 用途 |
|------|------|
| `admin_accounts` | 管理员账号（master + sub-account） |
| `sub_account_permissions` | 子账号权限矩阵 |
| `players` | 玩家信息（Telegram 注册 + 网页注册） |
| `player_tags` | 玩家标签 |
| `telegram_bots` | Telegram Bot 配置 |
| `telegram_bot_messages` | Bot 多语言消息模板 |
| `banks` | 平台银行账户 |
| `bank_catalog` | 银行名录（Malaysia 28 家银行） |
| `deposits` | 存款记录 |
| `withdrawals` | 取款记录 |
| `deposit_cycles` | 存款周期（Rollover 追踪） |
| `bonus_configs` | 奖金配置 |
| `player_bonuses` | 玩家已领取奖金 |
| `game_logs_cache` | 游戏日志缓存 |
| `system_settings` | 系统设置（Key-Value） |
| `admin_logs` | 操作审计日志 |
| `banners` | 前台轮播图 |
| `country_configs` | 国家/手机号前缀配置 |
| `domain_acl` | 域名访问控制 |
| `refresh_tokens` | JWT Refresh Token |

---

## 5. 本地开发指南

### 5.1 环境要求

| 工具 | 版本要求 |
|------|----------|
| **Node.js** | >= 22.x |
| **pnpm** | >= 10.x |
| **MySQL** | >= 8.0 (或 TiDB) |

### 5.2 克隆与安装

```bash
# 克隆项目
git clone <your-repo-url> tggaming
cd tggaming

# 安装依赖
pnpm install
```

### 5.3 环境变量配置

在项目根目录创建 `.env` 文件：

```env
# ─── 数据库 ───
DATABASE_URL=mysql://root:password@localhost:3306/tggaming?ssl={"rejectUnauthorized":false}

# ─── JWT 密钥 ───
JWT_SECRET=your-random-secret-key-at-least-32-chars

# ─── Manus OAuth (如果不使用可留空) ───
VITE_APP_ID=
OAUTH_SERVER_URL=
VITE_OAUTH_PORTAL_URL=
OWNER_OPEN_ID=
OWNER_NAME=

# ─── 内置 API (如果不使用可留空) ───
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=

# ─── S3 存储 (存款收据/图片上传需要) ───
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_REGION=
# S3_BUCKET=
```

### 5.4 数据库初始化

```bash
# 方法一：使用 drizzle-kit 推送 schema
pnpm drizzle-kit push

# 方法二：手动执行迁移 SQL
# 按顺序执行 drizzle/ 目录下的 SQL 文件：
# 0000_salty_lake.sql → 0001_minor_sage.sql → ... → 0004_late_the_enforcers.sql
mysql -u root -p tggaming < drizzle/0000_salty_lake.sql
mysql -u root -p tggaming < drizzle/0001_minor_sage.sql
mysql -u root -p tggaming < drizzle/0002_worthless_sister_grimm.sql
mysql -u root -p tggaming < drizzle/0003_dazzling_sentinel.sql
mysql -u root -p tggaming < drizzle/0004_late_the_enforcers.sql
```

### 5.5 启动开发服务器

```bash
# 启动开发模式 (前后端同时启动，支持 HMR 热更新)
pnpm dev
```

启动后访问：

| 服务 | 地址 |
|------|------|
| 前台 (Player) | `http://localhost:3000/` |
| 后台 (Admin) | `http://localhost:3000/admin` |
| tRPC API | `http://localhost:3000/api/trpc/*` |

### 5.6 常用开发命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 (HMR) |
| `pnpm build` | 构建生产版本 |
| `pnpm start` | 启动生产服务器 |
| `pnpm test` | 运行测试 (vitest) |
| `pnpm check` | TypeScript 类型检查 |
| `pnpm format` | 代码格式化 (prettier) |
| `pnpm drizzle-kit generate` | 生成数据库迁移 |
| `pnpm drizzle-kit push` | 推送 schema 到数据库 |

### 5.7 修改 Schema 流程

```bash
# 1. 编辑 drizzle/schema.ts
# 2. 生成迁移文件
pnpm drizzle-kit generate
# 3. 查看生成的 SQL 文件 (drizzle/ 目录)
# 4. 执行迁移 SQL
pnpm drizzle-kit push
# 或手动执行 SQL
```

---

## 6. 服务器部署指南

### 6.1 服务器要求

| 项目 | 最低配置 |
|------|----------|
| **OS** | Ubuntu 22.04+ / CentOS 8+ |
| **CPU** | 1 核 |
| **内存** | 1 GB |
| **Node.js** | >= 22.x |
| **MySQL** | >= 8.0 |
| **端口** | 3000 (可自定义) |

### 6.2 部署步骤

```bash
# 1. 上传项目到服务器
scp -r ./tggaming user@your-server:/opt/tggaming

# 2. SSH 到服务器
ssh user@your-server

# 3. 进入项目目录
cd /opt/tggaming

# 4. 安装依赖
pnpm install --frozen-lockfile

# 5. 配置环境变量
cp .env.example .env
nano .env  # 编辑环境变量

# 6. 构建生产版本
pnpm build

# 7. 启动服务
pnpm start
```

### 6.3 使用 PM2 管理进程

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start dist/index.js --name tggaming

# 查看状态
pm2 status

# 查看日志
pm2 logs tggaming

# 设置开机自启
pm2 startup
pm2 save
```

### 6.4 Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/ssl/certs/yourdomain.crt;
    ssl_certificate_key /etc/ssl/private/yourdomain.key;

    # 前端 + API
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket (Socket.IO)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 6.5 使用 Docker 部署 (可选)

```dockerfile
# Dockerfile
FROM node:22-alpine

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 复制源码
COPY . .

# 构建
RUN pnpm build

# 暴露端口
EXPOSE 3000

# 启动
CMD ["node", "dist/index.js"]
```

```bash
# 构建镜像
docker build -t tggaming .

# 运行容器
docker run -d \
  --name tggaming \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  tggaming
```

---

## 7. 首次配置流程

部署完成后，按以下顺序配置系统：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 访问 `/admin` | 首次访问会自动创建 master 管理员 |
| 2 | 设置管理员密码 | 使用默认账号登入后修改密码 |
| 3 | System Settings | 设置平台名称、时区、货币 |
| 4 | Middlewave Token | 填入 API Token 并测试连接 |
| 5 | Country Settings | 添加允许的手机号前缀 (如 `60` = Malaysia) |
| 6 | Telegram Bot | 添加 Bot Token（从 @BotFather 获取） |
| 7 | Banks | 添加平台银行账户 |
| 8 | Bonuses | 配置奖金方案 |

详细说明请参考后台 **System > Setup Guide** 页面。

---

## 8. API 路由总览

所有 API 通过 tRPC 提供，基础路径为 `/api/trpc/`。

### 8.1 认证相关 (`adminAuth.*`)

| 路由 | 类型 | 说明 |
|------|------|------|
| `adminAuth.login` | mutation | Admin 登入 |
| `adminAuth.refreshToken` | mutation | 刷新 Token |
| `adminAuth.me` | query | 获取当前用户信息 |
| `adminAuth.playerLogin` | mutation | Player 网页登入 |
| `adminAuth.playerRegister` | mutation | Player 网页注册 |

### 8.2 Admin 业务 (`adminSettings.*` / `adminTelegram.*`)

| 路由 | 类型 | 说明 |
|------|------|------|
| `adminSettings.list` | query | 获取系统设置 |
| `adminSettings.set` | mutation | 保存设置 |
| `adminSettings.testMiddlewave` | mutation | 测试 Middlewave 连接 |
| `adminSettings.projectInfo` | query | 获取游戏供应商信息 |
| `adminTelegram.bots.list` | query | 获取 Bot 列表 |
| `adminTelegram.bots.create` | mutation | 添加 Bot |
| `adminTelegram.bots.diagnostics` | query | Bot 诊断信息 |

### 8.3 Admin 财务 (`adminDeposits.*` / `adminWithdrawals.*`)

| 路由 | 类型 | 说明 |
|------|------|------|
| `adminDeposits.list` | query | 存款列表 |
| `adminDeposits.approve` | mutation | 批准存款 |
| `adminDeposits.reject` | mutation | 拒绝存款 |
| `adminWithdrawals.list` | query | 取款列表 |
| `adminWithdrawals.approve` | mutation | 批准取款 |
| `adminWithdrawals.reject` | mutation | 拒绝取款 |

### 8.4 Player API (`playerApi.*`)

| 路由 | 类型 | 说明 |
|------|------|------|
| `playerApi.profile` | query | 玩家资料 |
| `playerApi.balance` | query | 余额查询 |
| `playerApi.deposit` | mutation | 提交存款 |
| `playerApi.withdraw` | mutation | 提交取款 |
| `playerApi.games` | query | 游戏列表 |
| `playerApi.bonuses` | query | 奖金列表 |

---

## 9. 外部 API 整合

### 9.1 Middlewave API

Middlewave 是游戏供应商的中间件 API，配置在 `server/services/middlewave.ts`。

| API 端点 | 说明 |
|----------|------|
| `/api/gateway/ProjectInfo` | 获取项目启用的游戏供应商 |
| `/api/gateway/CreatePlayer` | 创建游戏玩家 |
| `/api/gateway/CheckBalance` | 查询余额 |
| `/api/gateway/Deposit` | 游戏充值 |
| `/api/gateway/Withdrawal` | 游戏提现 |
| `/api/gateway/LoginGame` | 获取游戏登入链接 |
| `/api/gateway/GameList` | 获取游戏列表 |
| `/api/gateway/SyncGameLog` | 同步游戏日志 |

**API Base URL:** 由 System Settings 中的 `middlewave_api_url` 配置（默认 `https://api.gt96.xyz`）。

---

## 10. 测试

```bash
# 运行所有测试
pnpm test

# 当前测试覆盖 (80 tests, 8 files)：
# - auth.test.ts          → 密码哈希、JWT 验证
# - auth.logout.test.ts   → 登出流程
# - bonus.test.ts         → 奖金计算逻辑
# - depositCycle.test.ts  → 存款周期管理
# - telegramBot.test.ts   → Bot 诊断功能
# - timezone.test.ts      → 时区转换
# - autoLogin.test.ts     → 自动登入 Token
# - passwordChange.test.ts → 密码修改
```

---

## 11. 常见问题

**Q: Telegram Bot 没有响应？**
检查后台 Settings > Telegram > Diagnose，确认 Polling Status 为 Active。常见原因：Token 无效、另一个 Bot 实例在运行（409 错误）。

**Q: "Games not configured" 错误？**
需要在 System Settings 设置 Middlewave API Token 并测试连接成功。

**Q: 前台无法登入？**
玩家需要先通过 Telegram 注册，然后在 Telegram Settings 中设置密码，才能用网页登入。或者直接在网页注册。

**Q: 数据库连接失败？**
检查 `DATABASE_URL` 格式，确保包含 SSL 参数（TiDB 需要）：`?ssl={"rejectUnauthorized":false}`

---

*文档生成日期：2026-04-13*
