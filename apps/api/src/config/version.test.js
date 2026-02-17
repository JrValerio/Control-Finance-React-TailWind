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

  it("prioriza APP_VERSION para versao", () => {
    const version = resolveApiVersion({
      APP_VERSION: "1.6.10",
      RENDER_GIT_COMMIT: "render-commit",
    });

    expect(version).toBe("1.6.10");
  });

  it("usa fallback sha curto quando APP_VERSION nao existe", () => {
    const version = resolveApiVersion({
      RENDER_GIT_COMMIT: "2e0ec31e19777924f4c5dfd59dcd240456d28c5e",
    });

    expect(version).toBe("sha-2e0ec31");
  });

  it("retorna unknown quando versao e commit nao existem", () => {
    const version = resolveApiVersion({});

    expect(version).toBe("unknown");
  });
});

