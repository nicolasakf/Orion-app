import { config as loadDotenv } from "dotenv";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const root = process.cwd();

/** Parses simple KEY=value lines from an env file. */
function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    vars[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return vars;
}

/** Collects JavaScript files under a directory tree. */
function collectJavaScriptFiles(directory, files = []) {
  if (!existsSync(directory)) {
    return files;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectJavaScriptFiles(path, files);
    } else if (entry.name.endsWith(".js")) {
      files.push(path);
    }
  }
  return files;
}

/** Returns expected Orion Cloud markers from env files or process env. */
function resolveExpectedMarkers() {
  loadDotenv({ path: join(root, ".env") });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const apiBaseUrl = process.env.NEXT_PUBLIC_ORION_API_BASE_URL?.trim()?.replace(/\/+$/, "");
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return { supabaseUrl, apiBaseUrl, publishableKey };
}

/** Verifies Orion Cloud public config was embedded into Next client bundles. */
function main() {
  const bundleArg = process.argv.find((arg) => arg.startsWith("--bundle="))?.slice("--bundle=".length);
  const bundleRoot = bundleArg ? join(root, bundleArg) : join(root, ".next");
  const staticChunksDir = bundleRoot.endsWith(".next")
    ? join(bundleRoot, "static", "chunks")
    : join(bundleRoot, ".next", "static", "chunks");

  const { supabaseUrl, apiBaseUrl, publishableKey } = resolveExpectedMarkers();
  if (!supabaseUrl || !apiBaseUrl || !publishableKey) {
    throw new Error(
      "Orion Cloud env vars are missing. Run scripts/ensure-build-env.mjs before next build."
    );
  }

  const files = collectJavaScriptFiles(staticChunksDir);
  if (files.length === 0) {
    throw new Error(`No client bundles found under ${staticChunksDir}.`);
  }

  let foundSupabase = false;
  let foundApi = false;
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    if (content.includes(supabaseUrl)) {
      foundSupabase = true;
    }
    if (content.includes(apiBaseUrl)) {
      foundApi = true;
    }
  }

  if (!foundSupabase || !foundApi) {
    throw new Error(
      "Orion Cloud URLs were not embedded in the Next client bundle. " +
        "Ensure .env exists with NEXT_PUBLIC_ORION_API_BASE_URL and Supabase vars before next build."
    );
  }

  console.log(`Orion Cloud config verified in client bundles under ${staticChunksDir}.`);
}

main();
