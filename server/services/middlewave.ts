import axios, { AxiosInstance } from "axios";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Types ───
export type MiddlewaveConfig = {
  baseUrl: string;
  projectToken: string;
};

export type MWResponse<T = any> = {
  success: boolean;
  message?: string;
  error?: string;
} & T;

export type GameListItem = {
  gameCode: string;
  gameName: string;
  gameType: string;
  gameTypeLabel?: string;
  imageUrl?: string;
  provider: string;
  providerType?: string;
  providerTypeLabel?: string;
  supportedPlatforms?: string[];
};

export type GameLogEntry = {
  id: number;
  playerId: string;
  gameCode: string;
  gameName: string;
  betAmount: string;
  validBet: string;
  payout: string;
  winLose: string;
  roundType: string;
  transactionDate: string;
  providerTranId: string;
  rawData: any;
};

export type ProviderAccount = {
  providerCode: string;
  providerName: string;
  providerType: string;
  registered: boolean;
  providerPlayerId: string;
  providerData: Record<string, any>;
};

// ─── Supported Providers (fallback if ProjectInfo unavailable) ───
export const SUPPORTED_PROVIDERS = [
  "EpicWin",
  "MegaH5",
  "Mega888",
  "BigPot",
  "PussyH5",
  "918KissH5",
] as const;

// ─── Provider Info from ProjectInfo API ───
export type ProviderInfo = {
  providerId: number;
  providerCode: string;
  providerName: string;
  providerType?: string;
  providerTypeLabel?: string;
  status: string;
};

export type ProjectInfoResponse = {
  success: boolean;
  project?: {
    id: number;
    name: string;
    status: string;
    pointPoolMode: string;
    gameEnabled: boolean;
  };
  providers?: ProviderInfo[];
  activeProviderCount?: number;
  error?: string;
};

// ─── Get Config from DB ───
export async function getMiddlewaveConfig(adminId: number): Promise<MiddlewaveConfig | null> {
  const db = await getDb();
  if (!db) return null;

  // Check both key names for backwards compatibility
  // UI saves as "middlewave_token", older code used "middlewave_api_token"
  const rows = await db
    .select()
    .from(systemSettings)
    .where(and(
      eq(systemSettings.adminId, adminId),
      eq(systemSettings.settingKey, "middlewave_api_token")
    ))
    .limit(1);

  // Also check the UI key name
  const rows2 = await db
    .select()
    .from(systemSettings)
    .where(and(
      eq(systemSettings.adminId, adminId),
      eq(systemSettings.settingKey, "middlewave_token")
    ))
    .limit(1);

  const urlRows = await db
    .select()
    .from(systemSettings)
    .where(and(
      eq(systemSettings.adminId, adminId),
      eq(systemSettings.settingKey, "middlewave_base_url")
    ))
    .limit(1);

  const token = rows[0]?.settingValue || rows2[0]?.settingValue;
  const baseUrl = urlRows[0]?.settingValue || "https://api.gt96.xyz";

  if (!token) return null;
  return { baseUrl, projectToken: token };
}

