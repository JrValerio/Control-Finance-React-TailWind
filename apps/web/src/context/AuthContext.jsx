import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { authService } from "../services/auth.service";
import {
  clearStoredToken,
  getStoredToken,
  setUnauthorizedHandler,
  setStoredToken,
} from "../services/api";
import { AuthContext } from "./auth-context";

const getApiErrorMessage = (error, fallbackMessage) => {
  return error?.response?.data?.message || error?.message || fallbackMessage;
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const login = useCallback(async ({ email, password }) => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await authService.login({ email, password });
      setStoredToken(response.token);
      setToken(response.token);
      setUser(response.user || null);
      return response;
    } catch (error) {
      const message = getApiErrorMessage(error, "Nao foi possivel fazer login.");
      setErrorMessage(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async ({ name, email, password }) => {
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
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken("");
    setUser(null);
    setErrorMessage("");
  }, []);

  const clearError = useCallback(() => {
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

  const value = useMemo(
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

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
