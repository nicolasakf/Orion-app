const path = require("path");
const { existsSync, writeFileSync } = require("fs");
const { tmpdir } = require("os");
const { notarize } = require("@electron/notarize");

/** Resolves App Store Connect API key input from either a file path or secret contents. */
function resolveAppleApiKey(value, keyId) {
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

  const keyPath = path.join(tmpdir(), `AuthKey_${keyId}.p8`);
  writeFileSync(keyPath, decoded, { mode: 0o600 });
  return keyPath;
}

/** Notarizes signed macOS release builds when Apple API credentials are available. */
module.exports = async function notarizeMac(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  // Electron Builder also recognizes APPLE_* variables and attempts its own
  // notarization before this hook can decode a base64 GitHub secret.
  const appleApiKey = process.env.ORION_APPLE_API_KEY ?? process.env.APPLE_API_KEY;
  const appleApiKeyId = process.env.ORION_APPLE_API_KEY_ID ?? process.env.APPLE_API_KEY_ID;
  const appleApiIssuer = process.env.ORION_APPLE_API_ISSUER ?? process.env.APPLE_API_ISSUER;
  const credentials = {
    ORION_APPLE_API_KEY: appleApiKey,
    ORION_APPLE_API_KEY_ID: appleApiKeyId,
    ORION_APPLE_API_ISSUER: appleApiIssuer,
  };
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);
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
  const resolvedAppleApiKey = resolveAppleApiKey(appleApiKey, appleApiKeyId);
  await notarize({
    appBundleId: context.packager.appInfo.appId,
    appPath,
    appleApiKey: resolvedAppleApiKey,
    appleApiKeyId,
    appleApiIssuer,
  });
};
