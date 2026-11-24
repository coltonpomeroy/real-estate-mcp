import { McpServer } from "@modelcontextprotocol/server";
import { affordabilityInputSchema, affordabilityOutputSchema, calculateAffordability, formatAffordability } from "./affordability.js";
import { ESTIMATE_LINE } from "./display.js";
import { GLOSSARY_MARKDOWN, GLOSSARY_URI } from "./glossary.js";
import { calculateInvestment, formatInvestment, investmentInputSchema, investmentOutputSchema } from "./investment.js";
import { calculateMortgage, formatMortgage, mortgageInputSchema, mortgageOutputSchema } from "./mortgage.js";
import { compareOffersArgsSchema, compareOffersText } from "./prompt.js";
import { calculateRentVsBuy, formatRentVsBuy, rentVsBuyInputSchema, rentVsBuyOutputSchema } from "./rent-vs-buy.js";
import { calculateSellerNet, formatSellerNet, sellerNetInputSchema, sellerNetOutputSchema } from "./seller-net.js";

export const SERVER_NAME = "real-estate-mcp";
export const SERVER_VERSION = "1.0.0";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: `Real estate estimates for planning conversations. Money is US dollars. Rates are annual percents, so 6.5 means 6.5 percent. ${ESTIMATE_LINE}`,
    },
  );

  server.registerTool(
    "mortgage_payment",
    {
      title: "Mortgage payment",
      description:
        "Estimate the monthly payment for a fixed-rate mortgage and summarize amortization. Includes principal and interest, plus optional yearly property tax, yearly insurance, monthly HOA, and monthly PMI. The rate is an annual percent, so 6.5 means 6.5 percent. Money is US dollars. Results are estimates, not a loan quote.",
      inputSchema: mortgageInputSchema,
      outputSchema: mortgageOutputSchema,
      annotations: readOnly,
    },
    (input) => {
      const result = calculateMortgage(input);
      return {
        content: [{ type: "text", text: formatMortgage(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "affordability",
    {
      title: "Affordability",
      description:
        "Estimate the maximum home price from gross income, monthly debts, down payment, rate, and term. Uses front-end and back-end DTI limits (defaults 28 and 36). Property tax and insurance are optional percents of the price, and PMI is an optional percent of the loan charged above 80 percent LTV. Leaving tax and insurance at zero overstates the price. Results are estimates, not a preapproval.",
      inputSchema: affordabilityInputSchema,
      outputSchema: affordabilityOutputSchema,
      annotations: readOnly,
    },
    (input) => {
      const result = calculateAffordability(input);
      return {
        content: [{ type: "text", text: formatAffordability(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "seller_net_sheet",
    {
      title: "Seller net sheet",
      description:
        "Estimate what a seller keeps from a sale after commission, mortgage payoff, closing costs, and concessions. Commission is a percent of the sale price. Other amounts are dollars. A negative net means the seller may need to bring cash to closing. Results are estimates, not a closing statement.",
      inputSchema: sellerNetInputSchema,
      outputSchema: sellerNetOutputSchema,
      annotations: readOnly,
    },
    (input) => {
      const result = calculateSellerNet(input);
      return {
        content: [{ type: "text", text: formatSellerNet(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "rent_vs_buy",
    {
      title: "Rent versus buy",
      description:
        "Compare renting and buying over a horizon on a change-in-wealth basis. Buying includes interest, carrying costs, closing costs, selling costs, and appreciation. Renting includes rent growth and an investment return on the cash the buyer would have used. Principal paydown is equity, not a loss. Results are estimates, not advice.",
      inputSchema: rentVsBuyInputSchema,
      outputSchema: rentVsBuyOutputSchema,
      annotations: readOnly,
    },
    (input) => {
      const result = calculateRentVsBuy(input);
      return {
        content: [{ type: "text", text: formatRentVsBuy(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "investment_returns",
    {
      title: "Cap rate and cash-on-cash",
      description:
        "Estimate cap rate and cash-on-cash return for a rental property. Cap rate is net operating income divided by purchase price and ignores the loan. Cash-on-cash is annual cash flow after debt service divided by cash invested. Vacancy defaults to 5 percent. Omit the down payment for an all-cash purchase. Do not put the mortgage in operating expenses. Results are estimates.",
      inputSchema: investmentInputSchema,
      outputSchema: investmentOutputSchema,
      annotations: readOnly,
    },
    (input) => {
      const result = calculateInvestment(input);
      return {
        content: [{ type: "text", text: formatInvestment(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerResource(
    "glossary",
    GLOSSARY_URI,
    {
      title: "Real estate glossary",
      description: "Short definitions for mortgage, seller, and rental terms used by these tools.",
      mimeType: "text/markdown",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: GLOSSARY_MARKDOWN,
        },
      ],
    }),
  );

  server.registerPrompt(
    "compare_offers",
    {
      title: "Compare offers",
      description: "Draft a prompt that compares two sale offers using the seller net sheet tool.",
      argsSchema: compareOffersArgsSchema,
    },
    (args) => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: compareOffersText(args) },
        },
      ],
    }),
  );

  return server;
}
