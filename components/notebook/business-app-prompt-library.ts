export interface BusinessAppPromptSuggestion {
  title: string;
  prompt: string;
}

export interface BusinessAppPromptCategory {
  category: string;
  suggestions: readonly BusinessAppPromptSuggestion[];
}

export const BUSINESS_APP_PROMPT_CATEGORIES = [
  {
    category: "Data Overview",
    suggestions: [
      {
        title: "Summarize this dataset",
        prompt:
          "Analyze the active dataset and create a clear overview covering row counts, columns, data types, key metrics, missing values, and the first questions worth investigating.",
      },
      {
        title: "Profile every column",
        prompt:
          "Profile every column in this dataset with distributions, unique counts, missingness, likely identifiers, likely categorical fields, and any fields that need cleaning before analysis.",
      },
      {
        title: "Find quick wins",
        prompt:
          "Scan the notebook data for quick analytical wins: surprising patterns, obvious segments, easy visualizations, quality issues, and the fastest path to a useful finding.",
      },
      {
        title: "Create a data dictionary",
        prompt:
          "Create a practical data dictionary from this dataset with inferred field meanings, data types, examples, quality notes, and suggested transformations.",
      },
      {
        title: "Map analysis questions",
        prompt:
          "Turn this dataset into a prioritized analysis plan with business questions, required fields, assumptions, charts to build, and checks needed before trusting the results.",
      },
    ],
  },
  {
    category: "Cleaning",
    suggestions: [
      {
        title: "Clean the dataset",
        prompt:
          "Inspect this dataset for cleaning issues, then create code that standardizes column names, fixes obvious type problems, handles missing values safely, and explains every change.",
      },
      {
        title: "Audit missing data",
        prompt:
          "Analyze missing data patterns by column and segment, visualize the gaps, explain likely impact on analysis, and recommend an imputation or exclusion strategy.",
      },
      {
        title: "Detect duplicates",
        prompt:
          "Check for duplicate rows and likely duplicate entities, explain the matching logic, quantify the impact, and create a cleaned dataset when it is safe to do so.",
      },
      {
        title: "Fix date fields",
        prompt:
          "Find every date or timestamp field, parse it safely, flag invalid values, derive useful calendar features, and summarize coverage by day, week, month, and year.",
      },
      {
        title: "Validate categories",
        prompt:
          "Audit categorical columns for inconsistent labels, whitespace, casing, rare categories, and spelling variants, then propose and apply a conservative normalization map.",
      },
    ],
  },
  {
    category: "Exploration",
    suggestions: [
      {
        title: "Run exploratory analysis",
        prompt:
          "Perform exploratory data analysis on this dataset with summary statistics, distributions, missingness, correlations, outliers, key charts, and concise takeaways.",
      },
      {
        title: "Spot anomalies",
        prompt:
          "Identify anomalies and outliers across numeric, categorical, and time-based fields, show the most suspicious records, and explain whether each looks like noise or signal.",
      },
      {
        title: "Find correlations",
        prompt:
          "Analyze relationships between numeric variables using correlations and visual checks, highlight strong or surprising relationships, and warn about misleading correlations.",
      },
      {
        title: "Compare distributions",
        prompt:
          "Compare important distributions across groups or time periods, visualize the differences, and explain where averages hide meaningful variation.",
      },
      {
        title: "Surface hidden patterns",
        prompt:
          "Search for non-obvious patterns in this dataset using grouped summaries, pairwise comparisons, and visual exploration, then rank the findings by usefulness.",
      },
    ],
  },
  {
    category: "Segmentation",
    suggestions: [
      {
        title: "Compare customer segments",
        prompt:
          "Identify useful customer or entity segments, compare their behavior and outcomes, and create charts that make the segment differences easy to act on.",
      },
      {
        title: "Find high-value groups",
        prompt:
          "Find the highest-value groups in this dataset, quantify what makes them valuable, compare them against the baseline, and suggest how to prioritize them.",
      },
      {
        title: "Cluster similar records",
        prompt:
          "Build a clustering analysis for relevant records, choose sensible features, profile each cluster, visualize the results, and explain practical uses for the clusters.",
      },
      {
        title: "Analyze cohort behavior",
        prompt:
          "Create a cohort analysis based on the best available start date or first-event field, then compare retention, activity, value, or conversion over time.",
      },
      {
        title: "Profile churn risk",
        prompt:
          "Segment records by likely churn or drop-off risk using available behavior fields, explain the risk drivers, and recommend retention actions for each group.",
      },
    ],
  },
  {
    category: "Time Series",
    suggestions: [
      {
        title: "Analyze trends over time",
        prompt:
          "Analyze trends over time for the main metrics, including seasonality, growth rates, rolling averages, changes in volatility, and the most important turning points.",
      },
      {
        title: "Forecast next period",
        prompt:
          "Create a practical forecast for the main time-based metric, compare simple baseline methods, show uncertainty, and explain where the forecast should not be trusted.",
      },
      {
        title: "Detect trend breaks",
        prompt:
          "Find meaningful trend breaks, spikes, dips, or regime changes in the time series, then connect each change to candidate drivers in the available data.",
      },
      {
        title: "Build a seasonality view",
        prompt:
          "Analyze seasonality by hour, day of week, week, month, and quarter where possible, and create visuals that show recurring patterns clearly.",
      },
      {
        title: "Compare periods",
        prompt:
          "Compare the latest period against prior periods, quantify the biggest metric changes, decompose the differences by segment, and summarize likely explanations.",
      },
    ],
  },
  {
    category: "Business Metrics",
    suggestions: [
      {
        title: "Build KPI dashboard",
        prompt:
          "Create an App View KPI dashboard from this notebook with headline metrics, trend charts, segment comparisons, caveats, and recommended next actions.",
      },
      {
        title: "Explain metric drivers",
        prompt:
          "Decompose the main metric into its likely drivers, quantify each driver's contribution, and create visuals that explain what changed and why.",
      },
      {
        title: "Analyze funnel conversion",
        prompt:
          "Build a funnel analysis from the available event or stage data, calculate conversion and drop-off rates, compare segments, and identify the biggest bottlenecks.",
      },
      {
        title: "Review unit economics",
        prompt:
          "Analyze revenue, cost, margin, average order value, lifetime value, or other unit economics fields available in this dataset and summarize profitability drivers.",
      },
      {
        title: "Prioritize opportunities",
        prompt:
          "Rank the biggest business opportunities in this data by estimated impact, confidence, effort, and supporting evidence, then recommend what to investigate first.",
      },
    ],
  },
  {
    category: "Statistics",
    suggestions: [
      {
        title: "Test group differences",
        prompt:
          "Compare key metrics across groups using appropriate statistical tests, report effect sizes and confidence intervals, and explain the result in plain language.",
      },
      {
        title: "Design an A/B analysis",
        prompt:
          "Analyze this experiment or comparison as an A/B test: validate sample sizes, check balance, estimate lift, calculate uncertainty, and state the decision recommendation.",
      },
      {
        title: "Estimate confidence intervals",
        prompt:
          "Calculate confidence intervals for the most important metrics overall and by segment, then explain what the uncertainty means for decision-making.",
      },
      {
        title: "Check sampling bias",
        prompt:
          "Assess whether this dataset may be biased or unrepresentative by comparing coverage across groups, time, sources, and missingness patterns.",
      },
      {
        title: "Power a future test",
        prompt:
          "Use the available baseline rates or metric variance to estimate sample size and test duration for a future experiment with practical assumptions.",
      },
    ],
  },
  {
    category: "Modeling",
    suggestions: [
      {
        title: "Build prediction baseline",
        prompt:
          "Build a simple predictive baseline for the most relevant target, choose sensible features, evaluate performance, and explain what the model can and cannot tell us.",
      },
      {
        title: "Rank feature importance",
        prompt:
          "Train an interpretable model or use suitable feature-importance methods to identify which variables best explain the target, with caveats about causality.",
      },
      {
        title: "Classify outcomes",
        prompt:
          "Create a classification analysis for the target outcome, compare at least one simple baseline against a stronger model, and summarize precision, recall, and tradeoffs.",
      },
      {
        title: "Predict numeric values",
        prompt:
          "Create a regression model for the target numeric metric, evaluate errors, inspect residuals, and explain where predictions are strongest or weakest.",
      },
      {
        title: "Score records",
        prompt:
          "Create a practical scoring approach for ranking records by likelihood, value, risk, or priority, then output the top records with reasons for each score.",
      },
    ],
  },
  {
    category: "Visualization",
    suggestions: [
      {
        title: "Choose the best charts",
        prompt:
          "Recommend and create the best charts for this dataset based on the fields available, avoiding misleading visuals and explaining what each chart reveals.",
      },
      {
        title: "Make an executive view",
        prompt:
          "Turn the most important findings into an executive App View with concise headings, clean charts, metric cards, caveats, and decision-ready recommendations.",
      },
      {
        title: "Create a drilldown view",
        prompt:
          "Create a drilldown analysis that starts with top-level metrics, then lets a reader inspect segments, outliers, and representative records behind each finding.",
      },
      {
        title: "Visualize geography",
        prompt:
          "If geographic fields are available, map performance by region, compare locations fairly, and identify geographic clusters, gaps, or outliers.",
      },
      {
        title: "Tell the data story",
        prompt:
          "Create a narrative walkthrough of the analysis with the key question, evidence, charts, interpretation, caveats, and recommended next steps.",
      },
    ],
  },
  {
    category: "Reporting",
    suggestions: [
      {
        title: "Write a stakeholder brief",
        prompt:
          "Write a stakeholder-ready brief from this analysis with the conclusion first, supporting evidence, caveats, decisions needed, and clear next actions.",
      },
      {
        title: "Create monthly report",
        prompt:
          "Create a polished monthly report in App View with performance highlights, metric movements, charts, anomalies, and a short leadership-ready summary.",
      },
      {
        title: "Prepare client insights",
        prompt:
          "Build an App View client insights page from this notebook with findings, supporting visuals, plain-language interpretation, and suggested follow-ups.",
      },
      {
        title: "List risks and caveats",
        prompt:
          "Review the analysis for risks, caveats, weak assumptions, data quality concerns, and places where the evidence does not support a strong conclusion.",
      },
      {
        title: "Recommend next steps",
        prompt:
          "Review this notebook and create an App View with recommended next steps, supporting evidence, owner-ready action items, and open questions to resolve.",
      },
    ],
  },
] as const satisfies readonly BusinessAppPromptCategory[];

export const FEATURED_BUSINESS_APP_PROMPTS = [
  BUSINESS_APP_PROMPT_CATEGORIES[0].suggestions[0],
  BUSINESS_APP_PROMPT_CATEGORIES[1].suggestions[0],
  BUSINESS_APP_PROMPT_CATEGORIES[2].suggestions[0],
  BUSINESS_APP_PROMPT_CATEGORIES[5].suggestions[0],
] as const satisfies readonly BusinessAppPromptSuggestion[];
