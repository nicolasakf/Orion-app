import type { ProviderId } from "@/lib/agent/model-gateway-types";

type LocalProvider = "ollama" | "lmstudio" | "mlx" | "custom";

export const LOCAL_PROVIDER_MODEL_LABELS: Record<LocalProvider, Record<string, string>> = {
  ollama: {
    "codellama": "Code Llama",
    "codegemma": "CodeGemma",
    "command-r": "Command R",
    "command-r-plus": "Command R+",
    "deepseek-coder-v2": "DeepSeek Coder V2",
    "deepseek-r1": "DeepSeek R1",
    "gemma2": "Gemma 2",
    "gemma3": "Gemma 3",
    "llama2": "Llama 2",
    "llama3": "Llama 3",
    "llama3.1": "Llama 3.1",
    "llama3.2": "Llama 3.2",
    "llama3.3": "Llama 3.3",
    "llava": "LLaVA",
    "mistral": "Mistral",
    "mistral-nemo": "Mistral NeMo",
    "mixtral": "Mixtral",
    "nomic-embed-text": "Nomic Embed Text",
    "phi3": "Phi-3",
    "phi4": "Phi-4",
    "qwen2.5": "Qwen 2.5",
    "qwen2.5-coder": "Qwen 2.5 Coder",
    "qwen3": "Qwen 3",
    "qwen3-coder": "Qwen 3 Coder",
    "qwen3.5": "Qwen 3.5",
    "smollm2": "SmolLM2",
    "starcoder2": "StarCoder2",
  },
  lmstudio: {
    "deepseek-r1-distill-llama-8b": "DeepSeek R1 Distill Llama 8B",
    "deepseek-r1-distill-qwen-7b": "DeepSeek R1 Distill Qwen 7B",
    "gemma-2-9b-it": "Gemma 2 9B Instruct",
    "gemma-3-12b-it": "Gemma 3 12B Instruct",
    "llama-3.1-8b-instruct": "Llama 3.1 8B Instruct",
    "llama-3.2-1b-instruct": "Llama 3.2 1B Instruct",
    "llama-3.2-3b-instruct": "Llama 3.2 3B Instruct",
    "llama-3.3-70b-instruct": "Llama 3.3 70B Instruct",
    "meta-llama-3.1-8b-instruct": "Llama 3.1 8B Instruct",
    "meta-llama-3.2-1b-instruct": "Llama 3.2 1B Instruct",
    "meta-llama-3.2-3b-instruct": "Llama 3.2 3B Instruct",
    "meta-llama-3.3-70b-instruct": "Llama 3.3 70B Instruct",
    "mistral-7b-instruct-v0.3": "Mistral 7B Instruct v0.3",
    "mistral-nemo-instruct-2407": "Mistral NeMo Instruct",
    "mixtral-8x7b-instruct-v0.1": "Mixtral 8x7B Instruct",
    "phi-3.5-mini-instruct": "Phi-3.5 Mini Instruct",
    "phi-4": "Phi-4",
    "qwen2.5-7b-instruct": "Qwen 2.5 7B Instruct",
    "qwen2.5-coder-7b-instruct": "Qwen 2.5 Coder 7B Instruct",
    "qwen3-4b": "Qwen 3 4B",
    "qwen3-8b": "Qwen 3 8B",
    "qwen3-coder-30b-a3b-instruct": "Qwen 3 Coder 30B A3B Instruct",
    "qwen3.5-4b": "Qwen 3.5 4B",
    "qwen3.5-9b": "Qwen 3.5 9B",
    "qwen3.5-35b-a3b": "Qwen 3.5 35B A3B",
  },
  mlx: {
    "mlx-community/qwen3-8b-4bit": "Qwen 3 8B MLX 4-bit",
    "mlx-community/qwen3-coder-30b-a3b-instruct-4bit": "Qwen 3 Coder 30B MLX 4-bit",
    "mlx-community/llama-3.2-3b-instruct-4bit": "Llama 3.2 3B MLX 4-bit",
    "mlx-community/mistral-nemo-instruct-2407-4bit": "Mistral NeMo MLX 4-bit",
  },
  custom: {},
};

/** Looks up a friendly label for common local model IDs. */
export function getLocalModelLabel(
  provider: ProviderId,
  modelId: string
): string | undefined {
  if (
    provider !== "ollama" &&
    provider !== "lmstudio" &&
    provider !== "mlx" &&
    provider !== "custom"
  ) {
    return undefined;
  }

  const normalized = modelId.trim().toLowerCase();
  const aliases = LOCAL_PROVIDER_MODEL_LABELS[provider];
  const withoutTag = normalized.split(":")[0] ?? "";
  const lastPathSegment = withoutTag.split("/").pop() ?? withoutTag;
  const withoutGgufSuffix = lastPathSegment
    .replace(/\.gguf$/i, "")
    .replace(/-gguf$/i, "");

  return (
    aliases[normalized] ??
    aliases[withoutTag] ??
    aliases[lastPathSegment] ??
    aliases[withoutGgufSuffix]
  );
}
