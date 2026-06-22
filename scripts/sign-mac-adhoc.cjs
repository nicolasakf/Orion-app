const { execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");

const execFileAsync = promisify(execFile);

/** Ad-hoc-signs macOS app bundles when free unsigned distribution is requested. */
module.exports = async function signMacAdHoc(context) {
  if (
    context.electronPlatformName !== "darwin" ||
    process.env.ORION_ADHOC_MAC_SIGNING !== "1"
  ) {
    return;
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  await execFileAsync("codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    "--timestamp=none",
    appPath,
  ]);
  await execFileAsync("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    appPath,
  ]);
  console.log(`Ad-hoc-signed and verified ${appPath}.`);
};
