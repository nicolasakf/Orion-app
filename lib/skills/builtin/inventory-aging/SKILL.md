---
name: inventory-aging
description: Reviews inventory age, sell-through, stale stock, and stockout risk for retail or ecommerce operations teams.
---

# Inventory aging

Use this skill when the user asks about inventory, stock, stale products, aging, sell-through, stockouts, replenishment, or dead stock.

## Workflow

1. Identify item, SKU, product, category, on-hand quantity, received date, last sold date, sales quantity, unit cost, and location columns.
2. Parse dates carefully and establish the analysis date. Use today only if the dataset does not define a reporting date.
3. Compute practical inventory metrics when data supports them:
   - inventory age in days;
   - days since last sale;
   - on-hand value;
   - sell-through rate;
   - weeks of cover;
   - stale inventory buckets such as 0-30, 31-60, 61-90, and 90+ days.
4. Segment results by category, SKU, product, vendor, channel, and location where available.
5. Flag risks:
   - high-value stale inventory;
   - fast sellers with low stock;
   - negative or zero quantities;
   - missing dates or costs;
   - slow-moving categories with high cash tied up.
6. Create plain-language recommendations for markdown, liquidation, replenishment, or data cleanup.
7. Load `create-app` if the result should become a dashboard.

## Completion

End with a prioritized action list: what to discount, what to reorder, what to investigate, and what data fields are missing for a stronger inventory review.
