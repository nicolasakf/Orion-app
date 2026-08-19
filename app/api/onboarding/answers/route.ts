import { NextResponse } from "next/server";

import {
  loadOnboardingAnswers,
  saveOnboardingAnswers,
} from "@/lib/onboarding/personal-context.server";
import { OnboardingAnswersSchema } from "@/lib/onboarding/personal-context";

/** Returns the persisted answers to the three Business onboarding questions. */
export async function GET(): Promise<Response> {
  try {
    return NextResponse.json({ answers: await loadOnboardingAnswers() });
  } catch (error) {
    console.error("Failed to load the onboarding answers:", error);
    return NextResponse.json(
      { message: "Failed to load your saved answers." },
      { status: 500 },
    );
  }
}

/** Replaces the answers as the user works through the questions screen. */
export async function PUT(req: Request): Promise<Response> {
  const parsed = OnboardingAnswersSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Your answers are malformed or too long." },
      { status: 400 },
    );
  }

  try {
    await saveOnboardingAnswers(parsed.data);
    return NextResponse.json({ answers: parsed.data });
  } catch (error) {
    console.error("Failed to save the onboarding answers:", error);
    const message =
      error instanceof Error && error.message.includes("credential")
        ? error.message
        : "Failed to save your answers.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
