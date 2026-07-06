---
name: deep-eda
description: Uses the EDA research profile for exhaustive exploratory data analysis inside Orion Research mode. Use only when the user explicitly asks for deep, exhaustive, or thorough EDA.
---

# Deep EDA research profile

This skill supplies the EDA-specific rubric for Orion Research mode. Research mode controls the loop; this skill only defines the EDA coverage, visualization defaults, and notebook journaling expectations.

## Activation

- Continue in Research mode with the EDA profile already selected by Orion.
- Use normal notebook, kernel, file, web, and terminal tools.

## EDA coverage rubric

Cover these areas unless a concrete rationale makes one not applicable. Treat them as staged research coverage, not as a request to draft a complete notebook before the first execution:

- `schema_integrity`: column names, types, keys, cardinality, duplicated rows, parsing issues, and impossible values.
- `missingness_quality`: missing values, placeholder values, systematic missingness, and data quality risks.
- `univariate_distributions`: relevant distributions, skew, sparsity, heavy tails, and class/segment balance.
- `relationships_segments`: relationships between important fields, group differences, interactions, and segment-level patterns.
- `anomalies_outliers`: unusual rows, extreme values, leverage points, and whether they look valid or suspicious.
- `task_specific_risks`: leakage, time effects, sampling bias, label quality, target definition, or other risks implied by the user's objective.
- `synthesis_limitations`: final findings, uncertainty, limitations, and useful next steps.

Recommended progression:

1. Establish loading and schema sanity before writing downstream analysis cells.
2. Use the observed schema and quality issues to choose the next missingness or distribution step.
3. Inspect one plot family or relationship question at a time, then record the observation and next decision.
4. Only add synthesis after the notebook markdown shows the evidence path taken.

## Visualization defaults

- Prefer static Matplotlib/Seaborn plots for distributions, missingness, outliers, group comparisons, relationships, and time patterns.
- Always render relevant figures into notebook output with `plt.show()`, and close figure handles when appropriate.
- Use informative titles, axis labels, units, legends, readable category ordering, and focused figures rather than crowded dashboards.
- Avoid Plotly, Vega, HTML-only charts, or interactive chart libraries unless the user explicitly requests them or static plots cannot show the necessary evidence.
- Tables and summary statistics should support plots, not replace them when visual shape, overlap, skew, anomalies, or relationships matter.

## Notebook journal expectations

Document the investigation directly in notebook markdown as evidence changes. For EDA, each material update should include:

- observations tied to notebook evidence;
- findings tied to evidence;
- open questions and concrete next actions;
- explicit research decisions explaining why the investigation turns in a particular direction;
- limitations when evidence is unavailable, weak, or ambiguous.

Every covered area needs notebook evidence. For ordinary non-empty datasets, `univariate_distributions`, `relationships_segments`, and `anomalies_outliers` should include relevant PNG/JPEG visual evidence or a clear explanation of why numeric/table checks were more appropriate.

## Completion

Before stopping, make sure the notebook contains final markdown synthesis covering:

- main findings;
- research decisions made along the way;
- uncertainty and limitations;
- suggested next steps.
