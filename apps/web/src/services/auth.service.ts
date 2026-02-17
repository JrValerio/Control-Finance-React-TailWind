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

    return data as AuthResponse;
  },
  login: async ({ email, password }: LoginPayload): Promise<AuthResponse> => {
    const { data } = await api.post("/auth/login", {
      email,
      password,
    });

    return data as AuthResponse;
  },
};
