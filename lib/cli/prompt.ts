import readline from "readline/promises";

export interface PromptOptions {
  assumeYes?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/** Returns whether interactive prompts can read from a TTY. */
export function isInteractivePromptAvailable(options: PromptOptions = {}): boolean {
  if (options.input) {
    return "isTTY" in options.input && options.input.isTTY === true;
  }
  return process.stdin.isTTY === true;
}

/** Creates a readline interface for CLI prompts. */
function createPromptInterface(options: PromptOptions = {}) {
  return readline.createInterface({
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
  });
}

/** Prompts for yes/no setup consent, honoring non-interactive and --yes modes. */
export async function confirmSetup(
  message: string,
  options: PromptOptions = {}
): Promise<boolean> {
  if (options.assumeYes) {
    return true;
  }
  if (!isInteractivePromptAvailable(options)) {
    return false;
  }

  const rl = createPromptInterface(options);
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

/** Prompts for yes/no with an affirmative default (Enter accepts). */
export async function confirmDefaultYes(
  message: string,
  options: PromptOptions = {}
): Promise<boolean> {
  if (options.assumeYes) {
    return true;
  }
  if (!isInteractivePromptAvailable(options)) {
    return true;
  }

  const rl = createPromptInterface(options);
  try {
    const answer = await rl.question(`${message} [Y/n] `);
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === "") {
      return true;
    }
    return trimmed === "y" || trimmed === "yes";
  } finally {
    rl.close();
  }
}

/** Prompts for a numeric selection within an inclusive range. */
export async function promptNumberSelection(
  message: string,
  min: number,
  max: number,
  defaultChoice: number,
  options: PromptOptions = {}
): Promise<number> {
  if (options.assumeYes) {
    return defaultChoice;
  }
  if (!isInteractivePromptAvailable(options)) {
    return defaultChoice;
  }

  const rl = createPromptInterface(options);
  try {
    while (true) {
      const answer = await rl.question(`${message} [${defaultChoice}]: `);
      const trimmed = answer.trim();
      if (trimmed === "") {
        return defaultChoice;
      }

      const choice = Number.parseInt(trimmed, 10);
      if (Number.isInteger(choice) && choice >= min && choice <= max) {
        return choice;
      }

      console.log(`Enter a number from ${min} to ${max}.`);
    }
  } finally {
    rl.close();
  }
}
