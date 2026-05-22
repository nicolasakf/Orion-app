import type { SupportedProvider } from "@/lib/agent/model-gateway-types";
import { getLocalModelLabel } from "@/lib/agent/local-model-labels";

export type LocalProvider = Extract<
  SupportedProvider,
  "ollama" | "lmstudio" | "mlx" | "custom"
>;

export interface LocalEndpointModel {
  modelId: string;
  label?: string;
  enabled?: boolean;
}

export interface LocalEndpointCredentialLike {
  modelId: string;
  label?: string;
  models?: LocalEndpointModel[];
}

export const LOCAL_PROVIDER_IDS: LocalProvider[] = [
  "ollama",
  "lmstudio",
  "mlx",
  "custom",
];

const STATIC_LOCAL_MODEL_IDS: Record<LocalProvider, string> = {
  ollama: "ollama-local",
  lmstudio: "lmstudio-local",
  mlx: "mlx-local",
  custom: "custom-local",
};

const LOCAL_PROVIDER_DISPLAY_NAMES: Record<LocalProvider, string> = {
  ollama: "Ollama",
  lmstudio: "LM Studio",
  mlx: "MLX",
  custom: "Custom Endpoint",
};

export function isLocalProvider(provider: string): provider is LocalProvider {
  return LOCAL_PROVIDER_IDS.includes(provider as LocalProvider);
}

export function getLocalProviderDisplayName(provider: LocalProvider): string {
  return LOCAL_PROVIDER_DISPLAY_NAMES[provider];
}

export function getStaticLocalModelId(provider: LocalProvider): string {
  return STATIC_LOCAL_MODEL_IDS[provider];
}

export function encodeLocalModelCatalogId(
  provider: LocalProvider,
  providerModelId: string
): string {
  return `${getStaticLocalModelId(provider)}:${encodeURIComponent(providerModelId)}`;
}

export function decodeLocalModelCatalogId(
  catalogModelId: string
): { provider: LocalProvider; providerModelId: string } | undefined {
  for (const provider of LOCAL_PROVIDER_IDS) {
    const prefix = `${getStaticLocalModelId(provider)}:`;
    if (!catalogModelId.startsWith(prefix)) continue;

    const encoded = catalogModelId.slice(prefix.length);
    if (!encoded) return undefined;

    try {
      return {
        provider,
        providerModelId: decodeURIComponent(encoded),
      };
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function isStaticLocalModelCatalogId(
  provider: LocalProvider,
  catalogModelId: string
): boolean {
  return catalogModelId === getStaticLocalModelId(provider);
}

/** Deduplicates configured local models while preserving user-visible order. */
export function normalizeLocalEndpointModels(
  provider: LocalProvider,
  credential: LocalEndpointCredentialLike
): LocalEndpointModel[] {
  const byId = new Map<string, LocalEndpointModel>();
  const addModel = (model: LocalEndpointModel) => {
    const modelId = model.modelId.trim();
    if (!modelId || byId.has(modelId)) return;

    byId.set(modelId, {
      modelId,
      label:
        model.label?.trim() ||
        getLocalModelLabel(provider, modelId) ||
        modelId,
      enabled: model.enabled ?? true,
    });
  };

  addModel({
    modelId: credential.modelId,
    label: credential.label,
    enabled: true,
  });
  credential.models?.forEach(addModel);

  return Array.from(byId.values());
}

export function getLocalCatalogModelLabel(
  provider: LocalProvider,
  model: LocalEndpointModel
): string {
  return model.label?.trim() || getLocalModelLabel(provider, model.modelId) || model.modelId;
}

/** Maps Orion's selectable model ID back to the runtime model ID. */
export function resolveLocalRuntimeModelId(
  provider: LocalProvider,
  catalogModelId: string,
  credential: LocalEndpointCredentialLike
): string | undefined {
  const decoded = decodeLocalModelCatalogId(catalogModelId);
  if (decoded) {
    return decoded.provider === provider ? decoded.providerModelId : undefined;
  }

  if (isStaticLocalModelCatalogId(provider, catalogModelId)) {
    return credential.modelId;
  }

  return undefined;
}
