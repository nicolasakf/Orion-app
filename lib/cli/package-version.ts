import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

/** Locates the repo or package root `package.json` from a module directory. */
function resolvePackageJsonPath(fromDirectory: string): string {
  let directory = fromDirectory;
  for (let depth = 0; depth < 8; depth += 1) {
    const packageJsonPath = join(directory, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        name?: string;
      };
      if (packageJson.name === "orion-notebook") {
        return packageJsonPath;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }

  throw new Error("Could not find orion-notebook package.json.");
}

/** Reads the published package version from package.json. */
export function readPackageVersion(fromDirectory = __dirname): string {
  const packageJsonPath = resolvePackageJsonPath(fromDirectory);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    version?: string;
  };
  if (!packageJson.version) {
    throw new Error(`Missing version in ${packageJsonPath}.`);
  }
  return packageJson.version;
}
