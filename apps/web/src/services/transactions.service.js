import { api } from "./api";

const buildTransactionParams = (options = {}) => {
  const params = {};

  if (options.includeDeleted === true) {
    params.includeDeleted = "true";
  }

  if (options.type) {
    params.type = options.type;
  }

  if (options.from) {
    params.from = options.from;
  }

  if (options.to) {
    params.to = options.to;
  }

  if (typeof options.q === "string" && options.q.trim()) {
    params.q = options.q.trim();
  }

  return params;
};

const resolveCsvFilename = (contentDispositionHeader) => {
  if (typeof contentDispositionHeader !== "string") {
    return "";
  }

  const fileNameMatch = contentDispositionHeader.match(
    /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i,
  );

  if (!fileNameMatch) {
    return "";
  }

  const fileName = fileNameMatch[1] || fileNameMatch[2] || "";

  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
};

export const transactionsService = {
  list: async (options = {}) => {
    const params = buildTransactionParams(options);
    const { data } = await api.get("/transactions", { params });

    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data?.data)) {
      return data.data;
    }

    return [];
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
  exportCsv: async (options = {}) => {
    const params = buildTransactionParams(options);
    const response = await api.get("/transactions/export.csv", {
      params,
      responseType: "blob",
    });

    return {
      blob: response.data,
      fileName: resolveCsvFilename(response.headers?.["content-disposition"]),
    };
  },
};
