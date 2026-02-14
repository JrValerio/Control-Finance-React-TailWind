import { api } from "./api";

export const transactionsService = {
  list: async (options = {}) => {
    const params = {};

    if (options.includeDeleted === true) {
      params.includeDeleted = "true";
    }

    const { data } = await api.get("/transactions", { params });
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/transactions", payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.patch(`/transactions/${id}`, payload);
    return data;
  },
  remove: async (id) => {
    const { data } = await api.delete(`/transactions/${id}`);
    return data;
  },
  restore: async (id) => {
    const { data } = await api.post(`/transactions/${id}/restore`);
    return data;
  },
};
