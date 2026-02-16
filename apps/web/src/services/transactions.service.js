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

  if (Number.isInteger(options.page) && options.page > 0) {
    params.page = String(options.page);
  }

  if (Number.isInteger(options.limit) && options.limit > 0) {
    params.limit = String(options.limit);
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
  listPage: async (options = {}) => {
    const params = buildTransactionParams(options);
    const { data } = await api.get("/transactions", { params });
    const page = Number(data?.meta?.page);
    const limit = Number(data?.meta?.limit);
    const total = Number(data?.meta?.total);
    const totalPages = Number(data?.meta?.totalPages);

    return {
      data: Array.isArray(data?.data) ? data.data : [],
      meta: {
        page: Number.isInteger(page) && page > 0 ? page : 1,
        limit: Number.isInteger(limit) && limit > 0 ? limit : 20,
        total: Number.isInteger(total) && total >= 0 ? total : 0,
        totalPages: Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 1,
      },
    };
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
