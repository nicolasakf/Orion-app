import { z } from "zod";

/** Maximum UTF-8 size of the personal context injected into agent prompts. */
export const MAX_PERSONAL_CONTEXT_BYTES = 32 * 1024;

/** Conservative character bound used by browser controls before byte validation. */
export const MAX_PERSONAL_CONTEXT_CHARS = MAX_PERSONAL_CONTEXT_BYTES;

/** Maximum length of one interview message. */
export const MAX_INTERVIEW_MESSAGE_CHARS = 4_000;

/** Maximum number of persisted interview messages. */
export const MAX_INTERVIEW_MESSAGES = 200;

export const PersonalContextUpdateSchema = z.object({
  content: z.string().max(MAX_PERSONAL_CONTEXT_CHARS),
});

export const InterviewMessageSchema = z.object({
  id: z.string().min(1).max(200),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_INTERVIEW_MESSAGE_CHARS),
  createdAt: z.string().datetime(),
});

export const InterviewTranscriptSchema = z.object({
  version: z.literal(1),
  messages: z.array(InterviewMessageSchema).max(MAX_INTERVIEW_MESSAGES),
  updatedAt: z.string().datetime(),
});

export const InterviewChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        role: z.enum(["user", "assistant"]),
        parts: z.array(
          z.union([
            z.object({
              type: z.literal("text"),
              text: z.string().max(MAX_INTERVIEW_MESSAGE_CHARS),
            }),
            z.object({ type: z.literal("step-start") }),
            z.object({
              type: z.literal("reasoning"),
              text: z.string().max(MAX_INTERVIEW_MESSAGE_CHARS),
            }),
          ]),
        ),
      }),
    )
    .min(1)
    .max(MAX_INTERVIEW_MESSAGES),
});

export type InterviewMessage = z.infer<typeof InterviewMessageSchema>;
export type InterviewTranscript = z.infer<typeof InterviewTranscriptSchema>;

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
