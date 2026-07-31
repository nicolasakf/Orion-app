import { APICallError } from "@ai-sdk/provider";
import { z } from "zod";

import { generateBufferedText } from "@/lib/agent/buffered-text-generation.server";
import { getModelGateway } from "@/lib/agent/model-gateway";
import { sanitizeTitleGenerationProviderOptions } from "@/lib/agent/non-streaming-provider-options";
import { resolveProviderCredentialForModel } from "@/lib/credentials/provider-credential-store.server";
import { buildChatApiErrorPayload } from "@/lib/chat/chat-api-errors";

const TitleGenerationModelValidationRequestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

const ProviderErrorResponseSchema = z.object({
  detail: z.string().optional(),
  error: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
});

const titleGenerationValidationMessages = [
  {
    role: "user" as const,
    content:
      "Create a three-word title for a chat about monthly sales. Return only the title.",
  },
];

/** Extracts a provider's specific error message when the AI SDK exposes one. */
function getValidationErrorMessage(error: unknown, provider: string): string {
  if (
    APICallError.isInstance(error) &&
    typeof error.responseBody === "string"
  ) {
    try {
      const parsed = ProviderErrorResponseSchema.safeParse(
        JSON.parse(error.responseBody),
      );
      if (parsed.success) {
        return (
          parsed.data.detail ??
          parsed.data.error?.message ??
          buildChatApiErrorPayload(error, provider).message
        );
      }
    } catch {
      // Fall back to Orion's normal provider-error formatting below.
    }
  }

  return buildChatApiErrorPayload(error, provider).message;
}

/** Verifies that the selected provider credential can produce a short chat title. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { valid: false, message: "Request body is malformed." },
      { status: 400 },
    );
  }

  const parsed = TitleGenerationModelValidationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        valid: false,
        message: parsed.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400 },
    );
  }

  const { provider, model: modelId } = parsed.data;
  try {
    const credential = await resolveProviderCredentialForModel(provider, modelId);
    if (!credential) {
      return Response.json({
        valid: false,
        message:
          "Add a credential for this model's provider in Settings -> Providers first.",
      });
    }

    const gateway = getModelGateway();
    const request = gateway.processRequest({
      messages: titleGenerationValidationMessages,
      modelId,
      providerId: provider,
      credentials: credential,
    });
    await generateBufferedText(
      {
        model: request.model,
        messages: request.messages,
        providerOptions: sanitizeTitleGenerationProviderOptions(
          request.providerOptions,
        ),
        maxOutputTokens: 48,
      },
      credential.type,
    );

    return Response.json({ valid: true });
  } catch (error) {
    return Response.json({
      valid: false,
      message: getValidationErrorMessage(error, provider),
    });
  }
}
