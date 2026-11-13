import { describe, expect, it } from "vitest";

import { signInEmailSchema } from "./sign-in-email-schema";

// "Почта без пробелов и без учёта регистра" and "Проверка почты" of the sign-in spec.

const DOMAIN = "@example.com";
const emailOfLength = (length: number) => "a".repeat(length - DOMAIN.length) + DOMAIN;

describe("signInEmailSchema", () => {
  it("drops the spaces at the edges and lowercases the address", () => {
    expect(signInEmailSchema.parse("  Anna@Example.COM  ")).toBe("anna@example.com");
  });

  it("refuses a wrong address with one message", () => {
    const result = signInEmailSchema.safeParse("anna@");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Проверьте адрес почты");
  });

  it("refuses an empty field and a field of spaces", () => {
    for (const value of ["", "   "]) {
      const result = signInEmailSchema.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Проверьте адрес почты");
    }
  });

  it("lets 254 characters through and refuses 255", () => {
    expect(signInEmailSchema.parse(emailOfLength(254))).toBe(emailOfLength(254));

    const result = signInEmailSchema.safeParse(emailOfLength(255));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Проверьте адрес почты");
  });

  it("refuses what is not a string", () => {
    for (const value of [undefined, null, 42, ["anna@example.com"]]) {
      expect(signInEmailSchema.safeParse(value).success).toBe(false);
    }
  });
});
