import readline from "readline/promises";

export interface PromptOptions {
  assumeYes?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/** Prompts for yes/no setup consent, honoring non-interactive and --yes modes. */
export async function confirmSetup(
  message: string,
  options: PromptOptions = {}
): Promise<boolean> {
  if (options.assumeYes) {
    return true;
  }
  if (!process.stdin.isTTY) {
    return false;
  }

  const rl = readline.createInterface({
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
  });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}
