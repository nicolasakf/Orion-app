import { describe, expect, it } from "vitest";

import { getMissingToolRuntimeDependency } from "./tool-runtime-readiness";

describe("getMissingToolRuntimeDependency", () => {
  it("blocks server-only tools until the Jupyter server connection is verified", () => {
    expect(
      getMissingToolRuntimeDependency("bash", {
        serverReady: false,
        kernelStatus: "disconnected",
      })
    ).toBe("server");
  });

  it("allows server-only tools without a kernel once the server is available", () => {
    expect(
      getMissingToolRuntimeDependency("read_file", {
        serverReady: true,
        kernelStatus: "disconnected",
      })
    ).toBeNull();
  });

  it("continues to block execution tools until a kernel is connected", () => {
    expect(
      getMissingToolRuntimeDependency("execute_code", {
        serverReady: true,
        kernelStatus: "disconnected",
      })
    ).toBe("kernel");
  });

  it("allows dependency-free tools while the runtime is disconnected", () => {
    expect(
      getMissingToolRuntimeDependency("web_search", {
        serverReady: false,
        kernelStatus: "disconnected",
      })
    ).toBeNull();
  });
});
