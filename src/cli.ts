export interface CliOptions {
  mode: "stdio" | "http" | "help";
  port: number;
}

const HELP_TEXT = `real-estate-mcp

MCP server for real estate estimates. No API key is required.

Usage
  real-estate-mcp
      Serve MCP over stdio. This is the mode Claude Desktop and Cursor use.

  real-estate-mcp --http [--port 3000]
      Serve MCP over Streamable HTTP on 127.0.0.1, path /mcp.

  real-estate-mcp --help
      Show this help.

Stdout is the protocol stream in stdio mode. Logs go to stderr.
`;

export function helpText(): string {
  return HELP_TEXT;
}

export function parseCli(argv: readonly string[]): CliOptions {
  let mode: CliOptions["mode"] = "stdio";
  let port = 3000;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      mode = "help";
      continue;
    }
    if (arg === "--stdio") {
      continue;
    }
    if (arg === "--http") {
      if (mode !== "help") {
        mode = "http";
      }
      continue;
    }
    if (arg === "--port") {
      const raw = argv[index + 1];
      if (raw === undefined || raw.startsWith("-")) {
        throw new Error("Expected a port number after --port");
      }
      if (!/^\d+$/.test(raw)) {
        throw new Error("Expected --port to be a whole number from 1 to 65535");
      }
      const parsed = Number(raw);
      if (parsed < 1 || parsed > 65535) {
        throw new Error("Expected --port to be a whole number from 1 to 65535");
      }
      port = parsed;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg ?? ""}`);
  }

  return { mode, port };
}
