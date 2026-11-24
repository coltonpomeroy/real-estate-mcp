#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { helpText, parseCli } from "./cli.js";
import { listenHttp } from "./http.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  if (options.mode === "help") {
    process.stdout.write(helpText());
    return;
  }
  if (options.mode === "http") {
    await listenHttp(options.port);
    return;
  }
  // stdout is the MCP protocol stream. Keep logs on stderr.
  console.error("real-estate-mcp ready on stdio");
  serveStdio(createServer);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
