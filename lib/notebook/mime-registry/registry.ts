import type { NotebookOutputType } from "@/lib/types";
import { getOutputMimeBundle } from "./synthetic-mimes";
import type {
  MimeAgentResult,
  MimeClipboardPayload,
  MimeOutputKind,
  MimeRegistry,
  MimeRendererFactory,
  ResolvedMimeRenderer,
} from "./types";

/**
 * In-memory MIME registry used to select and query renderer factories.
 */
export class NotebookMimeRegistry implements MimeRegistry {
  private factories: MimeRendererFactory[] = [];

  addFactory(factory: MimeRendererFactory): void {
    this.factories.push(factory);
    this.factories.sort((a, b) => a.rank - b.rank);
  }

  preferredMimeType(output: NotebookOutputType, trusted = true): string | null {
    const resolved = this.resolve(output, trusted);
    return resolved?.mimeType ?? null;
  }

  resolve(output: NotebookOutputType, trusted = true): ResolvedMimeRenderer | null {
    const bundle = getOutputMimeBundle(output);
    for (const factory of this.factories) {
      if (!trusted && !factory.safe) {
        continue;
      }
      if (
        factory.outputTypes &&
        factory.outputTypes.length > 0 &&
        !factory.outputTypes.includes(output.output_type)
      ) {
        continue;
      }
      for (const mimeType of factory.mimeTypes) {
        if (bundle[mimeType] !== undefined) {
          return {
            mimeType,
            value: bundle[mimeType],
            factory,
          };
        }
      }
    }
    return null;
  }

  resolveForMimeType(
    output: NotebookOutputType,
    mimeType: string,
    trusted = true
  ): ResolvedMimeRenderer | null {
    const bundle = getOutputMimeBundle(output);
    if (bundle[mimeType] === undefined) {
      return null;
    }
    const factory = this.getFactoryForMime(mimeType);
    if (!factory) {
      return null;
    }
    if (factory.outputTypes && factory.outputTypes.length > 0) {
      if (!factory.outputTypes.includes(output.output_type)) {
        return null;
      }
    }
    if (!trusted && !factory.safe) {
      return null;
    }
    return {
      mimeType,
      value: bundle[mimeType],
      factory,
    };
  }

  getFactoryForMime(mimeType: string): MimeRendererFactory | null {
    return this.factories.find((factory) => factory.mimeTypes.includes(mimeType)) ?? null;
  }

  classify(output: NotebookOutputType, trusted = true): MimeOutputKind {
    const resolved = this.resolve(output, trusted);
    if (!resolved) {
      return "text";
    }
    if (!resolved.factory.classify) {
      return resolved.factory.kind;
    }
    return (
      resolved.factory.classify({
        output,
        mimeType: resolved.mimeType,
        value: resolved.value,
        trusted,
      }) ?? resolved.factory.kind
    );
  }

  summarize(output: NotebookOutputType, trusted = true): string | null {
    const resolved = this.resolve(output, trusted);
    if (!resolved) {
      return null;
    }
    if (!resolved.factory.summarize) {
      return null;
    }
    return (
      resolved.factory.summarize({
        output,
        mimeType: resolved.mimeType,
        value: resolved.value,
        trusted,
      }) ?? null
    );
  }

  toAgentResult(output: NotebookOutputType, trusted = true): MimeAgentResult | null {
    const resolved = this.resolve(output, trusted);
    if (!resolved || !resolved.factory.toAgentResult) {
      return null;
    }
    return (
      resolved.factory.toAgentResult({
        output,
        mimeType: resolved.mimeType,
        value: resolved.value,
        trusted,
      }) ?? null
    );
  }

  getTextLength(output: NotebookOutputType, trusted = true): number {
    const resolved = this.resolve(output, trusted);
    if (!resolved || !resolved.factory.textLength) {
      return 0;
    }
    return (
      resolved.factory.textLength({
        output,
        mimeType: resolved.mimeType,
        value: resolved.value,
        trusted,
      }) ?? 0
    );
  }

  toClipboard(output: NotebookOutputType, trusted = true): MimeClipboardPayload | null {
    const resolved = this.resolve(output, trusted);
    if (!resolved || !resolved.factory.toClipboard) {
      return null;
    }
    return (
      resolved.factory.toClipboard({
        output,
        mimeType: resolved.mimeType,
        value: resolved.value,
        trusted,
      }) ?? null
    );
  }
}
