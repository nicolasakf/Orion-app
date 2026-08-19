import type { ModelMessage } from "@ai-sdk/provider-utils";
import { NextResponse } from "next/server";

import { generateBufferedText } from "@/lib/agent/buffered-text-generation.server";
import { getModelGateway } from "@/lib/agent/model-gateway";
import { resolveOnboardingProfileModel } from "@/lib/onboarding/profile-model.server";
import {
  loadBusinessStackSelection,
  loadOnboardingAnswers,
  loadPersonalContextForModel,
  savePersonalContext,
} from "@/lib/onboarding/personal-context.server";
import {
  BUSINESS_STACK_HEADING,
  BUSINESS_TOOL_CONNECTION_PLAYBOOK,
  CONNECTION_PLAYBOOK_HEADING,
  buildBusinessStackInterviewSummary,
  buildBusinessStackMemorySection,
} from "@/lib/onboarding/business-stack-memory";
import {
  containsHighConfidenceSecret,
  listAnsweredQuestions,
  MAX_PERSONAL_CONTEXT_CHARS,
} from "@/lib/onboarding/personal-context";

const PROFILE_SYSTEM_PROMPT = `Create the complete replacement content for the user's ORION.md personal context file. Return Markdown only, without a code fence or commentary.

Use exactly these headings, omitting only empty bullet points rather than inventing facts:
# Orion User Context
## Work context
## Goals and recurring tasks
## Data sources and where to find them
## Access notes (non-secret)
## Business terms and metrics
## Preferred outputs and working style
## Suggested Orion use cases
## Open questions

Be concise and durable. Preserve useful facts from the current file, update them from the user's answers, preserve exact paths and service names when the user mentions them, and never include credentials, passwords, tokens, private keys, or secret values. Access notes may say where or through whom access is obtained.

Orion appends the user's tool list and the standing connection procedure to your output automatically, under "${BUSINESS_STACK_HEADING}" and "${CONNECTION_PLAYBOOK_HEADING}". Do not write either section, do not enumerate the tool catalog, and do not restate connection rules. Under "Data sources and where to find them", describe only what the user's own answers added on top of the picked tools: which system holds which business fact, and which one matters most.

The user answered three short questions rather than a conversation, so expect terse input. Do not pad thin answers into confident detail — leave a heading sparse, or note the gap under "Open questions", instead of inventing specifics.`;

/**
 * Writes `ORION.md` from the onboarding answers and the picked tools.
 *
 * The narrative half is generated; the tool list and connection playbook are
 * appended verbatim. Unlike the review flow it replaces, this saves the file
 * directly — onboarding no longer asks the user to approve the draft.
 */
export async function POST(): Promise<Response> {
  // Provider-agnostic on purpose: onboarding runs for every experience mode,
  // and those users arrive with whichever provider they connected.
  const profileModel = await resolveOnboardingProfileModel();
  if (!profileModel) {
    return NextResponse.json(
      {
        message:
          "Connect an inference provider in Settings → Providers before generating your Orion memory.",
        reconnectRequired: true,
      },
      { status: 400 },
    );
  }
  const { credential } = profileModel;

  try {
    const [answers, currentProfile, stackSelection] = await Promise.all([
      loadOnboardingAnswers(),
      loadPersonalContextForModel(),
      loadBusinessStackSelection(),
    ]);
    const stackSection = buildBusinessStackMemorySection(stackSelection);
    const answered = listAnsweredQuestions(answers);
    if (answered.length === 0 && !currentProfile.trim() && !stackSection) {
      return NextResponse.json(
        {
          message: "Answer at least one question or pick a tool before continuing.",
        },
        { status: 400 },
      );
    }

    const messages: ModelMessage[] = [
      {
        role: "user",
        content: [
          currentProfile.trim()
            ? `Current ORION.md:\n${currentProfile}`
            : "Current ORION.md: (none)",
          buildBusinessStackInterviewSummary(stackSelection) ||
            "The user did not pick any tools during onboarding.",
          ...answered.map((entry) => `${entry.label}:\n${entry.answer}`),
        ].join("\n\n"),
      },
    ];
    const gateway = getModelGateway();
    const prepared = gateway.processRequest({
      messages,
      modelId: profileModel.modelId,
      providerId: profileModel.providerId,
      agentSystemPrompt: PROFILE_SYSTEM_PROMPT,
      requestId: crypto.randomUUID(),
      credentials: credential,
    });
    const result = await generateBufferedText(
      {
        model: prepared.model,
        messages: prepared.messages,
        providerOptions: prepared.providerOptions,
        maxOutputTokens: 1_500,
      },
      credential.type,
    );
    const narrative = result.text
      .trim()
      .replace(/^```(?:markdown)?\s*/i, "")
      .replace(/\s*```$/, "");
    if (!narrative) {
      throw new Error("The generated personal context was empty.");
    }
    if (containsHighConfidenceSecret(narrative)) {
      throw new Error("The generated personal context contained a possible credential.");
    }

    // The tool list and connection rules are appended deterministically: they
    // carry exact product names and documentation URLs the model must not
    // paraphrase, and they have to survive every regeneration unchanged.
    const content = [narrative, stackSection, BUSINESS_TOOL_CONNECTION_PLAYBOOK]
      .filter(Boolean)
      .join("\n\n");
    if (content.length > MAX_PERSONAL_CONTEXT_CHARS) {
      throw new Error("The generated personal context was too large.");
    }
    await savePersonalContext(content);
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("Failed to generate the personal context:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to generate your Orion memory.",
      },
      { status: 500 },
    );
  }
}
