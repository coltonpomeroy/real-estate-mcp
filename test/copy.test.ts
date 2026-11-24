import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const banned = ["\u2013", "\u2014"];

function textFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git" || entry === "coverage") {
      continue;
    }
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...textFiles(full));
      continue;
    }
    if (entry === "package-lock.json") {
      continue;
    }
    if (/\.(md|ts|js|json|yml|yaml)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe("copy", () => {
  it("keeps en dashes and em dashes out of the repo text", () => {
    const hits: string[] = [];
    for (const file of textFiles(root)) {
      const text = readFileSync(file, "utf8");
      if (banned.some((dash) => text.includes(dash))) {
        hits.push(path.relative(root, file));
      }
    }
    expect(hits).toEqual([]);
  });
});
