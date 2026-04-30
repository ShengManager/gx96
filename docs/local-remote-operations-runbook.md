# GX96 本地与远端 Server 操作手册（可复用）

这份文件提供一套可复制到其他专案、其他 domain 的标准操作流程（SOP），覆盖：

- 本地开发启动
- 远端服务器部署与更新
- 多 domain 切换要点
- 数据库迁移
- Nginx 反向代理与 SSL
- 常见故障排查
- 回滚流程

---

## 1. 适用对象与前提

适用于 Node.js + MySQL + Vite/Express 单体专案（前后端同仓）部署模式。

本专案关键指令（来自 `package.json`）：

- 开发：`pnpm dev`
- 构建：`pnpm build`
- 生产启动：`pnpm start`
- 类型检查：`pnpm check`
- 迁移：`pnpm db:push`

---

## 2. 目录与环境约定

建议统一约定：

- 本地目录：`D:\project\<project-name>`
- 远端目录：`/var/www/<project-name>`
- 进程管理：`pm2`
- 反向代理：`nginx`
- Node 版本：建议 `20.x`（LTS）
- 包管理器：`pnpm`

---

## 3. 本地开发 SOP

### 3.1 首次准备

1. 安装 Node.js LTS（建议 20）
2. 安装 pnpm  
   `npm i -g pnpm`
3. 安装依赖  
   `pnpm install`

### 3.2 环境变量

建立 `.env`（请用你自己的值，不要直接复制旧专案敏感数据）：

```env
PORT=3002
DATABASE_URL=mysql://<db_user>:<db_password>@<db_host>:3306/<db_name>
JWT_SECRET=<random-strong-secret>
ENCRYPTION_KEY=<random-strong-secret>
CORS_ORIGINS=http://localhost:3002,http://localhost:5174

TOPADMIN_USERNAME=<topadmin_username>
TOPADMIN_PASSWORD=<topadmin_password>
TOPADMIN_TOKEN_SECRET=<topadmin_secret>

TG_BOT_POLLING_ENABLED=false
```

### 3.3 数据库与启动

1. 执行迁移  
   `pnpm db:push`
2. 启动开发环境  
   `pnpm dev`
3. 浏览器访问  
   `http://localhost:3002`

---

## 4. 远端服务器首次部署 SOP

## 4.1 服务器初始化

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pnpm pm2
```

### 4.2 拉代码与安装

```bash
mkdir -p /var/www/<project-name>
cd /var/www/<project-name>
git clone <your-repo-url> .
pnpm install
```

### 4.3 生产环境变量

建立 `/var/www/<project-name>/.env`（示例）：

```env
NODE_ENV=production
PORT=3002
DATABASE_URL=mysql://<db_user>:<db_password>@<db_host>:3306/<db_name>
JWT_SECRET=<random-strong-secret>
ENCRYPTION_KEY=<random-strong-secret>
CORS_ORIGINS=https://<your-domain>,https://www.<your-domain>
TOPADMIN_USERNAME=<topadmin_username>
TOPADMIN_PASSWORD=<topadmin_password>
TOPADMIN_TOKEN_SECRET=<topadmin_secret>
TG_BOT_POLLING_ENABLED=false
```

### 4.4 构建、迁移、启动

```bash
cd /var/www/<project-name>
pnpm build
pnpm db:push
pm2 start "pnpm start" --name <project-name>
pm2 save
pm2 startup
```

---

## 5. Nginx + Domain + SSL SOP

### 5.1 Nginx 反向代理配置

建立 `/etc/nginx/sites-available/<project-name>.conf`：

```nginx
server {
    listen 80;
    server_name <your-domain> www.<your-domain>;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用并重载：

```bash
sudo ln -s /etc/nginx/sites-available/<project-name>.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5.2 SSL（Let's Encrypt）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <your-domain> -d www.<your-domain>
```

自动续签检查：

```bash
sudo certbot renew --dry-run
```

---

## 6. 日常更新部署 SOP（不换 domain）

每次发版建议固定顺序：

```bash
cd /var/www/<project-name>
git fetch --all
git checkout <branch>
git pull
pnpm install
pnpm build
pnpm db:push
pm2 restart <project-name>
pm2 logs <project-name> --lines 100
```

上线后检查：

- 首页是否打开
- 管理后台是否可登录
- 核心 API 是否 200
- WebSocket/通知功能是否正常

---

## 7. 复制到“其他专案 / 其他 Domain”清单

做新站时，只替换这几类：

1. **Domain 相关**
   - `server_name`
   - SSL 证书域名
   - `.env` 里的 `CORS_ORIGINS`
2. **数据库相关**
   - `DATABASE_URL`（建议每站独立 DB）
3. **安全相关**
   - `JWT_SECRET`
   - `ENCRYPTION_KEY`
   - `TOPADMIN_*`
4. **进程与目录**
   - PM2 名称 `<project-name>`
   - 部署目录 `/var/www/<project-name>`

强烈建议：每个 domain 一套独立 `.env`、独立数据库、独立 PM2 名称。

---

## 8. 回滚 SOP（出问题时）

### 8.1 快速回滚代码

```bash
cd /var/www/<project-name>
git log --oneline -n 10
git checkout <last-good-commit>
pnpm install
pnpm build
pm2 restart <project-name>
```

### 8.2 数据库回滚

本专案目前流程偏向“向前迁移”，若要安全回滚：

- 上线前先做 DB 备份（必做）
- 高风险改动先在 staging 演练
- 避免在高峰期执行结构变更

---

## 9. 常见故障排查

### 9.1 打不开网页 / 502

检查：

```bash
pm2 status
pm2 logs <project-name> --lines 200
sudo systemctl status nginx
sudo nginx -t
```

### 9.2 前端白屏 / 黑屏

- 先看浏览器 Console
- 再看 API 是否 401/403/500
- 检查权限守卫是否造成跳转循环

### 9.3 API 401/403

- 确认 token 是否有效
- 确认子账号 permission 是否开了对应 module
- 确认路由权限守卫与 sidebar 权限一致

### 9.4 API 500

- 查 `pm2 logs`
- 查数据库连接与 SQL schema
- 检查 `.env` 是否缺变量

---

## 10. 安全建议（强制执行）

- 不要把真实 `.env`、密钥、DB 密码提交到 git
- 每个新站生成新的密钥，不共用旧站密钥
- 限制数据库来源 IP
- 定期备份数据库并做恢复演练

---

## 11. 建议再加的标准化文件

为便于其他项目复用，建议补这些文件（未来可让我帮你一起做）：

- `docs/deploy-checklist.md`：上线检查清单
- `docs/rollback-checklist.md`：回滚步骤清单
- `ecosystem.config.cjs`：PM2 固定配置
- `.env.example`：环境变量模板

---

## 12. 一键复制模板（最短版）

新项目最短流程：

1. 复制仓库
2. 填 `.env`（domain/db/secret）
3. `pnpm install && pnpm build && pnpm db:push`
4. `pm2 start "pnpm start" --name <project-name>`
5. 配 nginx + certbot
6. 用检查清单验证

完成后即具备可上线与可维护能力。

