import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
export const AUTH_TOKEN_STORAGE_KEY = "control_finance.auth_token";
let unauthorizedHandler = undefined;

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
  baseURL: API_URL,
  timeout: 8000,
});

api.interceptors.request.use((config) => {
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
