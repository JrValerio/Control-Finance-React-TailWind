import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { authService } from "../services/auth.service";
import type {
  AuthResponse,
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from "../services/auth.service";
import {
  clearStoredToken,
  getStoredToken,
  setUnauthorizedHandler,
  setStoredToken,
} from "../services/api";
import { AuthContext } from "./auth-context";
import type { AuthContextValue } from "./auth-context";

interface ApiLikeError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

interface AuthProviderProps {
  children: ReactNode;
}

const getApiErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (!error || typeof error !== "object") {
    return fallbackMessage;
  }

  const apiError = error as ApiLikeError;
  return apiError.response?.data?.message || apiError.message || fallbackMessage;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [token, setToken] = useState<string>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const login = useCallback(
    async ({ email, password }: LoginPayload): Promise<AuthResponse> => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await authService.login({ email, password });
        setStoredToken(response.token);
        setToken(response.token);
        setUser(response.user);
        return response;
      } catch (error) {
        const message = getApiErrorMessage(error, "Nao foi possivel fazer login.");
        setErrorMessage(message);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const register = useCallback(
    async ({ name, email, password }: RegisterPayload): Promise<AuthResponse> => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await authService.register({ name, email, password });
        return response;
      } catch (error) {
        const message = getApiErrorMessage(error, "Nao foi possivel criar conta.");
        setErrorMessage(message);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback((): void => {
    clearStoredToken();
    setToken("");
    setUser(null);
    setErrorMessage("");
  }, []);

  const clearError = useCallback((): void => {
    setErrorMessage("");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken("");
      setUser(null);
      setErrorMessage("");
    });

    return () => {
      setUnauthorizedHandler(undefined);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isLoading,
      errorMessage,
      isAuthenticated: Boolean(token),
      login,
      register,
      logout,
      clearError,
    }),
    [token, user, isLoading, errorMessage, login, register, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
