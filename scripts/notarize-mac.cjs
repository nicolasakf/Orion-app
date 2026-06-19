const path = require("path");
const { existsSync, writeFileSync } = require("fs");
const { tmpdir } = require("os");
const { notarize } = require("@electron/notarize");

/** Resolves App Store Connect API key input from either a file path or secret contents. */
function resolveAppleApiKey() {
  const value = process.env.APPLE_API_KEY;
  if (!value) {
    return null;
  }
  if (existsSync(value)) {
    return value;
  }

  const decoded = value.includes("BEGIN PRIVATE KEY")
    ? value
    : Buffer.from(value, "base64").toString("utf8");
  if (!decoded.includes("BEGIN PRIVATE KEY")) {
    throw new Error("APPLE_API_KEY must be a .p8 file path, .p8 private key contents, or base64-encoded .p8 contents.");
  }

  const keyPath = path.join(tmpdir(), `AuthKey_${process.env.APPLE_API_KEY_ID}.p8`);
  writeFileSync(keyPath, decoded, { mode: 0o600 });
  return keyPath;
}

/** Notarizes signed macOS release builds when Apple API credentials are available. */
module.exports = async function notarizeMac(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const required = ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER", "APPLE_TEAM_ID"];
  const missing = required.filter((key) => !process.env[key]);
  const mustNotarize = process.env.ORION_REQUIRE_MAC_NOTARIZATION === "1";
  if (missing.length > 0) {
    const message = `Skipping macOS notarization; missing ${missing.join(", ")}.`;
    if (mustNotarize) {
      throw new Error(message);
    }
    console.warn(message);
    return;
  }

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const appleApiKey = resolveAppleApiKey();
  await notarize({
    appBundleId: context.packager.appInfo.appId,
    appPath,
    appleApiKey,
    appleApiKeyId: process.env.APPLE_API_KEY_ID,
    appleApiIssuer: process.env.APPLE_API_ISSUER,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
