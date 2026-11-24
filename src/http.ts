import { createServer as createHttpServer } from "node:http";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "./server.js";

/** Streamable HTTP on loopback. Host and Origin checks block DNS rebinding. */
export function listenHttp(port: number): Promise<void> {
  const handler = createMcpHandler(createServer);
  const nodeHandler = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const http = createHttpServer((req, res) => {
    const path = req.url?.split("?")[0];
    if (path !== "/mcp") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    if (!validateHost(req, res) || !validateOrigin(req, res)) {
      return;
    }
    void nodeHandler(req, res);
  });

  return new Promise((resolve, reject) => {
    const onStartupError = (error: Error): void => {
      reject(error);
    };
    http.once("error", onStartupError);
    http.listen(port, "127.0.0.1", () => {
      http.removeListener("error", onStartupError);
      http.on("error", (error: Error) => {
        console.error(error.message);
        process.exit(1);
      });
      console.error(`real-estate-mcp listening on http://127.0.0.1:${port}/mcp`);
      resolve();
    });
  });
}
