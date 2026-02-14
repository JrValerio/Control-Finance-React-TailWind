import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_TOKEN_STORAGE_KEY,
  api,
  clearStoredToken,
  getApiHealth,
  getStoredToken,
  setStoredToken,
  setUnauthorizedHandler,
} from "./api";

var requestInterceptor;
var responseErrorInterceptor;

vi.mock("axios", () => {
  const instance = {
    get: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn((handler) => {
          requestInterceptor = handler;
          return 0;
        }),
      },
      response: {
        use: vi.fn((_onSuccess, onError) => {
          responseErrorInterceptor = onError;
          return 0;
        }),
      },
    },
  };

  return {
    default: {
      create: vi.fn(() => instance),
    },
  };
});

describe("api service", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setUnauthorizedHandler(undefined);
  });

  it("consulta o healthcheck da API", async () => {
    api.get.mockResolvedValueOnce({
      data: { ok: true, version: "1.3.0" },
    });

    const result = await getApiHealth();

    expect(api.get).toHaveBeenCalledWith("/health");
    expect(result).toEqual({ ok: true, version: "1.3.0" });
  });

  it("persiste token de autenticacao no localStorage", () => {
    setStoredToken("jwt_token");

    expect(getStoredToken()).toBe("jwt_token");
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe("jwt_token");

    clearStoredToken();

    expect(getStoredToken()).toBe("");
  });

  it("injeta header Authorization quando existe token", () => {
    setStoredToken("jwt_token");

    const nextConfig = requestInterceptor({
      headers: {},
    });

    expect(nextConfig.headers.Authorization).toBe("Bearer jwt_token");
  });

  it("limpa token e executa handler quando API retorna 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setStoredToken("jwt_token");

    await expect(
      responseErrorInterceptor({
        response: { status: 401 },
      }),
    ).rejects.toBeTruthy();

    expect(getStoredToken()).toBe("");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
