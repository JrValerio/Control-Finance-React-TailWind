import { useContext } from "react";
import { AuthContext } from "../context/auth-context";
import type { AuthContextValue } from "../context/auth-context";

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
};
