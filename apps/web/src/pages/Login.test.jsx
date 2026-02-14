import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "./Login";

const mockUseAuth = vi.fn();

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const createAuthMockState = (overrides = {}) => ({
  isAuthenticated: false,
  isLoading: false,
  errorMessage: "",
  login: vi.fn().mockResolvedValue({}),
  register: vi.fn().mockResolvedValue({}),
  clearError: vi.fn(),
  ...overrides,
});

const renderLoginPage = () => {
  return render(
    <MemoryRouter
      initialEntries={["/"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Login />
    </MemoryRouter>,
  );
};

describe("Login", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("bloqueia cadastro com senha fraca", async () => {
    const authState = createAuthMockState();
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(authState);
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    await user.type(screen.getByLabelText("Email"), "jr@controlfinance.dev");
    await user.type(screen.getByLabelText("Senha"), "1234567");
    await user.type(screen.getByLabelText("Confirmar senha"), "1234567");
    await user.click(screen.getByRole("button", { name: "Criar conta e entrar" }));

    expect(
      screen.getByText(
        "Senha fraca: use no minimo 8 caracteres e inclua letras e numeros.",
      ),
    ).toBeInTheDocument();
    expect(authState.register).not.toHaveBeenCalled();
    expect(authState.login).not.toHaveBeenCalled();
  });

  it("bloqueia cadastro quando confirmacao de senha diverge", async () => {
    const authState = createAuthMockState();
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(authState);
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    await user.type(screen.getByLabelText("Email"), "jr@controlfinance.dev");
    await user.type(screen.getByLabelText("Senha"), "Senha123");
    await user.type(screen.getByLabelText("Confirmar senha"), "Senha124");
    await user.click(screen.getByRole("button", { name: "Criar conta e entrar" }));

    expect(screen.getByText("As senhas nao conferem.")).toBeInTheDocument();
    expect(authState.register).not.toHaveBeenCalled();
    expect(authState.login).not.toHaveBeenCalled();
  });

  it("realiza cadastro e login com senha valida", async () => {
    const authState = createAuthMockState();
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(authState);
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    await user.type(screen.getByLabelText("Nome"), "Junior");
    await user.type(screen.getByLabelText("Email"), "jr@controlfinance.dev");
    await user.type(screen.getByLabelText("Senha"), "Senha123");
    await user.type(screen.getByLabelText("Confirmar senha"), "Senha123");
    await user.click(screen.getByRole("button", { name: "Criar conta e entrar" }));

    await waitFor(() => {
      expect(authState.register).toHaveBeenCalledWith({
        name: "Junior",
        email: "jr@controlfinance.dev",
        password: "Senha123",
      });
      expect(authState.login).toHaveBeenCalledWith({
        email: "jr@controlfinance.dev",
        password: "Senha123",
      });
    });
  });
});
