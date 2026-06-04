
import { requestDeviceCode, DEVICE_VERIFICATION_URL } from "@/lib/credentials/chatgpt-oauth";

/**
 * POST /api/credentials/oauth/device/start
 *
 * Step 1 of the ChatGPT device authorization flow.
 * Requests a user code from OpenAI and returns it to the client for display.
 * The client shows the code and a link to the verification URL, then polls
 * /api/credentials/oauth/device/poll until the user approves.
 */
export async function POST() {
  try {
    const deviceAuth = await requestDeviceCode();

    return new Response(
      JSON.stringify({
        userCode: deviceAuth.user_code,
        deviceAuthId: deviceAuth.device_auth_id,
        verificationUrl: DEVICE_VERIFICATION_URL,
        interval: parseInt(deviceAuth.interval, 10) || 5,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start device authorization.";
    return new Response(
      JSON.stringify({ title: "Device Auth Failed", message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
