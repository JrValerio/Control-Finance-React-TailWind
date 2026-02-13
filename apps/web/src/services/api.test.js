import { describe, expect, it, vi } from "vitest";
import { api, getApiHealth } from "./api";

vi.mock("axios", () => {
  const instance = {
    get: vi.fn(),
  };

  return {
    default: {
      create: vi.fn(() => instance),
    },
  };
});

describe("api service", () => {
  it("consulta o healthcheck da API", async () => {
    api.get.mockResolvedValueOnce({
      data: { ok: true, version: "1.3.0" },
    });

    const result = await getApiHealth();

    expect(api.get).toHaveBeenCalledWith("/health");
    expect(result).toEqual({ ok: true, version: "1.3.0" });
  });
});
