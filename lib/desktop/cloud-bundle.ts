import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

/** Parses simple KEY=value lines from an env file. */
function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
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
function collectJavaScriptFiles(directory: string, files: string[] = []): string[] {
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

/** Returns whether Orion Cloud public config was embedded in the packaged Next client bundle. */
export function isOrionCloudConfiguredInAppBundle(appDirectory: string): boolean {
  const envPath = join(appDirectory, ".env");
  if (!existsSync(envPath)) {
    return false;
  }

  const vars = parseEnvFile(readFileSync(envPath, "utf8"));
  const supabaseUrl = vars.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const apiBaseUrl = vars.NEXT_PUBLIC_ORION_API_BASE_URL?.trim()?.replace(/\/+$/, "");
  const publishableKey =
    vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || vars.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !apiBaseUrl || !publishableKey) {
    return false;
  }

  const staticChunksDir = join(appDirectory, ".next", "static", "chunks");
  const files = collectJavaScriptFiles(staticChunksDir);
  if (files.length === 0) {
    return false;
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

  return foundSupabase && foundApi;
}
