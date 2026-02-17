import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_TOKEN_STORAGE_KEY,
  api,
  clearStoredToken,
  getApiHealth,
  getStoredToken,
  resolveApiUrl,
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
      data: { ok: true, version: "1.6.4", commit: "2eb3f64" },
    });

    const result = await getApiHealth();

    expect(api.get).toHaveBeenCalledWith("/health");
    expect(result).toEqual({ ok: true, version: "1.6.4", commit: "2eb3f64" });
  });

  it("resolve URL configurada para producao", () => {
    const url = resolveApiUrl({
      DEV: false,
      VITE_API_URL: "https://control-finance-api.example.com",
    });

    expect(url).toBe("https://control-finance-api.example.com");
  });

  it("nao usa localhost em producao sem VITE_API_URL", () => {
    const url = resolveApiUrl({
      DEV: false,
      VITE_API_URL: "",
    });

    expect(url).toBe("");
  });

  it("persiste token de autenticacao no localStorage", () => {
    setStoredToken("jwt_token");

    expect(getStoredToken()).toBe("jwt_token");
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe("jwt_token");

    clearStoredToken();

    expect(getStoredToken()).toBe("");
  });

  it("normaliza token salvo removendo espacos extras", () => {
    setStoredToken("  jwt_token  ");

    expect(getStoredToken()).toBe("jwt_token");
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe("jwt_token");
  });

  it("nao persiste token vazio apos normalizacao", () => {
    setStoredToken("   ");

    expect(getStoredToken()).toBe("");
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
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

  it("nao executa handler se ele for removido", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setUnauthorizedHandler(undefined);
    setStoredToken("jwt_token");

    await expect(
      responseErrorInterceptor({
        response: { status: 401 },
      }),
    ).rejects.toBeTruthy();

    expect(getStoredToken()).toBe("");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
