import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const WEAK_PASSWORD_MESSAGE =
  "Senha fraca: use no minimo 8 caracteres com letras e numeros.";

type AuthMode = "login" | "register";

const isStrongPassword = (password: string): boolean => {
  const normalizedPassword = password.trim();
  return PASSWORD_REGEX.test(normalizedPassword);
};

const Login = (): JSX.Element => {
  const navigate = useNavigate();
  const {
    isAuthenticated,
    isLoading,
    errorMessage,
    login,
    register,
    clearError,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/app", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const resetErrors = () => {
    setLocalError("");
    clearError();
  };

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    resetErrors();

    if (nextMode === "login") {
      setConfirmPassword("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetErrors();

    if (!email.trim() || !password.trim()) {
      setLocalError("Email e senha sao obrigatorios.");
      return;
    }

    try {
      if (mode === "register") {
        if (!isStrongPassword(password)) {
          setLocalError(WEAK_PASSWORD_MESSAGE);
          return;
        }

        if (password.trim() !== confirmPassword.trim()) {
          setLocalError("As senhas nao conferem.");
          return;
        }

        await register({
          name,
          email,
          password,
        });
      }

      await login({ email, password });
      navigate("/app", { replace: true });
    } catch {
      // Erro de API tratado no contexto.
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-cf-bg-page p-4">
      <section className="w-full max-w-md rounded bg-cf-surface p-6 shadow-lg">
        <h1 className="text-3xl font-semibold text-cf-text-primary">
          <span className="text-brand-1">Control</span>Finance
        </h1>
        <p className="mt-2 text-sm text-cf-text-secondary">
          Entre para acessar o dashboard financeiro.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange("login")}
            className={`rounded px-3 py-2 text-sm font-medium ${
              mode === "login"
                ? "bg-brand-1 text-white"
                : "bg-cf-bg-subtle text-cf-text-primary"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("register")}
            className={`rounded px-3 py-2 text-sm font-medium ${
              mode === "register"
                ? "bg-brand-1 text-white"
                : "bg-cf-bg-subtle text-cf-text-primary"
            }`}
          >
            Criar conta
          </button>
        </div>

        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <div>
              <label
                htmlFor="nome"
                className="mb-1 block text-sm font-medium text-cf-text-primary"
              >
                Nome
              </label>
              <input
                id="nome"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-secondary"
              />
            </div>
          ) : null}

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-cf-text-primary"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-secondary"
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="senha"
              className="mb-1 block text-sm font-medium text-cf-text-primary"
            >
              Senha
            </label>
            <input
              id="senha"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-secondary"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </div>

          {mode === "register" ? (
            <div>
              <label
                htmlFor="confirmar-senha"
                className="mb-1 block text-sm font-medium text-cf-text-primary"
              >
                Confirmar senha
              </label>
              <input
                id="confirmar-senha"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-secondary"
                autoComplete="new-password"
              />
            </div>
          ) : null}

          {localError ? (
            <p className="text-sm font-medium text-red-600">{localError}</p>
          ) : null}

          {!localError && errorMessage ? (
            <p className="text-sm font-medium text-red-600">{errorMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-brand-1 px-4 py-2 font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading
              ? "Processando..."
              : mode === "register"
                ? "Criar conta e entrar"
                : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
};

export default Login;
