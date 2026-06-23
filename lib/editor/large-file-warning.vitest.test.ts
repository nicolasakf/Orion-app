import { describe, expect, it } from "vitest";

import { formatFileSize } from "@/lib/editor/large-file-warning";

describe("large file warning helpers", () => {
  it("formats byte counts with human-readable binary units", () => {
    expect(formatFileSize(1)).toBe("1 byte");
    expect(formatFileSize(512)).toBe("512 bytes");
    expect(formatFileSize(1024)).toBe("1.00 KB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });
});
