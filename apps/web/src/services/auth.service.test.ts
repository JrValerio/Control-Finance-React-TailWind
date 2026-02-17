import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { authService } from "./auth.service";

vi.mock("./api", () => ({
  api: {
    post: vi.fn(),
  },
}));

const postMock = vi.mocked(api.post);

describe("auth service", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("retorna resposta de login quando payload e valido", async () => {
    postMock.mockResolvedValueOnce({
      data: {
        token: "jwt_token",
        user: {
          id: 1,
          name: "Amaro",
          email: "amaro@control.finance",
        },
      },
    });

    await expect(
      authService.login({ email: "amaro@control.finance", password: "abc12345" }),
    ).resolves.toEqual({
      token: "jwt_token",
      user: {
        id: 1,
        name: "Amaro",
        email: "amaro@control.finance",
      },
    });
  });

  it("normaliza token da resposta removendo espacos extras", async () => {
    postMock.mockResolvedValueOnce({
      data: {
        token: "  jwt_token  ",
        user: {
          id: 1,
          name: "Amaro",
          email: "amaro@control.finance",
        },
      },
    });

    await expect(
      authService.login({ email: "amaro@control.finance", password: "abc12345" }),
    ).resolves.toEqual({
      token: "jwt_token",
      user: {
        id: 1,
        name: "Amaro",
        email: "amaro@control.finance",
      },
    });
  });

  it("falha quando resposta de registro nao possui token", async () => {
    postMock.mockResolvedValueOnce({
      data: {
        user: {
          id: 1,
          name: "Amaro",
          email: "amaro@control.finance",
        },
      },
    });

    await expect(
      authService.register({
        name: "Amaro",
        email: "amaro@control.finance",
        password: "abc12345",
      }),
    ).rejects.toThrow("Resposta de autenticacao invalida.");
  });

  it("falha quando resposta de login nao possui user valido", async () => {
    postMock.mockResolvedValueOnce({
      data: {
        token: "jwt_token",
        user: {
          id: 1,
          name: "Amaro",
        },
      },
    });

    await expect(
      authService.login({ email: "amaro@control.finance", password: "abc12345" }),
    ).rejects.toThrow("Resposta de autenticacao invalida.");
  });
});
