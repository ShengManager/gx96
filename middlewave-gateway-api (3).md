# Middlewave 统一网关 API 集成说明

> 本文档供人工对接与 **AI / RAG 解析** 使用。版本与仓库实现一致；请以实际部署环境为准。

## 1. 基本信息

- **Base URL（示例）**: `https://api.gt96.xyz`
- **网关前缀**: `/api/gateway`
- **协议**: HTTPS 推荐；本地开发可为 HTTP。
- **内容类型**: `Content-Type: application/json`（网关路由主体为 JSON）。

## 2. 认证（所有 /api/gateway/* 路由，Mega888 公开回调除外）

从 Dashboard → Project → **API Token** 复制项目令牌。

请求头任选其一：

```http
Authorization: Bearer <project_token>
# 或（部分代理会剥掉 Authorization）
X-Project-Token: <project_token>
```

- Token 中的换行、首尾引号会被服务端规范化。
- 项目状态须为 **active**，否则 401。
- 未配置 `DATABASE_URL` 时可能返回 503。

## 3. 厂商代码 provider

与数据库 `providers.code` 一致，常见写法如下（**大小写不敏感**匹配到适配器）：

| Code | 说明 |
|------|------|
| `EpicWin` | 与 DB `providers.code` 一致；传参大小写不敏感亦可匹配 |
| `MegaH5` | EpicWin 系 API |
| `Mega888` | 下载端 / 厂商回调见下文 |
| `BigPot` | — |
| `PussyH5` | — |
| `918KissH5` | — |

## 4. 项目点数策略（pointPoolMode）

- **exclusive（默认）**: 入金后须将该厂商余额出清后才能再入金；进游戏前会把其它厂商钱包里有余额的部分划转到本次要玩的厂商（失败则不进游戏）。
- **multi**: 各厂商余额独立管理，换游戏不自动划转。
逻辑由中间层 `gateway` 与数据库项目字段控制，对接方只需处理 API 返回的 `success` / `error`。

## 5. 端点一览

### POST `/api/gateway/ProjectInfo`

读取当前 Token 对应项目的游戏开关状态与各厂商启用状态（用于对接前自检）。

**英文**: Get project game status and provider enablement.

**JSON 字段**: （见示例）

**请求示例**:
```json
{}
```

**响应示例**（实际字段因厂商而异）:
```json
{
  "success": true,
  "project": {
    "id": 1,
    "name": "Demo Project",
    "status": "active",
    "pointPoolMode": "exclusive",
    "gameEnabled": true
  },
  "providers": [
    {
      "providerId": 1,
      "providerCode": "EpicWin",
      "providerName": "EpicWin",
      "status": "active"
    },
    {
      "providerId": 2,
      "providerCode": "918KissH5",
      "providerName": "918KissH5",
      "status": "inactive"
    }
  ],
  "activeProviderCount": 1
}
```

**cURL**:
```bash
curl -sS -X POST 'https://api.gt96.xyz/api/gateway/ProjectInfo' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_PROJECT_TOKEN' \
  -d '{}'
```

### POST `/api/gateway/CreatePlayer`

在指定游戏厂商侧注册玩家（若已注册则返回成功说明）。

**英文**: Register the player with the given game provider.

**JSON 字段**: `provider`（必填），`playerId`（必填）

- `playerId` 为你的站点用户唯一 ID（与 Dashboard Players 中一致）。
- 成功时 `providerData`、`providerPlayerId` 含厂商返回的帐号扩展信息（各厂字段不同，可能含 `password`、`loginId` 等）。
- 若需再次查询已保存的帐号/密码，请使用 **GetPlayerProviderAccounts**（读中间层数据库，非实时向厂商重查）。

**请求示例**:
```json
{
  "provider": "EpicWin",
  "playerId": "site_user_001"
}
```

**响应示例**（实际字段因厂商而异）:
```json
{
  "success": true,
  "message": "ok",
  "playerId": "site_user_001",
  "providerPlayerId": "site_user_001",
  "providerData": {}
}
```

**cURL**:
```bash
curl -sS -X POST 'https://api.gt96.xyz/api/gateway/CreatePlayer' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_PROJECT_TOKEN' \
  -d '{"provider":"EpicWin","playerId":"site_user_001"}'
```

