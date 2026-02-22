import { createContext } from "react";
import type {
  AuthResponse,
  AuthUser,
  GoogleLoginPayload,
  LoginPayload,
  RegisterPayload,
} from "../services/auth.service";

export interface AuthContextValue {
  token: string;
  user: AuthUser | null;
  isLoading: boolean;
  errorMessage: string;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<AuthResponse>;
  register: (payload: RegisterPayload) => Promise<AuthResponse>;
  loginWithGoogle: (payload: GoogleLoginPayload) => Promise<AuthResponse>;
  logout: () => void;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
