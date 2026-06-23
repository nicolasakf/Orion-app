---
name: deep-eda
description: Runs an exhaustive, adaptive exploratory data analysis only when the user explicitly asks for deep, exhaustive, or thorough EDA. Never use for direct questions, routine summaries, or narrowly scoped analysis.
---

# Deep exploratory data analysis

This workflow is intentionally enduring and must not be inferred from an ordinary data question.

## Activation

1. Read Orion's controller status before acting. If it says the run is active, begin investigating immediately and do not call `begin_deep_eda` or reload this skill.
2. Call `begin_deep_eda` only when Orion says activation is required. If activation is declined, return to the user's bounded request.
3. Once active, continue until `complete_deep_eda` returns `accepted: true` or the user stops the run.
4. A normal prose response does not complete an active deep-EDA run; take the next concrete analytical action instead.

## Durable workflow

- Work in the active notebook. If none is active, create a collision-safe notebook named from the dataset plus `_deep_eda.ipynb`.
- Keep loading, profiling, transformations, statistics, plots, and conclusions in reproducible notebook cells.
- Add narrative markdown as the investigation evolves. Do not leave a pile of unexplained outputs.
- Investigate adaptively. Prefer the next question with the greatest expected information value over a generic checklist or exhaustive pairwise plotting.

## Visualization defaults

- Prefer static image plots made with Matplotlib and Seaborn. Import `matplotlib.pyplot as plt` and, when useful, `seaborn as sns`.
- Use Matplotlib-backed plots for distributions, missingness, outliers, group comparisons, relationships, and time patterns whenever a visual can reveal structure that a table may hide.
- Always render each figure into the notebook output with `plt.show()`. Close it afterward with `plt.close(fig)` when a figure handle is available so later cells do not accidentally reuse it.
- Give plots informative titles, axis labels, units, legends, and readable category ordering. Prefer several focused figures over one overcrowded dashboard.
- Do not use Plotly, Vega, HTML-only charts, or interactive chart libraries during deep EDA unless the user explicitly requests interactive output or Matplotlib cannot represent the necessary evidence. Orion's mandatory visual-inspection loop currently relies on PNG/JPEG raster output.
- Tables and summary statistics should support plots, not replace them when shape, overlap, skew, anomalies, or relationships are analytically relevant.

## Investigation ledger

Call `update_deep_eda_state` whenever evidence materially changes. Submit only the coverage entries, findings, and questions that changed; Orion owns and merges the canonical ledger. Cover:

- schema and integrity;
- missingness and data quality;
- relevant univariate distributions;
- relationships, groups, and segments;
- anomalies and outliers;
- task-specific risks such as leakage, time effects, sampling, or bias;
- synthesis and limitations.

Every completed area needs notebook cell/output evidence. Mark an area `not_applicable` only with a concrete rationale. Keep unresolved questions explicit and prioritize them honestly.

For ordinary non-empty datasets, the `univariate_distributions`, `relationships_segments`, and `anomalies_outliers` areas should include relevant Matplotlib/Seaborn raster evidence. Do not mark the run complete if no PNG/JPEG plot has been generated and inspected.

## Visual evidence

Orion automatically requires `record_visual_inspection` after agent-generated PNG/JPEG outputs. Describe what is actually visible, judge whether the result makes sense, and revise misleading or invalid plots. If image input is unavailable, run supporting numeric checks and record the limitation; never pretend to have seen the image.

## Completion

Before proposing completion:

- resolve every high-priority open question;
- ensure every generated PNG/JPEG has an inspection record;
- ensure the notebook contains inspected Matplotlib/Seaborn raster evidence; a Plotly output does not satisfy this requirement;
- tie material findings to notebook evidence;
- write final notebook synthesis cells covering findings, uncertainty, limitations, and useful next steps;
- call `update_deep_eda_state` with any final evidence increments;
- call `complete_deep_eda` with the synthesis cell indices.

If completion is rejected, address every returned missing requirement and try again. There is no automatic iteration limit.
