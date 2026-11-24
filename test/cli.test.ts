import { describe, expect, it } from "vitest";
import { parseCli } from "../src/cli.js";

describe("parseCli", () => {
  it("defaults to stdio on port 3000", () => {
    expect(parseCli([])).toEqual({ mode: "stdio", port: 3000 });
  });

  it("selects HTTP and a port", () => {
    expect(parseCli(["--http", "--port", "8787"])).toEqual({ mode: "http", port: 8787 });
  });

  it("lets help win over http", () => {
    expect(parseCli(["--http", "--help"]).mode).toBe("help");
  });

  it("rejects a missing port, a bad port, and unknown flags", () => {
    expect(() => parseCli(["--port"])).toThrow(/port/i);
    expect(() => parseCli(["--port", "0"])).toThrow(/port/i);
    expect(() => parseCli(["--port", "65536"])).toThrow(/port/i);
    expect(() => parseCli(["--http", "--bogus"])).toThrow(/Unknown argument/);
  });
});
