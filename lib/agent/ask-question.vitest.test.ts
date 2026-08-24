import { describe, expect, it } from "vitest";

import {
  buildAskQuestionInputSchema,
  buildAskQuestionTool,
  clampMaxQuestionsPerAsk,
  DEFAULT_MAX_QUESTIONS_PER_ASK,
  formatAskQuestionResult,
  MAX_MAX_QUESTIONS_PER_ASK,
  MIN_MAX_QUESTIONS_PER_ASK,
  parseAskQuestionInput,
} from "@/lib/agent/ask-question";
import { ASK_MODE_TOOLS, ORION_TOOL_NAMES, orionTools } from "@/lib/agent/tool-schemas";
import { DEFAULT_INTERACTION_MODE_CONFIGS, normalizeInteractionModeConfigs } from "@/lib/agent/interaction-modes";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

/** Well-formed question used wherever the test only needs a valid entry. */
function question(text: string) {
  return {
    question: text,
    context: "",
    suggestions: ["Yes", "No"],
    allowMultiple: false,
    allowCustomAnswer: true,
    required: true,
  };
}

describe("clampMaxQuestionsPerAsk", () => {
  it("falls back to the default for non-numeric settings values", () => {
    expect(clampMaxQuestionsPerAsk("4")).toBe(DEFAULT_MAX_QUESTIONS_PER_ASK);
    expect(clampMaxQuestionsPerAsk(undefined)).toBe(DEFAULT_MAX_QUESTIONS_PER_ASK);
    expect(clampMaxQuestionsPerAsk(Number.NaN)).toBe(DEFAULT_MAX_QUESTIONS_PER_ASK);
  });

  it("clamps out-of-range values into the supported bounds", () => {
    expect(clampMaxQuestionsPerAsk(0)).toBe(MIN_MAX_QUESTIONS_PER_ASK);
    expect(clampMaxQuestionsPerAsk(999)).toBe(MAX_MAX_QUESTIONS_PER_ASK);
    expect(clampMaxQuestionsPerAsk(3.4)).toBe(3);
  });
});

describe("parseAskQuestionInput", () => {
  it("rejects input that is not a question list", () => {
    expect(parseAskQuestionInput({ questions: [] }, 5)).toBeNull();
    expect(parseAskQuestionInput({}, 5)).toBeNull();
    expect(parseAskQuestionInput({ questions: [{ question: "Why?" }] }, 5)).toBeNull();
  });

  it("truncates a model that overruns the configured limit", () => {
    const input = {
      questions: [question("One"), question("Two"), question("Three")],
    };

    expect(parseAskQuestionInput(input, 2)?.questions).toHaveLength(2);
    expect(parseAskQuestionInput(input, 10)?.questions).toHaveLength(3);
  });
});

describe("buildAskQuestionTool", () => {
  it("encodes the configured limit in both the schema and the description", () => {
    const tool = buildAskQuestionTool(2);
    const overLimit = {
      questions: [question("One"), question("Two"), question("Three")],
    };

    expect(tool.description).toContain("up to 2 questions");
    expect(buildAskQuestionInputSchema(2).safeParse(overLimit).success).toBe(false);
    expect(
      buildAskQuestionInputSchema(2).safeParse({ questions: [question("One")] })
        .success
    ).toBe(true);
  });

  it("clamps a nonsense limit instead of producing an unusable schema", () => {
    const tool = buildAskQuestionTool(0);
    expect(tool.description).toContain("up to 1 question");
    expect(
      buildAskQuestionInputSchema(0).safeParse({ questions: [question("One")] })
        .success
    ).toBe(true);
    expect(
      buildAskQuestionInputSchema(0).safeParse({
        questions: [question("One"), question("Two")],
      }).success
    ).toBe(false);
  });
});

describe("formatAskQuestionResult", () => {
  it("renders selected, typed, and skipped answers for the model", () => {
    const text = formatAskQuestionResult({
      answers: [
        {
          question: "Which dataset?",
          selected: ["sales_2025.csv"],
          custom: "",
          skipped: false,
        },
        { question: "Anything else?", selected: [], custom: "  ", skipped: false },
        { question: "Rebuild the index?", selected: [], custom: "", skipped: true },
      ],
    });

    expect(text).toContain("sales_2025.csv");
    expect(text).toContain("(no answer given)");
    expect(text).toContain("(skipped by the user)");
  });

  it("tells the model to proceed on its own when the questions were dismissed", () => {
    const text = formatAskQuestionResult({ answers: [], cancelled: true });
    expect(text).toContain("dismissed");
    expect(text).toContain("Do not ask again");
  });
});

describe("ask_question registration", () => {
  it("is a model-facing tool available in every built-in mode", () => {
    expect(ORION_TOOL_NAMES).toContain("ask_question");
    expect(orionTools.ask_question).toBeDefined();
    expect(ASK_MODE_TOOLS.ask_question).toBeDefined();
    for (const mode of DEFAULT_INTERACTION_MODE_CONFIGS) {
      expect(mode.toolNames).toContain("ask_question");
    }
  });

  it("upgrades an otherwise-default built-in mode persisted before the tool existed", () => {
    const previousDefaults = Object.keys(ASK_MODE_TOOLS).filter(
      (toolName) => toolName !== "ask_question",
    );
    const [ask] = normalizeInteractionModeConfigs([
      { id: "Ask", toolNames: previousDefaults },
    ]).filter((mode) => mode.id === "Ask");

    expect(ask.toolNames).toEqual(Object.keys(ASK_MODE_TOOLS));
  });

  it("leaves a user-customized tool list without the new tool", () => {
    const [ask] = normalizeInteractionModeConfigs([
      { id: "Ask", toolNames: ["read_file", "web_search"] },
    ]).filter((mode) => mode.id === "Ask");

    expect(ask.toolNames).toEqual(["read_file", "web_search"]);
  });

  it("ships a default question limit inside the supported bounds", () => {
    const limit = DEFAULT_SETTINGS.agent.execution.maxQuestionsPerAsk;
    expect(limit).toBe(DEFAULT_MAX_QUESTIONS_PER_ASK);
    expect(limit).toBeGreaterThanOrEqual(MIN_MAX_QUESTIONS_PER_ASK);
    expect(limit).toBeLessThanOrEqual(MAX_MAX_QUESTIONS_PER_ASK);
  });
});
