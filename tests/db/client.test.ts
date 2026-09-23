import { describe, expect, it } from "vitest";
import { stripSslParams } from "../../src/db/client.js";

describe("stripSslParams", () => {
  it("strips both sslmode and channel_binding when present back-to-back", () => {
    const result = stripSslParams("postgres://u:p@host/db?sslmode=require&channel_binding=require");
    expect(result).not.toContain("sslmode");
    expect(result).not.toContain("channel_binding");
  });

  it("strips both regardless of order", () => {
    const result = stripSslParams("postgres://u:p@host/db?channel_binding=require&sslmode=require");
    expect(result).not.toContain("sslmode");
    expect(result).not.toContain("channel_binding");
  });

  it("preserves unrelated query params", () => {
    const result = stripSslParams("postgres://u:p@host/db?sslmode=require&pgbouncer=true");
    expect(result).toContain("pgbouncer=true");
    expect(result).not.toContain("sslmode");
  });

  it("preserves credentials and host", () => {
    const result = stripSslParams("postgres://user:pass@host.example.com:5432/dbname?sslmode=require");
    expect(result).toContain("user:pass@host.example.com:5432/dbname");
  });
});
