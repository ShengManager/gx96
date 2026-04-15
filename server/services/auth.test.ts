import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, generateAccessToken, verifyAccessToken, generateRefreshToken } from "./auth";

describe("Auth Service", () => {
  describe("Password hashing", () => {
    it("hashes and verifies a password correctly", async () => {
      const password = "testPassword123";
      const hash = await hashPassword(password);
      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("rejects wrong password", async () => {
      const hash = await hashPassword("correct");
      const isValid = await verifyPassword("wrong", hash);
      expect(isValid).toBe(false);
    });
  });

  describe("JWT tokens", () => {
    it("signs and verifies an admin access token", () => {
      const token = generateAccessToken({ id: 1, type: "admin", role: "master" });
      expect(token).toBeTruthy();

      const payload = verifyAccessToken(token);
      expect(payload).toBeTruthy();
      expect(payload!.id).toBe(1);
      expect(payload!.type).toBe("admin");
      expect(payload!.role).toBe("master");
    });

    it("signs and verifies a player access token", () => {
      const token = generateAccessToken({ id: 42, type: "player", adminId: 1 });
      expect(token).toBeTruthy();

      const payload = verifyAccessToken(token);
      expect(payload).toBeTruthy();
      expect(payload!.id).toBe(42);
      expect(payload!.type).toBe("player");
      expect(payload!.adminId).toBe(1);
    });

    it("returns null for invalid token", () => {
      const payload = verifyAccessToken("invalid.token.here");
      expect(payload).toBeNull();
    });

    it("signs a refresh token", () => {
      const token = generateRefreshToken();
      expect(token).toBeTruthy();
    });
  });
});