### POST `/api/gateway/CheckBalance`

查询玩家在指定厂商钱包余额（按厂商维度，非单一 gameCode）。

**英文**: Check wallet balance at the provider.

**JSON 字段**: `provider`（必填），`playerId`（必填）

**请求示例**:
```json
{
  "provider": "EpicWin",
  "playerId": "site_user_001"
}
```

**响应示例**（实际字段因厂商而异）:
```json
{
  "success": true,
  "balance": 100.5,
  "currency": "MYR"
}
```

**cURL**:
```bash
curl -sS -X POST 'https://api.gt96.xyz/api/gateway/CheckBalance' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_PROJECT_TOKEN' \
  -d '{"provider":"EpicWin","playerId":"site_user_001"}'
```

### POST `/api/gateway/Deposit`

向厂商钱包入金。项目在 Dashboard 设为 exclusive 时，若任一处仍有余额则拒绝再入金，需先出清。

**英文**: Deposit to provider wallet. Exclusive projects may reject if any provider still has balance.

**JSON 字段**: `provider`（必填），`playerId`（必填），`amount`（必填）

**请求示例**:
```json
{
  "provider": "EpicWin",
  "playerId": "site_user_001",
  "amount": 50
}
```

**响应示例**（实际字段因厂商而异）:
```json
{
  "success": true,
  "balance": 150.5,
  "referenceId": "mw_ref_xxx",
  "currency": "MYR"
}
```

**cURL**:
```bash
curl -sS -X POST 'https://api.gt96.xyz/api/gateway/Deposit' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_PROJECT_TOKEN' \
  -d '{"provider":"EpicWin","playerId":"site_user_001","amount":50}'
```

### POST `/api/gateway/Withdrawal`

从厂商钱包出金。余额为 0 或金额超过余额会被拒绝。

**英文**: Withdraw from provider wallet.

**JSON 字段**: `provider`（必填），`playerId`（必填），`amount`（必填）

**请求示例**:
```json
{
  "provider": "EpicWin",
  "playerId": "site_user_001",
  "amount": 30
}
```

**响应示例**（实际字段因厂商而异）:
```json
{
  "success": true,
  "balance": 120.5,
  "referenceId": "mw_ref_xxx",
  "currency": "MYR"
}
```

**cURL**:
```bash
curl -sS -X POST 'https://api.gt96.xyz/api/gateway/Withdrawal' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_PROJECT_TOKEN' \
  -d '{"provider":"EpicWin","playerId":"site_user_001","amount":30}'
```

### POST `/api/gateway/KickPlayer`

踢出当前游戏会话并清除中间层记录的当前游戏。

**英文**: Kick session and clear current game in middleware.

**JSON 字段**: `provider`（必填），`playerId`（必填）

**请求示例**:
```json
{
  "provider": "EpicWin",
  "playerId": "site_user_001"
}
```

**响应示例**（实际字段因厂商而异）:
```json
{
  "success": true
}
```

**cURL**:
```bash
curl -sS -X POST 'https://api.gt96.xyz/api/gateway/KickPlayer' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_PROJECT_TOKEN' \
  -d '{"provider":"EpicWin","playerId":"site_user_001"}'
```

### POST `/api/gateway/GameList`

获取游戏列表。`provider` 可省略：省略则聚合当前项目已启用厂商（实现可能因版本而异）；建议传具体厂商代码。

**英文**: List games. Optional provider filters to one vendor.

**JSON 字段**: `provider`（可选）

- 部分厂商仅返回大厅等少量条目，属适配器实现。
- 可选字段 `imageUrl`：EpicWin/MegaH5 等若厂商返回 `ImageUrl` 则会映射；未返回则无。

**请求示例**:
```json
{
  "provider": "EpicWin"
}
```

**响应示例**（实际字段因厂商而异）:
```json
{
  "success": true,
  "games": [
    {
      "gameCode": "45012",
      "gameName": "Example Slot",
      "gameType": "1",
      "imageUrl": "https://vendor-cdn.example/game/45012.png",
      "provider": "EpicWin"
    }
  ]
}
```

**cURL**:
```bash
curl -sS -X POST 'https://api.gt96.xyz/api/gateway/GameList' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_PROJECT_TOKEN' \
  -d '{"provider":"EpicWin"}'
```

