import {
  ChartNoAxesCombined,
  FolderSearch,
  LayoutDashboard,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/** A prompt that is inserted into the chat composer from the business empty state. */
export interface BusinessPromptSuggestion {
  id: string;
  title: string;
  prompt: string;
}

/** A group of related business prompts shown in the empty-chat prompt library. */
export interface BusinessPromptCategory {
  id: "project" | "data" | "reports" | "automation";
  title: string;
  description: string;
  icon: LucideIcon;
  prompts: readonly BusinessPromptSuggestion[];
}

/** Starter prompts organized around the main ways people work in the business experience. */
export const BUSINESS_PROMPT_CATEGORIES: readonly BusinessPromptCategory[] = [
  {
    id: "project",
    title: "Explore your project",
    description: "Understand files, folders, and documentation.",
    icon: FolderSearch,
    prompts: [
      {
        id: "understand-project",
        title: "Get an overview of this project",
        prompt:
          "Help me understand this project. Start by asking what I am trying to accomplish and which files, folders, or documents matter most. Then explain the project's purpose, main parts, and next steps in plain language.",
      },
      {
        id: "find-information",
        title: "Find the information I need in my files",
        prompt:
          "Help me find the right information in these files. Start by asking what I need to find and any useful names, dates, or terms. Then search the relevant materials and summarize the most helpful results.",
      },
      {
        id: "understand-document",
        title: "Summarize a document and its key points",
        prompt:
          "Help me understand these documents. Start by asking what decision or question they should support and who will use the answer. Then summarize the key points, important details, and open questions.",
      },
      {
        id: "compare-files",
        title: "Compare files or versions side by side",
        prompt:
          "Compare these files or versions. Start by asking which materials to compare and which differences matter for my work. Then highlight what changed, what is consistent, and what may need attention.",
      },
      {
        id: "assess-project-readiness",
        title: "Check whether this project is ready",
        prompt:
          "Review this project for readiness. Start by asking the intended outcome and any deadline or standard it must meet. Then identify what is complete, what is missing, and the best next steps.",
      },
    ],
  },
  {
    id: "data",
    title: "Investigate your data",
    description: "Find patterns, changes, and useful insights.",
    icon: ChartNoAxesCombined,
    prompts: [
      {
        id: "find-key-insights",
        title: "Find the most important insights in my data",
        prompt:
          "Investigate this data for useful insights. Start by asking which question or decision it should inform and what time period or group matters most. Then identify the most important patterns, changes, and takeaways.",
      },
      {
        id: "explain-changes",
        title: "Explain what changed and why it matters",
        prompt:
          "Help me understand what changed in this data. Start by asking which numbers or outcomes matter, the time period to compare, and any events that may explain a change. Then show the meaningful increases, decreases, and possible reasons.",
      },
      {
        id: "compare-groups",
        title: "Compare performance across groups",
        prompt:
          "Compare the groups in this data. Start by asking which groups to compare, what success looks like, and the decision this comparison will support. Then explain the meaningful differences and what they suggest.",
      },
      {
        id: "find-unusual-results",
        title: "Find unusual results that need attention",
        prompt:
          "Look for results that deserve attention. Start by asking what would be considered normal, which areas matter most, and whether there are known exceptions. Then identify unusual results, possible causes, and where to investigate further.",
      },
      {
        id: "check-data-before-using-it",
        title: "Check whether this data is reliable enough",
        prompt:
          "Review this data before we rely on it. Start by asking how it will be used and which details are most important. Then look for missing information, inconsistent entries, and limitations that could affect the conclusions.",
      },
    ],
  },
  {
    id: "reports",
    title: "Create reports and visuals",
    description: "Turn information into clear reports, dashboards, and charts.",
    icon: LayoutDashboard,
    prompts: [
      {
        id: "create-report",
        title: "Create a decision-ready report",
        prompt:
          "Create a clear report from this work. Start by asking who will read it, what decision it should support, and the period or topic it should cover. Then organize the key findings, supporting details, and recommended next steps.",
      },
      {
        id: "build-dashboard",
        title: "Build a dashboard for ongoing tracking",
        prompt:
          "Create a dashboard to track what matters. Start by asking who will use it, the questions they need answered at a glance, and the numbers or trends to follow. Then design a focused dashboard that makes those answers easy to see.",
      },
      {
        id: "create-visual-summary",
        title: "Create visuals that explain the story",
        prompt:
          "Turn this information into clear visuals. Start by asking what message the visuals should convey, who will see them, and what comparison or change matters most. Then create the most useful charts or visual summaries.",
      },
      {
        id: "prepare-recurring-update",
        title: "Prepare a clear recurring performance update",
        prompt:
          "Create a recurring update for this work. Start by asking who receives it, how often it is needed, and which changes or results should be highlighted. Then create a format that is clear, consistent, and easy to update.",
      },
      {
        id: "prepare-decision-brief",
        title: "Prepare a concise decision brief",
        prompt:
          "Prepare a concise decision brief. Start by asking the decision to be made, the audience, and the evidence they need to see. Then present the key findings, options, and recommended action clearly.",
      },
    ],
  },
  {
    id: "automation",
    title: "Automate your work",
    description: "Set up dependable, repeatable tasks and updates.",
    icon: Workflow,
    prompts: [
      {
        id: "automate-recurring-task",
        title: "Automate a task I do repeatedly",
        prompt:
          "I want to automate a recurring task. Start by asking what the task is, how it is done today, how often it should run, and what a successful result looks like. Then recommend or set up the best repeatable process.",
      },
      {
        id: "automate-file-process",
        title: "Automate a recurring file process",
        prompt:
          "I want to automate routine work with files. Start by asking which files are involved, what needs to happen to them, where the result should go, and how errors should be handled. Then design a reliable process.",
      },
      {
        id: "create-scheduled-update",
        title: "Set up a scheduled information update",
        prompt:
          "I want to automate a scheduled update. Start by asking what information should be updated, where it comes from, when it should run, and who should receive it. Then create a repeatable update process.",
      },
      {
        id: "set-up-monitoring",
        title: "Set up monitoring and timely alerts",
        prompt:
          "I want to be alerted when something needs attention. Start by asking what to watch for, what should trigger an alert, who should receive it, and how urgent different alerts are. Then set up an appropriate monitoring process.",
      },
      {
        id: "streamline-process",
        title: "Streamline a process with multiple steps",
        prompt:
          "I want to streamline a process with several steps. Start by asking me to describe the current steps, the people or tools involved, and any approvals or exceptions. Then identify what can be automated and outline the new workflow.",
      },
    ],
  },
];
