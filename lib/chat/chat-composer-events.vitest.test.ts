import { describe, expect, it } from "vitest";

import {
  INSERT_CHAT_SKILL_EVENT,
  OPEN_CHAT_SIDEBAR_EVENT,
  dispatchInsertChatSkill,
  getInsertChatSkillDetail,
  insertSkillIntoComposerInput,
} from "@/lib/chat/chat-composer-events";

describe("insertSkillIntoComposerInput", () => {
  it("inserts a skill token into an empty composer", () => {
    expect(insertSkillIntoComposerInput("", "create-app")).toBe("/create-app ");
  });

  it("appends a skill token to existing text", () => {
    expect(insertSkillIntoComposerInput("Build an app", "create-app")).toBe(
      "Build an app /create-app ",
    );
  });

  it("does not duplicate an existing skill token", () => {
    expect(insertSkillIntoComposerInput("/create-app ", "create-app")).toBe("/create-app ");
  });

  it("appends an optional message body after the skill token", () => {
    expect(
      insertSkillIntoComposerInput("", "create-app", "Build a dashboard from this notebook"),
    ).toBe("/create-app Build a dashboard from this notebook ");
  });
});

describe("dispatchInsertChatSkill", () => {
  it("opens chat and dispatches a typed insert-chat-skill event", () => {
    const events: Event[] = [];
    const listener = (event: Event) => {
      events.push(event);
    };

    window.addEventListener(OPEN_CHAT_SIDEBAR_EVENT, listener);
    window.addEventListener(INSERT_CHAT_SKILL_EVENT, listener);
    try {
      dispatchInsertChatSkill("create-app", "Build a dashboard");
    } finally {
      window.removeEventListener(OPEN_CHAT_SIDEBAR_EVENT, listener);
      window.removeEventListener(INSERT_CHAT_SKILL_EVENT, listener);
    }

    expect(events.map((event) => event.type)).toEqual([
      OPEN_CHAT_SIDEBAR_EVENT,
      INSERT_CHAT_SKILL_EVENT,
    ]);
    expect(getInsertChatSkillDetail(events[1]!)).toEqual({
      skillName: "create-app",
      message: "Build a dashboard",
    });
  });

  it("includes newChat when requested", () => {
    const events: Event[] = [];
    const listener = (event: Event) => {
      events.push(event);
    };

    window.addEventListener(INSERT_CHAT_SKILL_EVENT, listener);
    try {
      dispatchInsertChatSkill("orion-settings", undefined, { newChat: true });
    } finally {
      window.removeEventListener(INSERT_CHAT_SKILL_EVENT, listener);
    }

    expect(getInsertChatSkillDetail(events[0]!)).toEqual({
      skillName: "orion-settings",
      newChat: true,
    });
  });
});
