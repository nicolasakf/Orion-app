import { chmod, readFile, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";

import {
  ensureOrionDataDirectory,
  getBusinessStackFilePath,
  getLegacyInterviewTranscriptFilePath,
  getOnboardingAnswersFilePath,
  getPersonalContextFilePath,
} from "@/lib/local/orion-paths.server";
import {
  BusinessStackSelectionSchema,
  createEmptyBusinessStackSelection,
  type BusinessStackSelection,
} from "@/lib/onboarding/business-tools";
import {
  containsHighConfidenceSecret,
  createEmptyOnboardingAnswers,
  MAX_PERSONAL_CONTEXT_BYTES,
  OnboardingAnswersSchema,
  type OnboardingAnswers,
} from "@/lib/onboarding/personal-context";

let writeChain: Promise<unknown> = Promise.resolve();

/** Returns the longest prefix whose UTF-8 representation fits within `maxBytes`. */
function truncateToUtf8Bytes(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, middle), "utf8") <= maxBytes) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return value.slice(0, low);
}

/** Atomically writes a private file inside the Orion data directory. */
async function writePrivateFile(filePath: string, content: string): Promise<void> {
  const directory = await ensureOrionDataDirectory();
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  const operation = writeChain
    .catch(() => undefined)
    .then(async () => {
      try {
        await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
        await rename(tempPath, filePath);
        await chmod(filePath, 0o600).catch(() => undefined);
      } catch (error) {
        await rm(tempPath, { force: true }).catch(() => undefined);
        throw error;
      }
    });
  writeChain = operation;
  await operation;
}

/** Loads the personal context file without creating it when absent. */
export async function loadPersonalContext(): Promise<{
  content: string;
  exists: boolean;
  updatedAt?: string;
  truncated: boolean;
}> {
  const filePath = getPersonalContextFilePath();
  try {
    const [raw, metadata] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
    const truncated = Buffer.byteLength(raw, "utf8") > MAX_PERSONAL_CONTEXT_BYTES;
    return {
      content: truncateToUtf8Bytes(raw, MAX_PERSONAL_CONTEXT_BYTES),
      exists: true,
      updatedAt: metadata.mtime.toISOString(),
      truncated,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { content: "", exists: false, truncated: false };
    }
    throw error;
  }
}

/** Loads personal context for model submission, omitting manually inserted credentials. */
export async function loadPersonalContextForModel(): Promise<string> {
  const result = await loadPersonalContext();
  return containsHighConfidenceSecret(result.content) ? "" : result.content;
}

/** Validates and atomically replaces `~/.orion/ORION.md`. */
export async function savePersonalContext(content: string): Promise<void> {
  if (Buffer.byteLength(content, "utf8") > MAX_PERSONAL_CONTEXT_BYTES) {
    throw new Error(`Personal context cannot exceed ${MAX_PERSONAL_CONTEXT_BYTES} UTF-8 bytes.`);
  }
  if (containsHighConfidenceSecret(content)) {
    throw new Error("Personal context appears to contain a credential or private key.");
  }
  const normalized = content.trim();
  await writePrivateFile(
    getPersonalContextFilePath(),
    normalized ? `${normalized}\n` : "",
  );
}

/** Deletes the personal context without touching the interview transcript. */
export async function deletePersonalContext(): Promise<void> {
  await rm(getPersonalContextFilePath(), { force: true });
}

/** Loads the saved Business onboarding answers, or blank ones. */
export async function loadOnboardingAnswers(): Promise<OnboardingAnswers> {
  try {
    const raw = await readFile(getOnboardingAnswersFilePath(), "utf8");
    return OnboardingAnswersSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyOnboardingAnswers();
    }
    throw error;
  }
}

/** Atomically saves validated Business onboarding answers. */
export async function saveOnboardingAnswers(
  answers: OnboardingAnswers,
): Promise<void> {
  const parsed = OnboardingAnswersSchema.parse(answers);
  const combined = [
    parsed.companyDescription,
    parsed.roleDescription,
    parsed.helpGoal,
  ].join("\n");
  if (containsHighConfidenceSecret(combined)) {
    throw new Error("Your answers appear to contain a credential or private key.");
  }
  await writePrivateFile(
    getOnboardingAnswersFilePath(),
    `${JSON.stringify(parsed, null, 2)}\n`,
  );
  // The chat interview these answers replaced left a transcript of the user's
  // own words behind. Nothing reads it any more, so drop it as we pass by.
  await rm(getLegacyInterviewTranscriptFilePath(), { force: true }).catch(() => {});
}

/** Loads the Business onboarding stack answers, or an empty selection. */
export async function loadBusinessStackSelection(): Promise<BusinessStackSelection> {
  try {
    const raw = await readFile(getBusinessStackFilePath(), "utf8");
    return BusinessStackSelectionSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyBusinessStackSelection();
    }
    throw error;
  }
}

/** Atomically saves validated Business onboarding stack answers. */
export async function saveBusinessStackSelection(
  selection: BusinessStackSelection,
): Promise<void> {
  const parsed = BusinessStackSelectionSchema.parse(selection);
  await writePrivateFile(
    getBusinessStackFilePath(),
    `${JSON.stringify(parsed, null, 2)}\n`,
  );
}

/** Deletes only the stored stack answers. */
export async function clearBusinessStackSelection(): Promise<void> {
  await rm(getBusinessStackFilePath(), { force: true });
}
