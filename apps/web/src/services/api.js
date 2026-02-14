import axios from "axios";

const API_URL_LOCAL_DEV = "http://localhost:3001";
const API_CONFIGURATION_ERROR_MESSAGE =
  "VITE_API_URL nao configurada para este ambiente. Defina a variavel no deploy.";

export const resolveApiUrl = (env = import.meta.env) => {
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
let unauthorizedHandler = undefined;

const createApiConfigurationError = () => {
  const error = new Error(API_CONFIGURATION_ERROR_MESSAGE);
  error.code = "API_URL_NOT_CONFIGURED";
  return error;
};

export const getStoredToken = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
};

export const setStoredToken = (token) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
};

export const clearStoredToken = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
};

export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler;
};

export const api = axios.create({
  baseURL: API_URL || undefined,
  timeout: 8000,
});

api.interceptors.request.use((config) => {
  if (!isApiConfigured) {
    return Promise.reject(createApiConfigurationError());
  }

  const token = getStoredToken();

  if (!token) {
    return config;
  }

  if (config.headers && typeof config.headers.set === "function") {
    config.headers.set("Authorization", `Bearer ${token}`);
    return config;
  }

  return {
    ...config,
    headers: {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    },
  };
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

export const getApiHealth = async () => {
  const { data } = await api.get("/health");
  return data;
};
