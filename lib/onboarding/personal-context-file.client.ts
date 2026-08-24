import { z } from "zod";

const PERSONAL_CONTEXT_FILE_API_PATH = "/api/onboarding/profile";

const PersonalContextFileResponseSchema = z.object({
  content: z.string(),
  exists: z.boolean(),
  updatedAt: z.string().optional(),
  truncated: z.boolean(),
  blockedForModel: z.boolean(),
});

const PersonalContextFileErrorResponseSchema = z.object({
  message: z.string().optional(),
});

/** Reads a useful message from a failed personal-context API response. */
function readErrorMessage(payload: unknown, fallback: string): string {
  const parsed = PersonalContextFileErrorResponseSchema.safeParse(payload);
  return parsed.success && parsed.data.message ? parsed.data.message : fallback;
}

/** Loads `ORION.md` from Orion's local personal-context API. */
export async function loadPersonalContextFileFromApi(): Promise<{
  content: string;
  exists: boolean;
}> {
  const response = await fetch(PERSONAL_CONTEXT_FILE_API_PATH, {
    method: "GET",
    cache: "no-store",
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, "Failed to load ORION.md."));
  }

  const parsed = PersonalContextFileResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("ORION.md response was invalid.");
  }

  return {
    content: parsed.data.content,
    exists: parsed.data.exists,
  };
}

/** Saves `ORION.md` through Orion's local personal-context API. */
export async function savePersonalContextFileToApi(content: string): Promise<void> {
  const response = await fetch(PERSONAL_CONTEXT_FILE_API_PATH, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, "Failed to save ORION.md."));
  }

  const parsed = PersonalContextFileResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("ORION.md save response was invalid.");
  }
}
