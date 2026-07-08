---
name: monthly-report
description: Builds a concise monthly business report from uploaded operational or finance data, with plain-language narrative, charts, and App View-ready outputs.
---

# Monthly business report

Use this skill when the user asks for a monthly, weekly, or period-end business report.

## Workflow

1. Identify the reporting period from the user prompt or infer it from the latest complete period in the data.
2. Load and validate the relevant data. Confirm the date column, money columns, category columns, and any business unit or channel columns.
3. Build a report with these sections when applicable:
   - headline performance;
   - revenue or cash movement;
   - costs, gross profit, and margin;
   - category, product, channel, store, or customer drivers;
   - unusual changes versus the previous period;
   - risks, caveats, and recommended actions.
4. Prefer clear time-series charts, ranked bar charts, and concise summary tables over exhaustive diagnostics.
5. Use markdown cells for the narrative and code outputs for charts/tables.
6. Load `create-app` and mark the report narrative, main charts, and decision tables for App View.

## Business framing

Do not just describe charts. Explain what changed, why it may matter, and what the user should check or do next.

## Completion

End with a short executive summary and a checklist of the follow-up data needed to make the report more reliable next month.
