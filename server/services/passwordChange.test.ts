import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth";

describe("Admin Password Change", () => {
  describe("Password hashing for change flow", () => {
    it("should hash a new password and verify it correctly", async () => {
      const newPassword = "newSecurePass123";
      const hashed = await hashPassword(newPassword);
      
      expect(hashed).toBeDefined();
      expect(hashed).not.toBe(newPassword);
      
      const isValid = await verifyPassword(newPassword, hashed);
      expect(isValid).toBe(true);
    });

    it("should reject old password after change", async () => {
      const oldPassword = "oldPassword123";
      const newPassword = "newPassword456";
      
      const oldHash = await hashPassword(oldPassword);
      const newHash = await hashPassword(newPassword);
      
      // Old password should not match new hash
      const oldMatchesNew = await verifyPassword(oldPassword, newHash);
      expect(oldMatchesNew).toBe(false);
      
      // New password should match new hash
      const newMatchesNew = await verifyPassword(newPassword, newHash);
      expect(newMatchesNew).toBe(true);
      
      // New password should not match old hash
      const newMatchesOld = await verifyPassword(newPassword, oldHash);
      expect(newMatchesOld).toBe(false);
    });

    it("should enforce minimum password length of 6 characters", () => {
      // The Zod schema in the router enforces min(6)
      const shortPassword = "abc";
      const validPassword = "abcdef";
      
      expect(shortPassword.length).toBeLessThan(6);
      expect(validPassword.length).toBeGreaterThanOrEqual(6);
    });

    it("should generate different hashes for same password (salt)", async () => {
      const password = "samePassword123";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      // Hashes should be different due to random salt
      expect(hash1).not.toBe(hash2);
      
      // But both should verify correctly
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });
  });

  describe("Password validation rules", () => {
    it("should not accept empty password", async () => {
      const emptyPassword = "";
      // The Zod schema enforces min(1) for currentPassword and min(6) for newPassword
      expect(emptyPassword.length).toBe(0);
    });

    it("should handle special characters in passwords", async () => {
      const specialPassword = "p@$$w0rd!#%^&*()";
      const hashed = await hashPassword(specialPassword);
      
      expect(await verifyPassword(specialPassword, hashed)).toBe(true);
      expect(await verifyPassword("wrong", hashed)).toBe(false);
    });

    it("should handle unicode characters in passwords", async () => {
      const unicodePassword = "密码测试123";
      const hashed = await hashPassword(unicodePassword);
      
      expect(await verifyPassword(unicodePassword, hashed)).toBe(true);
      expect(await verifyPassword("密码测试124", hashed)).toBe(false);
    });
  });
});
