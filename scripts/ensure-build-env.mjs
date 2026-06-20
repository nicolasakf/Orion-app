import { copyFileSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();
const envPath = join(root, ".env");
const examplePath = join(root, ".env.example");

/** Returns true when Orion Cloud public build env vars are already available. */
function hasOrionCloudBuildEnv() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_ORION_API_BASE_URL?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return Boolean(apiBaseUrl && supabaseUrl && supabaseKey);
}

/** Ensures Orion Cloud env vars exist before `next build` in CI and fresh checkouts. */
function main() {
  if (hasOrionCloudBuildEnv()) {
    console.log("Orion Cloud build env vars already set in the environment.");
    return;
  }

  if (existsSync(envPath)) {
    console.log(".env already exists; Orion Cloud vars will load from .env during next build.");
    return;
  }

  if (!existsSync(examplePath)) {
    throw new Error(`.env.example was not found at ${examplePath}.`);
  }

  copyFileSync(examplePath, envPath);
  console.log("Created .env from .env.example so Orion Cloud is configured in release builds.");
}

main();
