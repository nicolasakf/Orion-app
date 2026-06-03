#!/usr/bin/env node
import { existsSync } from "fs";
import { join } from "path";

import { resolveBundledAppDirectory } from "../lib/cli/app-server";
import { ensureBundledNativeModules } from "../lib/cli/ensure-native-modules";

/** Resolves the Orion app bundle directory for npm installs and pip-downloaded bundles. */
function resolveAppDirectory(): string {
  if (process.env.ORION_APP_DIR) {
    return process.env.ORION_APP_DIR;
  }

  const cwd = process.cwd();
  if (existsSync(join(cwd, "server.js"))) {
    return cwd;
  }

  return resolveBundledAppDirectory();
}

ensureBundledNativeModules(resolveAppDirectory());
