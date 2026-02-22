import { api } from "./api";

export interface ChangePasswordPayload {
  currentPassword?: string;
  newPassword: string;
}

export const securityService = {
  changePassword: async (payload: ChangePasswordPayload): Promise<void> => {
    await api.patch("/auth/password", payload);
  },

  linkGoogle: async (idToken: string): Promise<void> => {
    await api.post("/auth/google/link", { idToken });
  },
};
