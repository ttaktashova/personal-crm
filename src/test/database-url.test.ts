import { describe, expect, it } from "vitest";

import {
  assertTestDatabaseName,
  toAdminDatabaseUrl,
  toE2eDatabaseUrl,
  toTestDatabaseUrl,
} from "./database-url";

describe("toTestDatabaseUrl", () => {
  it("adds _test to the database name", () => {
    expect(toTestDatabaseUrl("postgres://u:p@127.0.0.1:5432/personal_crm")).toBe(
      "postgres://u:p@127.0.0.1:5432/personal_crm_test",
    );
  });

  it("keeps the credentials, the port and the query as they are", () => {
    expect(
      toTestDatabaseUrl("postgres://crm:p%40ss@localhost:5433/personal_crm?sslmode=disable"),
    ).toBe("postgres://crm:p%40ss@localhost:5433/personal_crm_test?sslmode=disable");
  });

  it("refuses an address without a database name", () => {
    expect(() => toTestDatabaseUrl("postgres://u:p@127.0.0.1:5432")).toThrow("database name");
    expect(() => toTestDatabaseUrl("postgres://u:p@127.0.0.1:5432/")).toThrow("database name");
  });
});

describe("toE2eDatabaseUrl", () => {
  it("adds _e2e_test to the database name", () => {
    expect(toE2eDatabaseUrl("postgres://u:p@127.0.0.1:5432/personal_crm")).toBe(
      "postgres://u:p@127.0.0.1:5432/personal_crm_e2e_test",
    );
  });

  it("keeps the credentials, the port and the query as they are", () => {
    expect(
      toE2eDatabaseUrl("postgres://crm:p%40ss@localhost:5433/personal_crm?sslmode=disable"),
    ).toBe("postgres://crm:p%40ss@localhost:5433/personal_crm_e2e_test?sslmode=disable");
  });

  it("refuses an address without a database name", () => {
    expect(() => toE2eDatabaseUrl("postgres://u:p@127.0.0.1:5432/")).toThrow("database name");
  });
});

describe("assertTestDatabaseName", () => {
  it("lets a name that ends with _test through", () => {
    expect(() => assertTestDatabaseName("personal_crm_test")).not.toThrow();
  });

  it("throws for the main database", () => {
    expect(() => assertTestDatabaseName("personal_crm")).toThrow("_test");
  });

  it("throws when _test is only in the middle of the name", () => {
    expect(() => assertTestDatabaseName("personal_crm_test_data")).toThrow("_test");
  });
});

describe("toAdminDatabaseUrl", () => {
  it("points to the postgres maintenance database", () => {
    expect(toAdminDatabaseUrl("postgres://u:p@127.0.0.1:5432/personal_crm_test")).toBe(
      "postgres://u:p@127.0.0.1:5432/postgres",
    );
  });
});
