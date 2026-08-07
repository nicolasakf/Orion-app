import type { ModelMessage } from "@ai-sdk/provider-utils";
import { NextResponse } from "next/server";

import { generateBufferedText } from "@/lib/agent/buffered-text-generation.server";
import { getModelGateway } from "@/lib/agent/model-gateway";
import { resolveProviderCredentialForModel } from "@/lib/credentials/provider-credential-store.server";
import {
  loadInterviewTranscript,
  loadPersonalContextForModel,
} from "@/lib/onboarding/personal-context.server";
import {
  containsHighConfidenceSecret,
  MAX_PERSONAL_CONTEXT_CHARS,
} from "@/lib/onboarding/personal-context";

const INTERVIEW_MODEL_ID = "gpt-5.6-terra";

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

Be concise and durable. Preserve useful facts from the current file, update them from the interview, preserve exact paths and service names, distinguish validated local folders from unverified locations, and never include credentials, passwords, tokens, private keys, or secret values. Access notes may say where or through whom access is obtained.`;

/** Generates an editable full-file draft without saving it. */
export async function POST(): Promise<Response> {
  const credential = await resolveProviderCredentialForModel(
    "openai",
    INTERVIEW_MODEL_ID,
  );
  if (!credential || credential.type !== "chatgpt_oauth") {
    return NextResponse.json(
      {
        message:
          "Connect ChatGPT in Settings → Providers before generating a personal context draft.",
        reconnectRequired: true,
      },
      { status: 400 },
    );
  }

  try {
    const [transcript, currentProfile] = await Promise.all([
      loadInterviewTranscript(),
      loadPersonalContextForModel(),
    ]);
    if (transcript.messages.length === 0 && !currentProfile.trim()) {
      return NextResponse.json(
        { message: "Answer at least one interview question before reviewing a profile." },
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
          "Interview transcript:",
          ...transcript.messages.map(
            (message) => `${message.role === "user" ? "User" : "Orion"}: ${message.content}`,
          ),
        ].join("\n\n"),
      },
    ];
    const gateway = getModelGateway();
    const prepared = gateway.processRequest({
      messages,
      modelId: INTERVIEW_MODEL_ID,
      providerId: "openai",
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
    const draft = result.text.trim().replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/, "");
    if (!draft || draft.length > MAX_PERSONAL_CONTEXT_CHARS) {
      throw new Error("The generated personal context was empty or too large.");
    }
    if (containsHighConfidenceSecret(draft)) {
      throw new Error("The generated personal context contained a possible credential.");
    }
    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Failed to generate personal context draft:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to generate a personal context draft.",
      },
      { status: 500 },
    );
  }
}
