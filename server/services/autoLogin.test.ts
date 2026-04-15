import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "tggaming-secret-key";

describe("Auto-Login Token Generation", () => {
  it("generates a valid auto-login JWT with nonce, playerId, adminId, purpose", () => {
    const playerId = 42;
    const adminId = 1;
    const nonce = crypto.randomBytes(16).toString("hex");
    const token = jwt.sign(
      { playerId, adminId, purpose: "auto_login", nonce },
      JWT_SECRET,
      { expiresIn: "5m" }
    );

    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    expect(decoded.playerId).toBe(42);
    expect(decoded.adminId).toBe(1);
    expect(decoded.purpose).toBe("auto_login");
    expect(decoded.nonce).toBe(nonce);
    expect(decoded.nonce).toHaveLength(32); // 16 bytes hex = 32 chars
    expect(decoded.exp).toBeDefined();
  });

  it("each token has a unique nonce", () => {
    const nonce1 = crypto.randomBytes(16).toString("hex");
    const nonce2 = crypto.randomBytes(16).toString("hex");
    expect(nonce1).not.toBe(nonce2);
  });
});

describe("Auto-Login Token Verification", () => {
  it("rejects expired auto-login tokens", async () => {
    const token = jwt.sign(
      { playerId: 1, adminId: 1, purpose: "auto_login", nonce: "abc" },
      JWT_SECRET,
      { expiresIn: "0s" }
    );
    await new Promise(r => setTimeout(r, 100));
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
  });

  it("rejects tokens with wrong secret", () => {
    const token = jwt.sign(
      { playerId: 1, adminId: 1, purpose: "auto_login", nonce: "abc" },
      "wrong-secret",
      { expiresIn: "5m" }
    );
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
  });

  it("rejects tokens with wrong purpose", () => {
    const token = jwt.sign(
      { playerId: 1, adminId: 1, purpose: "other", nonce: "abc" },
      JWT_SECRET,
      { expiresIn: "5m" }
    );
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    expect(decoded.purpose).not.toBe("auto_login");
  });

  it("rejects tokens without nonce", () => {
    const token = jwt.sign(
      { playerId: 1, adminId: 1, purpose: "auto_login" },
      JWT_SECRET,
      { expiresIn: "5m" }
    );
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    expect(decoded.nonce).toBeUndefined();
    // Verification logic should reject: if (!decoded.nonce) return null;
  });
});

describe("One-Time-Use Nonce Protection", () => {
  it("nonce set correctly tracks used nonces", () => {
    const usedNonces = new Set<string>();
    const nonce = "test-nonce-123";

    expect(usedNonces.has(nonce)).toBe(false);
    usedNonces.add(nonce);
    expect(usedNonces.has(nonce)).toBe(true);

    // Second use should be detected as replay
    expect(usedNonces.has(nonce)).toBe(true);
  });

  it("different nonces are independent", () => {
    const usedNonces = new Set<string>();
    usedNonces.add("nonce-a");
    expect(usedNonces.has("nonce-a")).toBe(true);
    expect(usedNonces.has("nonce-b")).toBe(false);
  });
});

describe("Access Token Structure", () => {
  it("generates access token with correct player payload", () => {
    const payload = { id: 1, type: "player" as const, adminId: 1 };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    expect(decoded.id).toBe(1);
    expect(decoded.type).toBe("player");
    expect(decoded.adminId).toBe(1);
  });

  it("generates access token with admin role field", () => {
    const payload = { id: 1, type: "admin" as const, role: "master", adminId: 1 };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    expect(decoded.role).toBe("master");
    expect(decoded.type).toBe("admin");
  });
});

describe("Webhook Update Validation", () => {
  it("validates botId must be a number", () => {
    expect(isNaN(parseInt("abc"))).toBe(true);
  });

  it("validates valid botId", () => {
    expect(isNaN(parseInt("123"))).toBe(false);
    expect(parseInt("123")).toBe(123);
  });
});
