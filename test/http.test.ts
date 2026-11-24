import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "dist", "index.js");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close();
        reject(new Error("Could not reserve a port"));
        return;
      }
      const { port } = address;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function startServer(port: number): Promise<ChildProcess> {
  const child = spawn(process.execPath, [entry, "--http", "--port", String(port)], {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("HTTP server did not start"));
    }, 5000);
    let logs = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      logs += chunk.toString("utf8");
      if (logs.includes("listening")) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`HTTP server exited early (${code ?? "no code"}): ${logs}`));
    });
  });
}

describe("MCP server over Streamable HTTP", () => {
  let child: ChildProcess | undefined;

  afterEach(() => {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
    }
    child = undefined;
  });

  it("answers a tool call on the loopback /mcp endpoint", async () => {
    const port = await freePort();
    child = await startServer(port);
    const client = new Client({ name: "real-estate-mcp-http-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: "seller_net_sheet",
        arguments: {
          salePrice: 400_000,
          mortgagePayoff: 200_000,
          commissionPercent: 6,
          closingCosts: 8000,
          concessions: 5000,
        },
      });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({
        commissionAmount: 24_000,
        estimatedNetProceeds: 163_000,
        sellerBringsCash: false,
      });
    } finally {
      await client.close();
    }
  });
});