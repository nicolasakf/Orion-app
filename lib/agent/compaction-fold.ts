/** Result produced by one compaction-model invocation. */
export interface CompactionFoldStep {
  summary: string;
  tokensUsed: number;
}

interface FoldCompactionOptions<T> {
  items: T[];
  initialSummary?: string;
  fits: (items: T[], summary: string | undefined) => Promise<boolean>;
  summarize: (items: T[], summary: string | undefined) => Promise<CompactionFoldStep>;
  isContextOverflow: (error: unknown) => boolean;
  splitItem: (item: T) => [T, T] | null;
}

/**
 * Folds ordered input into a running summary using measured, budget-sized chunks.
 * Actual provider overflows are handled by bisecting the failing input; the same
 * failing chunk is never submitted unchanged.
 */
export async function foldCompactionChunks<T>(
  options: FoldCompactionOptions<T>
): Promise<CompactionFoldStep> {
  let summary = options.initialSummary;
  let tokensUsed = 0;

  /** Summarizes one measured chunk, recursively bisecting provider overflows. */
  const foldMeasuredChunk = async (chunk: T[]): Promise<void> => {
    try {
      const result = await options.summarize(chunk, summary);
      summary = result.summary;
      tokensUsed += result.tokensUsed;
    } catch (error) {
      if (!options.isContextOverflow(error)) throw error;

      if (chunk.length > 1) {
        const midpoint = Math.ceil(chunk.length / 2);
        await foldMeasuredChunk(chunk.slice(0, midpoint));
        await foldMeasuredChunk(chunk.slice(midpoint));
        return;
      }

      const split = options.splitItem(chunk[0]);
      if (!split) throw error;
      await foldMeasuredChunk([split[0]]);
      await foldMeasuredChunk([split[1]]);
    }
  };

  const pending = [...options.items];
  while (pending.length > 0) {
    let fittingCount = 0;
    for (let count = 1; count <= pending.length; count += 1) {
      if (!(await options.fits(pending.slice(0, count), summary))) break;
      fittingCount = count;
    }

    if (fittingCount === 0) {
      const split = options.splitItem(pending[0]);
      if (!split) {
        throw new Error("A compaction input item cannot fit within the selected model context.");
      }
      pending.splice(0, 1, split[0], split[1]);
      continue;
    }

    const chunk = pending.splice(0, fittingCount);
    await foldMeasuredChunk(chunk);
  }

  if (!summary?.trim()) {
    throw new Error("The compaction model returned an empty summary.");
  }
  return { summary: summary.trim(), tokensUsed };
}
