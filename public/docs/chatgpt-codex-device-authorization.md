# Enable device code authorization for Codex (ChatGPT)

Use this guide when connecting **ChatGPT Plus** or **ChatGPT Pro** in Orion and the consent screen shows a disabled **Continue** button, or red text asking you to turn on device code authorization in ChatGPT settings.

This is a **per-account** ChatGPT setting, not an application bug. The OAuth device flow requires it before authorization can complete.

## When you need this

- You complete login and email verification, but on the final consent screen **Continue** stays disabled.
- The screen shows an error similar to: *Enable device code authorization for Codex in ChatGPT Security Settings, then run `codex login --device-auth` again.*

## Steps

1. Open [chatgpt.com](https://chatgpt.com) and sign in with the same account you use for Plus/Pro.
2. Click your **profile** (avatar) in the corner.
3. Open **Settings**.
4. Go to **Security**, or **Data controls**, depending on your account type (OpenAI may label this section differently over time).
5. Turn **on** the option named **Device code authorization for Codex** (or equivalent wording).
6. Return to Orion and use **Connect ChatGPT Plus / Pro** again (or run `codex login --device-auth` if you use the CLI flow).

After the toggle is enabled, **Continue** on the consent screen should be available and the connection flow can finish.

## Notes

- UI labels and menu paths can change; if you do not see the exact toggle, search the Settings area for **Codex** or **device** authorization.
- You must use the ChatGPT account that has the subscription you intend to connect.

---

*Draft for a future documentation page. Last aligned with troubleshooting from April 2026.*
