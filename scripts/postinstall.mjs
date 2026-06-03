import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "dist", "cli", "cli", "ensure-native-modules.js");

if (!existsSync(script)) {
  process.exit(0);
}

const result = spawnSync(process.execPath, [script], {
  cwd: root,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
