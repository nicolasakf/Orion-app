import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { AskQuestionCard } from "./ask-question-card";
import type { AskQuestionResult } from "@/lib/agent/ask-question";

/** Minimal well-formed tool input with one single-choice and one free-text question. */
const TWO_QUESTIONS = {
  questions: [
    {
      question: "Which dataset should I use?",
      context: "Both are in the workspace.",
      suggestions: ["sales_2024.csv", "sales_2025.csv"],
      allowMultiple: false,
      allowCustomAnswer: true,
      required: true,
    },
    {
      question: "Anything else I should know?",
      context: "",
      suggestions: [],
      allowMultiple: false,
      allowCustomAnswer: true,
      required: false,
    },
  ],
};

describe("AskQuestionCard", () => {
  it("shows a placeholder while the tool arguments are still streaming", () => {
    render(
      <AskQuestionCard
        toolCallId="call-1"
        input={{}}
        state="input-streaming"
        maxQuestions={5}
      />
    );

    expect(screen.getByText("Preparing questions…")).toBeInTheDocument();
  });

  it("collects a selected suggestion and a typed answer across steps", () => {
    const onSubmit = vi.fn<(toolCallId: string, result: AskQuestionResult) => void>();

    render(
      <AskQuestionCard
        toolCallId="call-1"
        input={TWO_QUESTIONS}
        state="input-available"
        maxQuestions={5}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByText("Which dataset should I use?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /sales_2025\.csv/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Anything else I should know?")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Type your answer"), {
      target: { value: "Exclude refunds" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send answers/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [toolCallId, result] = onSubmit.mock.calls[0];
    expect(toolCallId).toBe("call-1");
    expect(result.answers).toEqual([
      {
        question: "Which dataset should I use?",
        selected: ["sales_2025.csv"],
        custom: "",
        skipped: false,
      },
      {
        question: "Anything else I should know?",
        selected: [],
        custom: "Exclude refunds",
        skipped: false,
      },
    ]);
  });

  it("blocks navigation past a required question until it is answered", () => {
    const onSubmit = vi.fn();

    render(
      <AskQuestionCard
        toolCallId="call-1"
        input={TWO_QUESTIONS}
        state="input-available"
        maxQuestions={5}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Which dataset should I use?")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("records an explicit skip on an optional question", () => {
    const onSubmit = vi.fn<(toolCallId: string, result: AskQuestionResult) => void>();

    render(
      <AskQuestionCard
        toolCallId="call-1"
        input={{ questions: [TWO_QUESTIONS.questions[1]] }}
        state="input-available"
        maxQuestions={5}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: /Send answers/ }));

    expect(onSubmit.mock.calls[0][1].answers[0]).toEqual({
      question: "Anything else I should know?",
      selected: [],
      custom: "",
      skipped: true,
    });
  });

  it("keeps every checked option on a multi-select question", () => {
    const onSubmit = vi.fn<(toolCallId: string, result: AskQuestionResult) => void>();

    render(
      <AskQuestionCard
        toolCallId="call-1"
        input={{
          questions: [
            {
              question: "Which metrics matter?",
              context: "",
              suggestions: ["Revenue", "Churn", "ARPU"],
              allowMultiple: true,
              allowCustomAnswer: false,
              required: true,
            },
          ],
        }}
        state="input-available"
        maxQuestions={5}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Revenue/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /ARPU/ }));
    fireEvent.click(screen.getByRole("button", { name: /Send answers/ }));

    expect(onSubmit.mock.calls[0][1].answers[0].selected).toEqual(["Revenue", "ARPU"]);
  });

  it("drops questions past the configured per-call limit", () => {
    render(
      <AskQuestionCard
        toolCallId="call-1"
        input={TWO_QUESTIONS}
        state="input-available"
        maxQuestions={1}
      />
    );

    expect(screen.getByText("Which dataset should I use?")).toBeInTheDocument();
    expect(screen.queryByText("Anything else I should know?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send answers/ })).toBeInTheDocument();
  });

  it("renders submitted answers instead of the form once the tool has output", () => {
    render(
      <AskQuestionCard
        toolCallId="call-1"
        input={TWO_QUESTIONS}
        output={{
          answers: [
            {
              question: "Which dataset should I use?",
              selected: ["sales_2025.csv"],
              custom: "",
              skipped: false,
            },
            {
              question: "Anything else I should know?",
              selected: [],
              custom: "",
              skipped: true,
            },
          ],
        }}
        state="output-available"
        maxQuestions={5}
      />
    );

    expect(screen.getByText("1 of 2 answered.")).toBeInTheDocument();
    expect(screen.getByText("sales_2025.csv")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send answers/ })).not.toBeInTheDocument();
  });

  it("closes the form when the turn was stopped before the questions were answered", () => {
    render(
      <AskQuestionCard
        toolCallId="call-1"
        input={TWO_QUESTIONS}
        output={{ error: "cancelled_by_user" }}
        state="output-error"
        maxQuestions={5}
      />
    );

    expect(screen.getByText("Questions closed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send answers/ })).not.toBeInTheDocument();
  });

  it("offers a dismiss control that reports the tool call id", () => {
    const onDismiss = vi.fn();

    render(
      <AskQuestionCard
        toolCallId="call-7"
        input={TWO_QUESTIONS}
        state="input-available"
        maxQuestions={5}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss questions" }));
    expect(onDismiss).toHaveBeenCalledWith("call-7");
  });
});
