import { api } from "./api";

export const transactionsService = {
  list: async () => {
    const { data } = await api.get("/transactions");
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/transactions", payload);
    return data;
  },
  remove: async (id) => {
    const { data } = await api.delete(`/transactions/${id}`);
    return data;
  },
};
