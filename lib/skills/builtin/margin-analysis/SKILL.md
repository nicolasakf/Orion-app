---
name: margin-analysis
description: Analyzes revenue, cost, gross profit, and margin by product, category, channel, store, customer, or period for retail and operations teams.
---

# Margin analysis

Use this skill when the user asks about revenue, cost, profit, margin, markup, discounts, product performance, or category profitability.

## Workflow

1. Identify revenue, cost, quantity, discount, tax, shipping, date, product, category, channel, and store columns. If names are ambiguous, inspect samples before deciding.
2. Compute conservative metrics:
   - revenue;
   - cost;
   - gross profit = revenue - cost;
   - gross margin percent = gross profit / revenue;
   - average selling price and units when quantity is present.
3. Segment by the dimensions that matter in the dataset: product, category, channel, store, customer, vendor, and time period.
4. Flag suspicious records: negative revenue, zero revenue with cost, missing cost, extreme margin, duplicated order lines, and currency/format issues.
5. Create charts and tables that highlight:
   - best and worst margin contributors;
   - high-revenue but low-margin segments;
   - margin changes over time;
   - categories needing pricing, cost, or discount review.
6. Load `create-app` when there is a useful summary dashboard.

## Completion

Explain the findings in business terms: where profit is being made or lost, what looks risky, and which products or channels deserve follow-up.
