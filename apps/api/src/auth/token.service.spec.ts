import { parseDurationMs } from "./token.service";

describe("parseDurationMs", () => {
  it.each([
    ["15m", 15 * 60_000],
    ["30d", 30 * 86_400_000],
    ["12h", 12 * 3_600_000],
    ["45s", 45 * 1_000],
    ["3600", 3_600_000],
  ])("parses %s", (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected);
  });

  it("throws on invalid", () => {
    expect(() => parseDurationMs("abc")).toThrow();
  });
});
