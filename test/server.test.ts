import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, describe, expect, it } from "vitest";
import { calculateMortgage } from "../src/mortgage.js";
import { GLOSSARY_URI } from "../src/glossary.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "dist", "index.js");

const client = new Client({ name: "real-estate-mcp-test", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: [entry],
  cwd: root,
  stderr: "pipe",
});

function textOf(result: { content: unknown }): string {
  const blocks: unknown = result.content;
  if (!Array.isArray(blocks)) {
    return "";
  }
  return blocks
    .map((block: unknown) => {
      if (typeof block !== "object" || block === null || !("text" in block)) {
        return "";
      }
      const text: unknown = block.text;
      return typeof text === "string" ? text : "";
    })
    .join("\n");
}

describe("MCP server over stdio", () => {
  afterAll(async () => {
    await client.close();
  });

  it("starts from the built bin and serves tools, the glossary, and the compare prompt", async () => {
    expect(readFileSync(entry, "utf8").startsWith("#!/usr/bin/env node")).toBe(true);
    const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      bin: { "real-estate-mcp": string };
      private: boolean;
    };
    expect(manifest.bin["real-estate-mcp"]).toBe("dist/index.js");
    expect(manifest.private).toBe(true);

    await client.connect(transport);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "affordability",
      "investment_returns",
      "mortgage_payment",
      "rent_vs_buy",
      "seller_net_sheet",
    ]);
    const mortgageTool = listed.tools.find((tool) => tool.name === "mortgage_payment");
    expect(mortgageTool?.inputSchema).toBeTruthy();
    expect(mortgageTool?.outputSchema).toBeTruthy();

    const expected = calculateMortgage({
      principal: 200_000,
      annualInterestRate: 6,
      termYears: 30,
      annualPropertyTax: 2400,
      annualInsurance: 1200,
      monthlyHoa: 50,
      monthlyPmi: 0,
    });
    const called = await client.callTool({
      name: "mortgage_payment",
      arguments: {
        principal: 200_000,
        annualInterestRate: 6,
        termYears: 30,
        annualPropertyTax: 2400,
        annualInsurance: 1200,
        monthlyHoa: 50,
      },
    });
    expect(called.isError).toBeFalsy();
    expect(called.structuredContent).toMatchObject(expected);
    expect(textOf(called)).toContain("Total monthly payment");
    expect(textOf(called)).toContain("Estimate only");

    const rejected = await client.callTool({
      name: "seller_net_sheet",
      arguments: { salePrice: -10, mortgagePayoff: 0, commissionPercent: 6 },
    });
    expect(rejected.isError).toBe(true);

    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toContain(GLOSSARY_URI);
    const glossary = await client.readResource({ uri: GLOSSARY_URI });
    const glossaryText = glossary.contents.map((item) => ("text" in item ? item.text : "")).join("\n");
    expect(glossaryText).toContain("Cap rate");
    expect(glossaryText).toContain("Front-end DTI");

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toContain("compare_offers");
    const prompt = await client.getPrompt({
      name: "compare_offers",
      arguments: {
        salePriceA: "450000",
        salePriceB: "445000",
        mortgagePayoff: "250000",
        commissionPercent: "5.5",
        closingCosts: "6000",
      },
    });
    const promptText = prompt.messages
      .map((message) => (message.content.type === "text" ? message.content.text : ""))
      .join("\n");
    expect(promptText).toContain("seller_net_sheet");
    expect(promptText).toContain("450000");
    expect(promptText).toContain("Seller concessions: 0 dollars");
  });
});
