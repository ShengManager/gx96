# API Response Structures

## /api/gateway/ProjectInfo (same as gateway_gamelist.php)
```json
{
  "success": true,
  "project": {
    "id": 1,
    "name": "test",
    "status": "active",
    "pointPoolMode": "exclusive",
    "gameEnabled": true
  },
  "providers": [
    {"providerId": 1, "providerCode": "EpicWin", "providerName": "EpicWin", "status": "active"},
    {"providerId": 2, "providerCode": "MegaH5", "providerName": "MegaH5", "status": "active"},
    {"providerId": 4, "providerCode": "PussyH5", "providerName": "PussyH5", "status": "active"},
    {"providerId": 5, "providerCode": "Mega888", "providerName": "Mega888", "status": "inactive"},
    {"providerId": 6, "providerCode": "918KissH5", "providerName": "918KissH5", "status": "active"}
  ],
  "activeProviderCount": 4
}
```

## /api/gateway/GameList (per provider)
Returns games for a specific provider. Called with `{ provider: "EpicWin" }` etc.