### POST `/api/gateway/LoginGame`

进入游戏，返回可打开的 URL。与 Dashboard「试玩」共用同一套 `gatewayLoginGame`：exclusive 下会探测余额（含当前游戏厂快路径）、再划转、再取游戏 URL；multi 则直接取 URL。

**英文**: Same LoginGame pipeline as dashboard playground; exclusive mode probes/transfers then launch.

**JSON 字段**: `provider`（必填），`playerId`（必填），`gameCode`（必填），`lang`（可选），`redirectUrl`（可选），`collectTimings`（可选）

- 请求体 `collectTimings: true` 时响应会多 `timingsMs`、`totalMs`（与试玩页一致，便于排查慢在哪一段）。默认不传或 false 则不返回，减小 JSON。

**请求示例**:
```json
{
  "provider": "EpicWin",
  "playerId": "site_user_001",
  "gameCode": "45012",
  "lang": "zh-CN",
  "redirectUrl": "https://yoursite.com/return",
  "collectTimings": false
}
```

**响应示例**（实际字段因厂商而异）:
```json
{
  "success": true,
  "url": "https://game-vendor.example/launch?...",
  "gameType": "web",
  "token": null,
  "timingsMs": [
    {
      "step": "adapter_login_game",
      "ms": 120,
      "detail": "示例：仅当 collectTimings 为 true 时返回"
    }
  ],
  "totalMs": 1389.5
}
```

**cURL**:
```bash
curl -sS -X POST 'https://api.gt96.xyz/api/gateway/LoginGame' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_PROJECT_TOKEN' \
  -d '{"provider":"EpicWin","playerId":"site_user_001","gameCode":"45012","lang":"zh-CN","redirectUrl":"https://yoursite.com/return","collectTimings":false}'
```

### POST `/api/gateway/SyncGameLog`

手动从厂商拉取投注类注单并写入中间层（与 Dashboard Game Logs 同步相关）。

**英文**: Trigger bet log sync from provider(s).

**JSON 字段**: `provider`（可选）

- 按厂商从上游拉取增量注单并写入本机 `game_logs`；可选 `provider` 指定单厂，大小写不敏感。
- **不支持**在请求里按 `playerId` 筛选拉取（由适配器 `pullGameLogs` 批次决定）；按玩家查库请用 **QueryGameLogs**。

**请求示例**:
```json
{
  "provider": "EpicWin"
}
```

**响应示例**（实际字段因厂商而异）:
```json
{
  "success": true,
  "results": [
    {
      "provider": "EpicWin",
      "logsCount": 42,
      "success": true
    }
  ]
}
```

**cURL**:
```bash
curl -sS -X POST 'https://api.gt96.xyz/api/gateway/SyncGameLog' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_PROJECT_TOKEN' \
  -d '{"provider":"EpicWin"}'
```

### POST `/api/gateway/GetPlayerProviderAccounts`

查询该玩家在各家厂商已保存的注册信息（含 providerData 中的帐号、密码等，依厂商与入库时数据而定）。

**英文**: Read stored per-provider registration data from middleware DB.

**JSON 字段**: `playerId`（必填）

- 数据来源为本机 `player_providers`，非实时调用厂商查询密码。

**请求示例**:
```json
{
  "playerId": "site_user_001"
}
```

**响应示例**（实际字段因厂商而异）:
```json
{
  "success": true,
  "playerId": "site_user_001",
  "accounts": [
    {
      "providerCode": "EpicWin",
      "providerName": "EpicWin",
      "providerType": "web",
      "registered": true,
      "providerPlayerId": "site_user_001",
      "providerData": {
        "loginId": "example",
        "password": "（若厂商返回则会保存）"
      }
    }
  ]
}
```

**cURL**:
```bash
curl -sS -X POST 'https://api.gt96.xyz/api/gateway/GetPlayerProviderAccounts' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_PROJECT_TOKEN' \
  -d '{"playerId":"site_user_001"}'
```

### POST `/api/gateway/QueryGameLogs`

分页查询**已同步至本机**的投注记录（表 `game_logs`），可按玩家、厂商、游戏码、时间筛选。

**英文**: Paginated query over synced bet logs stored locally.

