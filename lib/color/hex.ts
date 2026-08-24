/** Converts supported hex input to normalized uppercase six-digit notation. */
export function normalizeHexColor(value: string | undefined): string | null {
  if (!value) return null;

  const match = value.trim().match(/^#?([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return null;

  const digits = match[1];
  const expanded =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => `${digit}${digit}`)
          .join("")
      : digits;

  return `#${expanded.toUpperCase()}`;
}

/** Parses persisted color values; invalid strings fall back to the provided default. */
export function parseHexColorValue(
  value: unknown,
  fallback: string | null,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  return normalizeHexColor(value) ?? fallback;
}
