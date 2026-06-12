import { describe, expect, it } from "vitest";
import { hasPanelAccess } from "./auth-context";

describe("hasPanelAccess", () => {
  it("permite admin global", () => {
    expect(hasPanelAccess({ roles: ["admin"] })).toBe(true);
  });

  it("permite manager de merchant", () => {
    expect(hasPanelAccess({ roles: ["merchant"] })).toBe(true);
  });

  it("nega usuário sem role de painel", () => {
    expect(hasPanelAccess({ roles: ["customer", "picker"] })).toBe(false);
    expect(hasPanelAccess({ roles: [] })).toBe(false);
  });
});
