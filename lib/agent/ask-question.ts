/**
 * Shared contract for the `ask_question` tool.
 *
 * `ask_question` has no server or kernel side: the chat body renders an embedded
 * questionnaire, the user answers it, and those answers become the tool result.
 * The schema, the configurable per-call question limit, and the result shape all
 * live here so the model-facing tool, the settings field, and the card in the
 * transcript cannot drift apart.
 */

import { tool } from "ai";
import { z } from "zod";

import {
  DEFAULT_MAX_QUESTIONS_PER_ASK,
  MAX_MAX_QUESTIONS_PER_ASK,
  MIN_MAX_QUESTIONS_PER_ASK,
} from "@/lib/settings/schema";

export {
  DEFAULT_MAX_QUESTIONS_PER_ASK,
  MAX_MAX_QUESTIONS_PER_ASK,
  MIN_MAX_QUESTIONS_PER_ASK,
};

/** Suggested answers accepted per question. */
export const MAX_ASK_QUESTION_SUGGESTIONS = 8;

/** Tool result returned when the questionnaire never reached a decision. */
export const ASK_QUESTION_CANCELLED_RESULT = {
  cancelled: true,
  answers: [],
} as const;

/**
 * Clamps a configured per-call question limit into the supported range.
 *
 * Settings are user-editable JSON, so an out-of-range or non-numeric value must
 * degrade to the default rather than produce an unbuildable zod schema.
 */
export function clampMaxQuestionsPerAsk(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_QUESTIONS_PER_ASK;
  }
  const rounded = Math.round(value);
  if (rounded < MIN_MAX_QUESTIONS_PER_ASK) return MIN_MAX_QUESTIONS_PER_ASK;
  if (rounded > MAX_MAX_QUESTIONS_PER_ASK) return MAX_MAX_QUESTIONS_PER_ASK;
  return rounded;
}

/** One question rendered as a single step of the embedded questionnaire. */
export const AskQuestionItemSchema = z.object({
  question: z
    .string()
    .min(1)
    .max(200)
    .describe("The question itself, as one short sentence the user can answer at a glance."),
  context: z
    .string()
    .max(300)
    .describe(
      'One optional line explaining why the answer matters or what it changes. Pass "" when the question needs no extra context.'
    ),
  suggestions: z
    .array(z.string().min(1).max(120))
    .max(MAX_ASK_QUESTION_SUGGESTIONS)
    .describe(
      "Suggested answers shown as selectable options, most likely first. Pass [] for a question that only makes sense as free text."
    ),
  allowMultiple: z
    .boolean()
    .describe(
      "true renders the suggestions as checkboxes so the user can pick several; false renders them as single-choice options."
    ),
  allowCustomAnswer: z
    .boolean()
    .describe(
      "true adds a free-text field so the user can answer outside the suggestions. Must be true when `suggestions` is empty."
    ),
  required: z
    .boolean()
    .describe(
      "true blocks submission until the user answers; false lets the user skip this question."
    ),
});

/** Structured input accepted by the `ask_question` tool. */
export const AskQuestionInputSchema = z.object({
  questions: z.array(AskQuestionItemSchema).min(1),
});

export type AskQuestionItem = z.infer<typeof AskQuestionItemSchema>;
export type AskQuestionInput = z.infer<typeof AskQuestionInputSchema>;

/** One answered, skipped, or unanswered question returned to the model. */
export const AskQuestionAnswerSchema = z.object({
  question: z.string(),
  /** Suggested answers the user selected, in the order they were offered. */
  selected: z.array(z.string()),
  /** Free-text answer, or "" when the user typed nothing. */
  custom: z.string(),
  skipped: z.boolean(),
});

/** Tool result submitted by the questionnaire card. */
export const AskQuestionResultSchema = z.object({
  answers: z.array(AskQuestionAnswerSchema),
  /** true when the questionnaire was dismissed instead of answered. */
  cancelled: z.boolean().optional(),
});

export type AskQuestionAnswer = z.infer<typeof AskQuestionAnswerSchema>;
export type AskQuestionResult = z.infer<typeof AskQuestionResultSchema>;

/**
 * Parses raw tool input, dropping questions past the active limit.
 *
 * The limit is also encoded in the tool schema, but a model can still overrun it
 * on providers with loose structured-output enforcement, and a rejected call
 * would leave the user with nothing to answer.
 *
 * @param input - Raw tool arguments as received from the model
 * @param maxQuestions - Effective per-call limit from settings
 */
export function parseAskQuestionInput(
  input: unknown,
  maxQuestions: number
): AskQuestionInput | null {
  const parsed = AskQuestionInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const limit = clampMaxQuestionsPerAsk(maxQuestions);
  return { questions: parsed.data.questions.slice(0, limit) };
}

/** Renders one answer as the single line the model reads. */
function formatAnswer(answer: AskQuestionAnswer): string {
  if (answer.skipped) return `${answer.question}\n  (skipped by the user)`;
  const values = [...answer.selected];
  if (answer.custom.trim()) values.push(answer.custom.trim());
  if (values.length === 0) return `${answer.question}\n  (no answer given)`;
  return `${answer.question}\n  ${values.join(" | ")}`;
}

/** Converts submitted answers into the text the model receives as the result. */
export function formatAskQuestionResult(result: AskQuestionResult): string {
  if (result.cancelled) {
    return "The user dismissed the questions without answering. Do not ask again — continue with your best judgement and state the assumptions you made.";
  }
  if (result.answers.length === 0) {
    return "The user submitted the questions without answering any of them. Continue with your best judgement and state the assumptions you made.";
  }
  return ["The user answered:", ...result.answers.map(formatAnswer)].join("\n");
}

/**
 * Builds the input schema for a given per-call question limit.
 *
 * @param maxQuestions - Effective per-call limit from settings
 */
export function buildAskQuestionInputSchema(maxQuestions: number) {
  const limit = clampMaxQuestionsPerAsk(maxQuestions);
  return z.object({
    questions: z
      .array(AskQuestionItemSchema)
      .min(1)
      .max(limit)
      .describe(
        `The questions to ask, in the order they should be answered. At most ${limit} per call — ask only the questions whose answers change what you do next.`
      ),
  });
}

/**
 * Builds the model-facing `ask_question` tool for a given per-call limit.
 *
 * The limit is a user setting, so both the array bound and the description have
 * to be generated rather than written once as a constant.
 *
 * @param maxQuestions - Effective per-call limit from settings
 */
export function buildAskQuestionTool(maxQuestions: number) {
  const limit = clampMaxQuestionsPerAsk(maxQuestions);
  return tool({
    description: `Ask the user up to ${limit} question${limit === 1 ? "" : "s"} and wait for the answers. The questions render as an interactive form in the chat, one at a time, with your suggested answers as selectable options. Use this instead of writing a question in prose whenever you need a decision from the user: prose questions do not pause you, this tool does. Ask only what you cannot resolve with your own tools, keep every question independent of the others, and always offer suggestions when plausible answers exist. The result contains the user's answers, or tells you the questions were dismissed.`,
    inputSchema: buildAskQuestionInputSchema(limit),
    toModelOutput: ({ output }: { output: unknown }) => {
      const parsed = AskQuestionResultSchema.safeParse(output);
      return {
        type: "text" as const,
        value: parsed.success
          ? formatAskQuestionResult(parsed.data)
          : typeof output === "string"
            ? output
            : JSON.stringify(output ?? ""),
      };
    },
  });
}
