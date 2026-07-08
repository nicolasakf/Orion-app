import { afterEach, describe, expect, it } from "vitest";

import {
  INSERT_CHAT_MESSAGE_EVENT,
  INSERT_CHAT_SKILL_EVENT,
  OPEN_CHAT_SIDEBAR_EVENT,
  buildBusinessErrorDedupeKey,
  dispatchInsertChatMessage,
  dispatchInsertChatSkill,
  dispatchSubmitChatMessage,
  getInsertChatMessageDetail,
  getInsertChatSkillDetail,
  insertMessageIntoComposerInput,
  insertSkillIntoComposerInput,
  resetAutoFixDedupeKeysForTests,
  shouldDispatchAutoFix,
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

describe("insertMessageIntoComposerInput", () => {
  it("inserts a plain message into an empty composer", () => {
    expect(insertMessageIntoComposerInput("", "Fix this error in cell #2.")).toBe(
      "Fix this error in cell #2. ",
    );
  });

  it("appends a plain message to existing text", () => {
    expect(
      insertMessageIntoComposerInput(
        "Please inspect first.",
        "Fix this error in cell #2.",
      ),
    ).toBe("Please inspect first. Fix this error in cell #2. ");
  });

  it("does not duplicate an existing plain message", () => {
    expect(
      insertMessageIntoComposerInput(
        "Fix this error in cell #2. ",
        "Fix this error in cell #2.",
      ),
    ).toBe("Fix this error in cell #2. ");
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

describe("dispatchInsertChatMessage", () => {
  it("opens chat and dispatches a typed insert-chat-message event", () => {
    const events: Event[] = [];
    const listener = (event: Event) => {
      events.push(event);
    };

    window.addEventListener(OPEN_CHAT_SIDEBAR_EVENT, listener);
    window.addEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    try {
      dispatchInsertChatMessage("Fix this error in cell #2.");
    } finally {
      window.removeEventListener(OPEN_CHAT_SIDEBAR_EVENT, listener);
      window.removeEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    }

    expect(events.map((event) => event.type)).toEqual([
      OPEN_CHAT_SIDEBAR_EVENT,
      INSERT_CHAT_MESSAGE_EVENT,
    ]);
    expect(getInsertChatMessageDetail(events[1]!)).toEqual({
      message: "Fix this error in cell #2.",
    });
  });
});

describe("dispatchSubmitChatMessage", () => {
  afterEach(() => {
    resetAutoFixDedupeKeysForTests();
  });

  it("dispatches submit=true with optional dedupe key", () => {
    const events: Event[] = [];
    const listener = (event: Event) => {
      events.push(event);
    };

    window.addEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    try {
      dispatchSubmitChatMessage("Fix this error in cell #2.", {
        dedupeKey: buildBusinessErrorDedupeKey(2, "ValueError", "bad"),
      });
    } finally {
      window.removeEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    }

    expect(getInsertChatMessageDetail(events[0]!)).toEqual({
      message: "Fix this error in cell #2.",
      submit: true,
      dedupeKey: "business-error:2:ValueError:bad",
    });
  });

  it("dedupes repeated auto-fix dispatches", () => {
    const dedupeKey = buildBusinessErrorDedupeKey(2, "ValueError", "bad");
    expect(shouldDispatchAutoFix(dedupeKey)).toBe(true);
    expect(shouldDispatchAutoFix(dedupeKey)).toBe(false);

    const events: Event[] = [];
    const listener = (event: Event) => {
      events.push(event);
    };

    window.addEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    try {
      dispatchSubmitChatMessage("first");
      dispatchSubmitChatMessage("second", { dedupeKey });
    } finally {
      window.removeEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    }

    expect(events).toHaveLength(1);
  });
});
