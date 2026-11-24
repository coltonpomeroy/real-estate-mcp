# real-estate-mcp

[![CI](https://github.com/coltonpomeroy/real-estate-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/coltonpomeroy/real-estate-mcp/actions/workflows/ci.yml)

MCP (Model Context Protocol) is an open standard that lets an AI app call tools, read resources, and fill prompts from a local server.

This server is that kind of local server for real estate math: mortgage payments, affordability, a seller net sheet, rent versus buy, and rental cap rate / cash-on-cash. It is a portfolio project by Colton Pomeroy, a full-stack engineer in real estate tech. No API key is required.

It uses the official MCP TypeScript SDK v2 (`@modelcontextprotocol/server` for the server, `@modelcontextprotocol/client` in the tests). v2 replaced the single v1 package `@modelcontextprotocol/sdk`.

Rates are annual percents. Pass `6.5` for 6.5 percent, not `0.065`. Money values are US dollars.

## Tools

| Tool | Question it answers |
| --- | --- |
| `mortgage_payment` | Monthly principal and interest, plus optional taxes, insurance, HOA, and PMI, with an amortization summary |
| `affordability` | Maximum home price from income, debts, down payment, rate, term, and DTI limits |
| `seller_net_sheet` | Estimated seller proceeds after commission, payoff, closing costs, and concessions |
| `rent_vs_buy` | Which path leaves more wealth over a horizon you choose |
| `investment_returns` | Cap rate and cash-on-cash return for a rental |

Inputs are checked with Zod before the handler runs. Each tool returns text plus `structuredContent` that matches an output schema.

`mortgage_payment` takes yearly tax and insurance as dollars, because the home is already known. `affordability` takes them as percents of the price, because the price is what you are solving for. Leaving those percents at zero produces a principal-and-interest estimate, which runs high compared with a full housing payment.

`affordability` defaults to a 28 percent front-end DTI limit and a 36 percent back-end limit. PMI, when you pass a yearly rate, is added only if the loan is above 80 percent of the price.

`investment_returns` treats vacancy as 5 percent of gross rent unless you change it. Omit `downPayment` for an all-cash purchase. Keep the mortgage out of operating expenses. Cap rate ignores financing. Cash-on-cash is cash flow after principal and interest, divided by down payment plus closing costs.

## Resource and prompt

* Resource `realestate://glossary` (`glossary`): short markdown definitions for PITI, PMI, DTI, LTV, NOI, cap rate, and the other terms the tools use.
* Prompt `compare_offers`: asks the model to call `seller_net_sheet` once for each of two offers and compare the estimated nets. Prompt arguments are strings, which is how MCP prompts pass form fields.

## Requirements

Node.js 20 or newer.

## Run it

```bash
git clone https://github.com/coltonpomeroy/real-estate-mcp.git
cd real-estate-mcp
npm install
npx real-estate-mcp
```

`npm install` compiles TypeScript (`prepare` runs the build). `package.json` points the `real-estate-mcp` bin at `dist/index.js`, with a `#!/usr/bin/env node` shebang, so `npx` can start it. This package is not published to the npm registry.

The default transport is stdio. The process waits for a client on stdin. Logs go to stderr. Stdout is the protocol stream.

Streamable HTTP is optional, bound to loopback, with Host and Origin checks:

```bash
npx real-estate-mcp --http --port 3000
```

The endpoint is `http://127.0.0.1:3000/mcp`.

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, or `%APPDATA%\Claude\claude_desktop_config.json` on Windows. Use the absolute path to the built file. Claude launches commands with a limited PATH, so this form is the reliable one:

```json
{
  "mcpServers": {
    "real-estate": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/real-estate-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after saving.

If `npx` is on the PATH that Claude uses, you can install from GitHub instead. npm runs `prepare`, which builds the server, then starts the bin. Nothing is downloaded from the npm registry.

```json
{
  "mcpServers": {
    "real-estate": {
      "command": "npx",
      "args": ["-y", "github:coltonpomeroy/real-estate-mcp"]
    }
  }
}
```

## Cursor

Use the same `mcpServers` object in a project file `.cursor/mcp.json`, or in the global file `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "real-estate": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/real-estate-mcp/dist/index.js"]
    }
  }
}
```

## Examples

### mortgage_payment

Call:

```json
{
  "name": "mortgage_payment",
  "arguments": {
    "principal": 400000,
    "annualInterestRate": 6.5,
    "termYears": 30,
    "annualPropertyTax": 4800,
    "annualInsurance": 1800,
    "monthlyHoa": 75
  }
}
```

Text:

```text
Mortgage payment estimate

Loan: $400,000.00 at 6.50% for 30 years (360 months)
Principal and interest: $2,528.27
Property tax: $400.00
Insurance: $150.00
HOA: $75.00
PMI: $0.00
Total monthly payment: $3,153.27