// ─── Create Axios Client ───
function createClient(config: MiddlewaveConfig): AxiosInstance {
  return axios.create({
    baseURL: config.baseUrl,
    timeout: 30000,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.projectToken}`,
    },
  });
}

// ─── API Methods ───
export async function createPlayer(
  config: MiddlewaveConfig,
  provider: string,
  playerId: string
): Promise<MWResponse> {
  const client = createClient(config);
  const { data } = await client.post("/api/gateway/CreatePlayer", { provider, playerId });
  return data;
}

export async function checkBalance(
  config: MiddlewaveConfig,
  provider: string,
  playerId: string
): Promise<MWResponse<{ balance?: number; currency?: string }>> {
  const client = createClient(config);
  const { data } = await client.post("/api/gateway/CheckBalance", { provider, playerId });
  return data;
}

export async function depositToProvider(
  config: MiddlewaveConfig,
  provider: string,
  playerId: string,
  amount: number
): Promise<MWResponse<{ balance?: number; referenceId?: string }>> {
  const client = createClient(config);
  const { data } = await client.post("/api/gateway/Deposit", { provider, playerId, amount });
  return data;
}

export async function withdrawFromProvider(
  config: MiddlewaveConfig,
  provider: string,
  playerId: string,
  amount: number
): Promise<MWResponse<{ balance?: number; referenceId?: string }>> {
  const client = createClient(config);
  const { data } = await client.post("/api/gateway/Withdrawal", { provider, playerId, amount });
  return data;
}

export async function loginGame(
  config: MiddlewaveConfig,
  provider: string,
  playerId: string,
  gameCode: string,
  lang?: string,
  redirectUrl?: string
): Promise<MWResponse<{ url?: string; gameType?: string }>> {
  const client = createClient(config);
  const { data } = await client.post("/api/gateway/LoginGame", {
    provider,
    playerId,
    gameCode,
    lang: lang || "en",
    redirectUrl,
    collectTimings: false,
  });
  return data;
}

export async function getGameList(
  config: MiddlewaveConfig,
  provider?: string
): Promise<MWResponse<{ games?: GameListItem[] }>> {
  const client = createClient(config);
  let providerMetaMap = new Map<string, { providerType?: string; providerTypeLabel?: string }>();
  try {
    const info = await getProjectInfo(config);
    if (info.success && Array.isArray(info.providers)) {
      providerMetaMap = new Map(
        info.providers.map((p) => [
          String(p.providerCode || "").trim(),
          {
            providerType: p.providerType ? String(p.providerType).trim() : undefined,
            providerTypeLabel: p.providerTypeLabel ? String(p.providerTypeLabel).trim() : undefined,
          },
        ])
      );
    }
  } catch {
    // Ignore ProjectInfo failures; game list still works without providerType.
  }
  const body: any = {};
  if (provider) body.provider = provider;
  const { data } = await client.post("/api/gateway/GameList", body);
  const rawGames = Array.isArray(data?.games) ? data.games : [];
  const normalizedGames: GameListItem[] = rawGames.map((g: any) => {
    const gameCode = String(g.gameCode || g.GameCode || "").trim();
    const gameName = String(g.gameName || g.GameName || "").trim();
    const rawType = String(g.gameType || g.GameType || "Other").trim();
    const upstreamTypeLabel = String(g.gameTypeLabel || g.GameTypeLabel || "").trim();
    const normalizedType = normalizeGameType(rawType);
    const resolvedTypeLabel = upstreamTypeLabel || normalizedType;
    const resolvedProvider = String(g.provider || g.Provider || provider || "").trim();
    const providerMeta = providerMetaMap.get(resolvedProvider);
    const imageUrl = g.imageUrl || g.ImageUrl || undefined;
    const supportedPlatforms = Array.isArray(g.supportedPlatforms)
      ? g.supportedPlatforms
      : Array.isArray(g.SupportedPlatforms)
        ? g.SupportedPlatforms
        : undefined;

    return {
      gameCode,
      gameName,
      gameType: rawType || normalizedType,
      gameTypeLabel: resolvedTypeLabel,
      imageUrl,
      provider: resolvedProvider,
      providerType: providerMeta?.providerType,
      providerTypeLabel: providerMeta?.providerTypeLabel,
      supportedPlatforms,
    };
  }).filter((g: GameListItem) => g.gameCode && g.gameName);

  return {
    ...data,
    games: normalizedGames,
  };
}

function normalizeGameType(rawType: string): string {
  const type = rawType.trim();
  const map: Record<string, string> = {
    Slot: "Slot",
    Live: "Live Casino",
    Sport: "Sports",
    Card: "Card",
    Fish: "Fishing",
    "1": "Slot",
    "2": "Live Casino",
    "3": "Sports",
    "4": "Card",
    "5": "Fishing",
    "301": "Slot",
    "302": "Live Casino",
    "303": "Sports",
    "304": "Card",
    "305": "Fishing",
    "401": "Slot",
    "402": "Live Casino",
    "403": "Fishing",
    "404": "Card",
    "501": "Live Casino",
    "502": "Arcade",
    "503": "Lottery",
    "504": "Card",
    "505": "Sports",
  };

  if (map[type]) return map[type];
  if (/^\d+$/.test(type)) return "Other";
  return type || "Other";
}

export async function syncGameLog(
  config: MiddlewaveConfig,
  provider?: string
): Promise<MWResponse<{ results?: Array<{ provider: string; logsCount: number; success: boolean }> }>> {
  const client = createClient(config);
  const body: any = {};
  if (provider) body.provider = provider;
  const { data } = await client.post("/api/gateway/SyncGameLog", body);
  return data;
}

export async function queryGameLogs(
  config: MiddlewaveConfig,
  params: {
    playerId?: string;
    provider?: string;
    gameCode?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<MWResponse<{ total?: number; page?: number; pageSize?: number; logs?: GameLogEntry[] }>> {
  const client = createClient(config);
  const { data } = await client.post("/api/gateway/QueryGameLogs", params);
  return data;
}

export async function kickPlayer(
  config: MiddlewaveConfig,
  provider: string,
  playerId: string
): Promise<MWResponse> {
  const client = createClient(config);
  const { data } = await client.post("/api/gateway/KickPlayer", { provider, playerId });
  return data;
}

export async function getPlayerProviderAccounts(
  config: MiddlewaveConfig,
  playerId: string
): Promise<MWResponse<{ accounts?: ProviderAccount[] }>> {
  const client = createClient(config);
  const { data } = await client.post("/api/gateway/GetPlayerProviderAccounts", { playerId });
  return data;
}

// ─── Get Project Info (dynamic provider discovery) ───
export async function getProjectInfo(
  config: MiddlewaveConfig
): Promise<ProjectInfoResponse> {
  const client = createClient(config);
  try {
    const { data } = await client.post("/api/gateway/ProjectInfo", {});
    return data;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Get Active Providers (dynamic, falls back to static list) ───
export async function getActiveProviders(
  config: MiddlewaveConfig
): Promise<string[]> {
  try {
    const info = await getProjectInfo(config);
    if (info.success && info.providers && info.providers.length > 0) {
      return info.providers
        .filter(p => p.status === "active")
        .map(p => p.providerCode);
    }
  } catch {}
  // Fallback to static list
  return [...SUPPORTED_PROVIDERS];
}

// ─── Check All Provider Balances (dynamic providers) ───
export async function checkAllProviderBalances(
  config: MiddlewaveConfig,
  playerId: string
): Promise<Array<{ provider: string; balance: number; error?: string }>> {
  const results: Array<{ provider: string; balance: number; error?: string }> = [];

  // Use dynamic provider list from ProjectInfo
  const providers = await getActiveProviders(config);

  for (const provider of providers) {
    try {
      const res = await checkBalance(config, provider, playerId);
      if (res.success && res.balance !== undefined) {
        results.push({ provider, balance: res.balance });
      } else {
        results.push({ provider, balance: 0, error: res.error || res.message });
      }
    } catch (err: any) {
      results.push({ provider, balance: 0, error: err.message });
    }
  }

  return results;
}
