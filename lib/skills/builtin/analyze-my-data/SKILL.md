---
name: analyze-my-data
description: Runs a plain-language business analysis of uploaded data, producing key findings, data quality notes, charts, and suggested next questions for non-technical users.
---

# Analyze my data

Use this skill when the user wants Orion to inspect a business data file without needing to choose an analysis method first.

## Workflow

1. Identify the referenced file or ask which uploaded file to analyze.
2. Load the data in Python with conservative parsing. For spreadsheets, inspect sheet names first and pick the most relevant sheet unless the user specified one.
3. Summarize the dataset in plain language: what each likely column means, row count, date range, important categories, and obvious data quality issues.
4. Run focused exploratory checks:
   - totals and trends over time;
   - top and bottom categories, products, customers, stores, or channels;
   - missing values, duplicates, impossible values, and outliers;
   - relationships that matter for the apparent business context.
5. Create notebook outputs that a non-technical user can read: concise markdown, clear charts, and interactive tables where helpful.
6. If the analysis produces a useful report, load `create-app` and mark the summary, charts, and tables for App View.

## Tone

Write for a business owner or finance/ops teammate. Avoid statistical jargon unless it is necessary, and explain it in one sentence when used.

## Completion

Finish with:

- 3-7 key findings;
- data quality caveats;
- recommended next actions;
- a short list of follow-up questions the user can ask Orion.