Amortization summary
Total principal: $400,000.00
Total interest: $510,179.81
Total of principal and interest: $910,179.81
First payment: $361.60 principal, $2,166.67 interest, balance $399,638.40
Last payment: $2,517.24 principal, $13.64 interest, balance $0.00
```

Structured content (same numbers the model can read as JSON):

```json
{
  "principal": 400000,
  "annualInterestRate": 6.5,
  "termYears": 30,
  "termMonths": 360,
  "monthlyPrincipalAndInterest": 2528.27,
  "monthlyPropertyTax": 400,
  "monthlyInsurance": 150,
  "monthlyHoa": 75,
  "monthlyPmi": 0,
  "totalMonthlyPayment": 3153.27,
  "totalPrincipal": 400000,
  "totalInterest": 510179.81,
  "totalOfPayments": 910179.81,
  "firstPayment": {
    "paymentNumber": 1,
    "principal": 361.6,
    "interest": 2166.67,
    "total": 2528.27,
    "balance": 399638.4
  },
  "lastPayment": {
    "paymentNumber": 360,
    "principal": 2517.24,
    "interest": 13.64,
    "total": 2530.88,
    "balance": 0
  }
}
```

The final payment can differ by a few cents from the scheduled payment, because each month's interest is rounded to the cent and the last payment clears the balance.

### affordability

```json
{
  "name": "affordability",
  "arguments": {
    "annualGrossIncome": 150000,
    "monthlyDebtPayments": 500,
    "downPayment": 60000,
    "annualInterestRate": 6.5,
    "termYears": 30,
    "annualPropertyTaxRate": 1.1,
    "annualInsuranceRate": 0.35,
    "annualPmiRate": 0.5
  }
}
```

```text
Maximum home price: $491,365.75
Loan amount: $431,365.75
Housing allowance: $3,500.00
Total monthly housing payment: $3,500.00
Front-end DTI at this price: 28.00%
Back-end DTI at this price: 32.00%
```

The front-end limit binds. PMI is included because the loan is about 87.8 percent of the price. `bindingConstraint` in the structured result is `front_end_dti`.

### seller_net_sheet

```json
{
  "name": "seller_net_sheet",
  "arguments": {
    "salePrice": 525000,
    "mortgagePayoff": 280000,
    "commissionPercent": 5.5,
    "closingCosts": 7000,
    "concessions": 8000
  }
}
```

```text
Commission (5.50%): $28,875.00
Estimated net proceeds: $201,125.00 (38.31% of the sale price)
```

`sellerBringsCash` is false. A negative `estimatedNetProceeds` means the seller may need to bring cash to closing.

### rent_vs_buy

```json
{
  "name": "rent_vs_buy",
  "arguments": {
    "homePrice": 450000,
    "downPayment": 90000,
    "annualInterestRate": 6.5,
    "termYears": 30,
    "monthlyRent": 2400,
    "horizonYears": 7,
    "annualPropertyTax": 4500,
    "annualInsurance": 1800,
    "monthlyMaintenance": 150,
    "buyingClosingCosts": 9000
  }
}
```

Defaults used above: 3 percent appreciation, 3 percent rent growth, a 5 percent return on the cash the renter keeps, and 6 percent selling costs.

```text
First month owner cash: $2,950.44
Total rent paid: $220,678.92
Buyer change in wealth: -$152,099.36
Renter change in wealth: -$180,375.98
Buying produces about $28,276.62 more wealth over this horizon.
```

`betterChoice` is `buy` and `wealthGap` is `28276.62`. Both paths cost money over 7 years. The gap is which one costs less after equity and the renter's investment gain. Principal paydown is treated as equity, not as a loss.

### investment_returns

```json
{
  "name": "investment_returns",
  "arguments": {
    "purchasePrice": 350000,
    "grossAnnualRent": 42000,
    "operatingExpensesAnnual": 12000,
    "downPayment": 70000,
    "annualInterestRate": 6.5,
    "closingCosts": 8000
  }
}
```

```text
Net operating income: $27,900.00
Cap rate: 7.97%
Annual debt service: $21,237.48
Annual cash flow: $6,662.52
Cash invested: $78,000.00
Cash-on-cash return: 8.54%
```

Structured values: `capRatePercent` 7.9714, `cashOnCashPercent` 8.5417. A negative cash-on-cash result is returned as a negative number when debt service is larger than NOI.

### compare_offers

```json
{
  "name": "compare_offers",
  "arguments": {
    "salePriceA": "450000",
    "salePriceB": "445000",
    "concessionsA": "0",
    "concessionsB": "10000",
    "mortgagePayoff": "250000",
    "commissionPercent": "5.5",
    "closingCosts": "6000"
  }
}
```

The prompt tells the model to call `seller_net_sheet` for each offer and to show both nets, the difference, and which offer the seller keeps more from.

## Development

```bash
npm run lint
npm run typecheck
npm test
```

`npm test` builds `dist/` and runs Vitest. Unit tests cover the calculators. One integration test launches `node dist/index.js` over stdio and calls tools, the glossary, and the prompt through `@modelcontextprotocol/client`. Another test does the same over Streamable HTTP.

GitHub Actions runs lint, typecheck, build, and tests on Node 20 and Node 22.

## Disclaimer

These results are estimates for education and planning. Confirm them with a lender, title company, or advisor before you rely on them. The tools do not pull live rates, tax records, or insurance quotes.

## License

MIT. Copyright 2026 Colton Pomeroy.
