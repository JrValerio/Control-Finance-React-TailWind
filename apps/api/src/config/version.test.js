import { describe, expect, it } from "vitest";
import { resolveApiCommit, resolveApiVersion } from "./version.js";

describe("version config", () => {
  it("prioriza RENDER_GIT_COMMIT para commit", () => {
    const commit = resolveApiCommit({
      RENDER_GIT_COMMIT: "render-commit",
      APP_COMMIT: "app-commit",
      COMMIT_SHA: "generic-commit",
    });

    expect(commit).toBe("render-commit");
  });

  it("usa APP_COMMIT quando RENDER_GIT_COMMIT nao existe", () => {
    const commit = resolveApiCommit({
      APP_COMMIT: "app-commit",
      COMMIT_SHA: "generic-commit",
    });

    expect(commit).toBe("app-commit");
  });

  it("usa COMMIT_SHA quando nenhum commit especifico existe", () => {
    const commit = resolveApiCommit({
      COMMIT_SHA: "generic-commit",
    });

    expect(commit).toBe("generic-commit");
  });

  it("retorna unknown quando nenhum commit esta disponivel", () => {
    const commit = resolveApiCommit({});

    expect(commit).toBe("unknown");
  });

  it("prioriza versao do package quando disponivel", () => {
    const version = resolveApiVersion({
      APP_VERSION: "9.9.9",
      RENDER_GIT_COMMIT: "render-commit",
    }, {
      packageVersion: "1.7.0",
    });

    expect(version).toBe("1.7.0");
  });

  it("usa APP_VERSION quando package version nao pode ser resolvida", () => {
    const version = resolveApiVersion(
      {
        APP_VERSION: "1.7.0",
        RENDER_GIT_COMMIT: "render-commit",
      },
      {
        packageVersion: "",
      },
    );

    expect(version).toBe("1.7.0");
  });

  it("usa fallback sha curto quando package version e APP_VERSION nao existem", () => {
    const version = resolveApiVersion({
      RENDER_GIT_COMMIT: "2e0ec31e19777924f4c5dfd59dcd240456d28c5e",
    }, {
      packageVersion: "",
    });

    expect(version).toBe("sha-2e0ec31");
  });

  it("retorna unknown quando nenhuma fonte de versao e commit existem", () => {
    const version = resolveApiVersion({}, { packageVersion: "" });

    expect(version).toBe("unknown");
  });
});
