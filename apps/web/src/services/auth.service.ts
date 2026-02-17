import { api } from "./api";

export interface AuthUser {
  id: number | string;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name?: string;
  email: string;
  password: string;
}

const INVALID_AUTH_RESPONSE_MESSAGE = "Resposta de autenticacao invalida.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isAuthUser = (value: unknown): value is AuthUser => {
  if (!isRecord(value)) {
    return false;
  }

  const { id, name, email } = value;
  return (
    (typeof id === "number" || typeof id === "string") &&
    typeof name === "string" &&
    typeof email === "string"
  );
};

const parseAuthResponse = (responseData: unknown): AuthResponse => {
  if (!isRecord(responseData)) {
    throw new Error(INVALID_AUTH_RESPONSE_MESSAGE);
  }

  const token = responseData.token;
  const user = responseData.user;
  const normalizedToken = typeof token === "string" ? token.trim() : "";

  if (!normalizedToken || !isAuthUser(user)) {
    throw new Error(INVALID_AUTH_RESPONSE_MESSAGE);
  }

  return {
    token: normalizedToken,
    user,
  };
};

export const authService = {
  register: async ({
    name = "",
    email,
    password,
  }: RegisterPayload): Promise<AuthResponse> => {
    const { data } = await api.post("/auth/register", {
      name,
      email,
      password,
    });

    return parseAuthResponse(data);
  },
  login: async ({ email, password }: LoginPayload): Promise<AuthResponse> => {
    const { data } = await api.post("/auth/login", {
      email,
      password,
    });

    return parseAuthResponse(data);
  },
};
