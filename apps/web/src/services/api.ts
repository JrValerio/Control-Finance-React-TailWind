import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import type { ApiHealth } from "./types";

const API_URL_LOCAL_DEV = "http://localhost:3001";
const API_CONFIGURATION_ERROR_MESSAGE =
  "VITE_API_URL nao configurada para este ambiente. Defina a variavel no deploy.";

type EnvConfig = {
  DEV?: boolean;
  VITE_API_URL?: string;
};

type UnauthorizedHandler = (() => void) | undefined;

type ApiConfigurationError = Error & {
  code: "API_URL_NOT_CONFIGURED";
};

const normalizeToken = (token: string): string => token.trim();

export const resolveApiUrl = (env: EnvConfig = import.meta.env) => {
  const configuredApiUrl = env?.VITE_API_URL?.trim();

  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  if (env?.DEV) {
    return API_URL_LOCAL_DEV;
  }

  return "";
};

const API_URL = resolveApiUrl();
export const AUTH_TOKEN_STORAGE_KEY = "control_finance.auth_token";
const isApiConfigured = Boolean(API_URL);
let unauthorizedHandler: UnauthorizedHandler = undefined;

const createApiConfigurationError = (): ApiConfigurationError => {
  const error = new Error(API_CONFIGURATION_ERROR_MESSAGE) as ApiConfigurationError;
  error.code = "API_URL_NOT_CONFIGURED";
  return error;
};

export const getStoredToken = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const storedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!storedToken) {
    return "";
  }

  return normalizeToken(storedToken);
};

export const setStoredToken = (token: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) {
    clearStoredToken();
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, normalizedToken);
};

export const clearStoredToken = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
};

export const setUnauthorizedHandler = (handler: UnauthorizedHandler) => {
  unauthorizedHandler = typeof handler === "function" ? handler : undefined;
};

export const api = axios.create({
  baseURL: API_URL || undefined,
  timeout: 8000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!isApiConfigured) {
    return Promise.reject(createApiConfigurationError());
  }

  const token = getStoredToken();

  if (!token) {
    return config;
  }

  const mutableConfig = config as InternalAxiosRequestConfig & {
    headers: {
      set?: (name: string, value: string) => void;
      [key: string]: unknown;
    };
  };

  if (mutableConfig.headers && typeof mutableConfig.headers.set === "function") {
    mutableConfig.headers.set("Authorization", `Bearer ${token}`);
    return config;
  }

  mutableConfig.headers = {
    Authorization: `Bearer ${token}`,
  } as unknown as InternalAxiosRequestConfig["headers"];

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearStoredToken();

      if (typeof unauthorizedHandler === "function") {
        unauthorizedHandler();
      }
    }

    return Promise.reject(error);
  },
);

export const getApiHealth = async (): Promise<ApiHealth> => {
  const { data } = await api.get("/health");
  return data as ApiHealth;
};
