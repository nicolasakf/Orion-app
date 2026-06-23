import { NextResponse } from "next/server";
import { z } from "zod";

import {
  clearProviderCredentials,
  loadProviderCredentialSummaries,
  migrateLegacyProviderCredentials,
  removeProviderCredential,
  saveProviderCredential,
  StoredProviderCredentialSchema,
} from "@/lib/credentials/provider-credential-store.server";

const SaveOperationSchema = z.object({
  operation: z.literal("save"),
  provider: z.string().min(1),
  credential: StoredProviderCredentialSchema,
});

const RemoveOperationSchema = z.object({
  operation: z.literal("remove"),
  provider: z.string().min(1),
});

const MigrateLegacyOperationSchema = z.object({
  operation: z.literal("migrate_legacy"),
  credentials: z.record(z.unknown()),
});

const CredentialOperationSchema = z.discriminatedUnion("operation", [
  SaveOperationSchema,
  RemoveOperationSchema,
  MigrateLegacyOperationSchema,
  z.object({ operation: z.literal("clear") }),
]);

/** Lists local provider credentials as client-safe summaries. */
export async function GET(): Promise<Response> {
  try {
    return NextResponse.json({ credentials: await loadProviderCredentialSummaries() });
  } catch (error) {
    console.error("Failed to load provider credential summaries:", error);
    return NextResponse.json(
      { message: "Failed to load provider credentials." },
      { status: 500 }
    );
  }
}

/** Mutates the local provider credential store without returning secrets. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: "Request body is malformed." },
      { status: 400 }
    );
  }

  const parsed = CredentialOperationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Credential operation is invalid.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const operation = parsed.data;
    if (operation.operation === "save") {
      const summary = await saveProviderCredential(
        operation.provider,
        operation.credential
      );
      return NextResponse.json({ credential: summary });
    }

    if (operation.operation === "remove") {
      await removeProviderCredential(operation.provider);
      return new Response(null, { status: 204 });
    }

    if (operation.operation === "clear") {
      await clearProviderCredentials();
      return new Response(null, { status: 204 });
    }

    const summaries = await migrateLegacyProviderCredentials(operation.credentials);
    return NextResponse.json({ credentials: summaries });
  } catch (error) {
    console.error("Failed to update provider credentials:", error);
    return NextResponse.json(
      { message: "Failed to update provider credentials." },
      { status: 500 }
    );
  }
}
