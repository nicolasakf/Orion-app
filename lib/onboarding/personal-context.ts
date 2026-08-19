import { z } from "zod";

/** Maximum UTF-8 size of the personal context injected into agent prompts. */
export const MAX_PERSONAL_CONTEXT_BYTES = 32 * 1024;

/** Conservative character bound used by browser controls before byte validation. */
export const MAX_PERSONAL_CONTEXT_CHARS = MAX_PERSONAL_CONTEXT_BYTES;

/** Maximum length of one Business onboarding answer. */
export const MAX_ONBOARDING_ANSWER_CHARS = 2_000;

export const PersonalContextUpdateSchema = z.object({
  content: z.string().max(MAX_PERSONAL_CONTEXT_CHARS),
});

/**
 * The three questions every Business user answers before picking their tools.
 * Each is optional: onboarding never blocks on a blank field.
 */
export const OnboardingAnswersSchema = z.object({
  version: z.literal(1),
  companyDescription: z.string().max(MAX_ONBOARDING_ANSWER_CHARS).default(""),
  roleDescription: z.string().max(MAX_ONBOARDING_ANSWER_CHARS).default(""),
  helpGoal: z.string().max(MAX_ONBOARDING_ANSWER_CHARS).default(""),
  /** Absent until the user has saved the questions screen at least once. */
  updatedAt: z.string().datetime().optional(),
});

export type OnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>;

/** Returns the blank answers a user who has not reached the questions screen has. */
export function createEmptyOnboardingAnswers(): OnboardingAnswers {
  return {
    version: 1,
    companyDescription: "",
    roleDescription: "",
    helpGoal: "",
  };
}

/** Returns the answers in catalog order, skipping the ones left blank. */
export function listAnsweredQuestions(
  answers: OnboardingAnswers,
): { label: string; answer: string }[] {
  return [
    { label: "What the user's company does", answer: answers.companyDescription },
    { label: "The kind of work the user does", answer: answers.roleDescription },
    { label: "What the user most wants Orion to help with", answer: answers.helpGoal },
  ].filter((entry) => entry.answer.trim().length > 0);
}

const HIGH_CONFIDENCE_SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{24,}=*\b/i,
];

/** Detects credential formats that should never be sent to or stored by the interview. */
export function containsHighConfidenceSecret(value: string): boolean {
  return HIGH_CONFIDENCE_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}