**JSON 字段**: `playerId`（可选），`provider`（可选），`gameCode`（可选），`startDate`（可选），`endDate`（可选），`page`（可选），`pageSize`（可选）

- 须先通过 SyncGameLog 或定时任务把注单写入库，否则结果为空。
- 单笔字段含 `betAmount`、`validBet`、`payout`、`winLose`、`gameCode`、`rawData`（厂商原始片段）等；完整度视适配器。

**请求示例**:
```json
{
  "playerId": "site_user_001",
  "provider": "EpicWin",
  "gameCode": "45012",
  "startDate": "2026-01-01T00:00:00.000Z",
  "endDate": "2026-12-31T23:59:59.999Z",
  "page": 1,
  "pageSize": 50
}
```

**响应示例**（实际字段因厂商而异）:
```json
{
  "success": true,
  "total": 120,
  "page": 1,
  "pageSize": 50,
  "logs": [
    {
      "id": 1,
      "playerId": "site_user_001",
      "gameCode": "45012",
      "gameName": "Example Slot",
      "betAmount": "10.0000",
      "validBet": "10.0000",
      "payout": "15.0000",
      "winLose": "5.0000",
      "roundType": "bet",
      "transactionDate": "2026-04-01T12:00:00.000Z",
      "providerTranId": "vendor_tx_001",
      "rawData": {}
    }
  ]
}
```

**cURL**:
```bash
curl -sS -X POST 'https://api.gt96.xyz/api/gateway/QueryGameLogs' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_PROJECT_TOKEN' \
  -d '{"playerId":"site_user_001","provider":"EpicWin","gameCode":"45012","startDate":"2026-01-01T00:00:00.000Z","endDate":"2026-12-31T23:59:59.999Z","page":1,"pageSize":50}'
```

## 6. Mega888 回调（无需项目 Token）

- 路径: `GET/POST /api/gateway/mega888/callback/login`（`router.all` 接收常见方法）。
- 每次请求会写入 `mega888_callback_logs`（快照）。
- 业务逻辑：`open.operator.user.login` 时校验 `digest = MD5(random + sn + loginId + secretKey)`（`secretKey`/`sn` 与项目里 Mega888 渠道配置一致），再比对 `player_providers` 中保存的厂商密码；成功返回 JSON-RPC，`result.success` 为 `"1"` 并带 `sessionId`。
- Body 常为 `application/x-www-form-urlencoded`，字段 `json` 为 JSON-RPC；原始 body 亦记入 `megaRawBody`。
- **不属于** Bearer 网关体系。

## 7. CORS

浏览器直连 API 时，需在服务端 `.env` 配置 `CORS_ORIGINS` 包含前端 Origin；详见 Dashboard ApiDocs 页面说明。

## 8. 多语言调用提示

- **PHP**: `curl_*` 或 Guzzle，POST JSON，带 Authorization。
- **Node.js**: `fetch` / `axios` / `undici`。
- **浏览器**: `fetch`，注意 CORS。
- **Python**: `requests.post(url, json=body, headers=headers)`。

## 9. 常见问题：帐密、Game Log、投注明细、游戏图

### 9.1 玩家游戏帐号 / 密码从哪来？

- **CreatePlayer** 成功响应里的 `providerData`、`providerPlayerId` 即厂商返回内容（各厂结构不同）。
- 无单独「向厂商实时查密码」的通用网关接口；再次读取已保存数据请用 **GetPlayerProviderAccounts**。

### 9.2 SyncGameLog 与按玩家查库

- **SyncGameLog**：触发从厂商拉取并写入本机，可选 `provider`，**不支持**请求体里按 `playerId` 过滤上游拉取。
- **QueryGameLogs**：仅查本机 `game_logs`，支持 `playerId`、`provider`、时间、分页。

### 9.3 单笔 Bet 明细

同步后的每条记录包含投注额、有效投注、派彩、输赢、游戏代码、`transactionDate`、`providerTranId`、`rawData` 等；与厂商 Open API 字段一致的部分在 `rawData`。

### 9.4 GameList 与缩图

统一结构体含可选 `imageUrl`；EpicWin/MegaH5 映射厂商 `ImageUrl`。其它厂商若无该字段则列表中可能无图。

---
*文档由 Middlewave 仓库生成逻辑构建；代码以 `server/gateway/routes.ts` 为准。*