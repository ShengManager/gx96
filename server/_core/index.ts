import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initWebSocket } from "../services/websocket";
import { storagePut } from "../storage";
import { startAllBots } from "../services/telegramBot";
import { nanoid } from "nanoid";
import { verifyAccessToken } from "../services/auth";
import { getDb } from "../db";
import { deposits } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Initialize WebSocket
  initWebSocket(server);

  // File upload endpoint for deposit receipts
  app.post("/api/upload/receipt", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const payload = verifyAccessToken(authHeader.slice(7));
      if (!payload || payload.type !== "player") {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Expect base64 encoded image in body
      const { data, contentType, depositId } = req.body;
      if (!data || !depositId) {
        return res.status(400).json({ error: "Missing data or depositId" });
      }

      const buffer = Buffer.from(data, "base64");
      const ext = (contentType || "image/jpeg").split("/")[1] || "jpg";
      const key = `receipts/${payload.adminId}/${payload.id}/${depositId}-${nanoid(8)}.${ext}`;
      const { url } = await storagePut(key, buffer, contentType || "image/jpeg");

      // Update deposit record with receipt URL
      const db = await getDb();
      if (db) {
        await db.update(deposits).set({ receiptUrl: url }).where(and(eq(deposits.id, depositId), eq(deposits.playerId, payload.id)));
      }

      return res.json({ success: true, url });
    } catch (err: any) {
      console.error("[Upload] Receipt upload failed:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Telegram bot webhook endpoint - dispatches updates to the active bot instance
  app.post("/api/telegram/webhook/:botId", async (req, res) => {
    try {
      const botId = parseInt(req.params.botId);
      if (isNaN(botId)) return res.status(400).json({ ok: false, error: "Invalid botId" });

      const { handleWebhookUpdate } = await import("../services/telegramBot");
      await handleWebhookUpdate(botId, req.body);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[TG Webhook] Error:", err);
      return res.json({ ok: true }); // Always return 200 to Telegram
    }
  });

  // Auto-login endpoint for players coming from Telegram
  app.get("/api/player/auto-login", async (req, res) => {
    try {
      const { token } = req.query;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Missing token" });
      }

      const { verifyAutoLoginToken } = await import("../services/auth");
      const result = await verifyAutoLoginToken(token);
      if (!result) {
        return res.status(401).json({ error: "Invalid or expired auto-login token" });
      }

      return res.json(result);
    } catch (err: any) {
      console.error("[AutoLogin] Error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);

    // Start all active Telegram bots
    startAllBots().catch(err => {
      console.error("[TG Bot] Failed to start bots:", err);
    });
  });
}

startServer().catch(console.error);
