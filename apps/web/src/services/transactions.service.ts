import { api } from "./api";

export type TransactionType = "Entrada" | "Saida";

export interface Transaction {
  id: number;
  userId?: number;
  categoryId?: number | null;
  type: TransactionType;
  value: number;
  date: string;
  description?: string;
  notes?: string;
  createdAt?: string;
  deletedAt?: string | null;
}

export interface TransactionListOptions {
  includeDeleted?: boolean;
  type?: TransactionType;
  categoryId?: number;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TransactionsPageResult {
  data: Transaction[];
  meta: PaginationMeta;
}

export interface TransactionCreatePayload {
  type: TransactionType;
  value: number;
  date?: string;
  description?: string;
  notes?: string;
  category_id?: number | null;
}

export interface TransactionUpdatePayload {
  type?: TransactionType;
  value?: number;
  date?: string;
  description?: string;
  notes?: string;
  category_id?: number | null;
}

export interface CategoryOption {
  id: number;
  name: string;
}

export interface MonthlySummaryByCategory {
  categoryId: number | null;
  categoryName: string;
  expense: number;
}

export interface MonthlySummary {
  month: string;
  income: number;
  expense: number;
  balance: number;
  byCategory: MonthlySummaryByCategory[];
}

interface TransactionsApiResponse {
  data?: unknown;
  meta?: {
    page?: unknown;
    limit?: unknown;
    total?: unknown;
    totalPages?: unknown;
  };
}

interface CsvExportResult {
  blob: Blob;
  fileName: string;
}

interface MonthlySummaryApiResponse {
  month?: unknown;
  income?: unknown;
  expense?: unknown;
  balance?: unknown;
  byCategory?: Array<{
    categoryId?: unknown;
    categoryName?: unknown;
    expense?: unknown;
  }>;
}

const buildTransactionParams = (options: TransactionListOptions = {}): Record<string, string> => {
  const params: Record<string, string> = {};

  if (options.includeDeleted === true) {
    params.includeDeleted = "true";
  }

  if (options.type) {
    params.type = options.type;
  }

  if (Number.isInteger(options.categoryId) && options.categoryId > 0) {
    params.categoryId = String(options.categoryId);
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

const resolveCsvFilename = (contentDispositionHeader: unknown): string => {
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
  listPage: async (options: TransactionListOptions = {}): Promise<TransactionsPageResult> => {
    const params = buildTransactionParams(options);
    const { data } = await api.get("/transactions", { params });
    const responseBody = data as TransactionsApiResponse;
    const page = Number(responseBody?.meta?.page);
    const limit = Number(responseBody?.meta?.limit);
    const total = Number(responseBody?.meta?.total);
    const totalPages = Number(responseBody?.meta?.totalPages);

    return {
      data: Array.isArray(responseBody?.data) ? (responseBody.data as Transaction[]) : [],
      meta: {
        page: Number.isInteger(page) && page > 0 ? page : 1,
        limit: Number.isInteger(limit) && limit > 0 ? limit : 20,
        total: Number.isInteger(total) && total >= 0 ? total : 0,
        totalPages: Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 1,
      },
    };
  },
  listCategories: async (): Promise<CategoryOption[]> => {
    const { data } = await api.get("/categories");

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((category) => ({
        id: Number((category as { id?: unknown }).id),
        name: String((category as { name?: unknown }).name || "").trim(),
      }))
      .filter((category) => Number.isInteger(category.id) && category.id > 0 && category.name);
  },
  getMonthlySummary: async (month: string): Promise<MonthlySummary> => {
    const { data } = await api.get("/transactions/summary", {
      params: { month },
    });
    const responseBody = data as MonthlySummaryApiResponse;
    const byCategory = Array.isArray(responseBody.byCategory)
      ? responseBody.byCategory.map((item) => {
          const numericCategoryId = Number(item?.categoryId);

          return {
            categoryId:
              Number.isInteger(numericCategoryId) && numericCategoryId > 0
                ? numericCategoryId
                : null,
            categoryName:
              typeof item?.categoryName === "string" && item.categoryName.trim()
                ? item.categoryName.trim()
                : "Sem categoria",
            expense: Number(item?.expense) || 0,
          };
        })
      : [];

    return {
      month:
        typeof responseBody.month === "string" && responseBody.month.trim()
          ? responseBody.month.trim()
          : month,
      income: Number(responseBody.income) || 0,
      expense: Number(responseBody.expense) || 0,
      balance: Number(responseBody.balance) || 0,
      byCategory,
    };
  },
  create: async (payload: TransactionCreatePayload): Promise<Transaction> => {
    const { data } = await api.post("/transactions", payload);
    return data as Transaction;
  },
  update: async (id: number, payload: TransactionUpdatePayload): Promise<Transaction> => {
    const { data } = await api.patch(`/transactions/${id}`, payload);
    return data as Transaction;
  },
  remove: async (id: number): Promise<{ id: number; success: boolean }> => {
    const { data } = await api.delete(`/transactions/${id}`);
    return data as { id: number; success: boolean };
  },
  restore: async (id: number): Promise<Transaction> => {
    const { data } = await api.post(`/transactions/${id}/restore`);
    return data as Transaction;
  },
  exportCsv: async (options: TransactionListOptions = {}): Promise<CsvExportResult> => {
    const params = buildTransactionParams(options);
    const response = await api.get("/transactions/export.csv", {
      params,
      responseType: "blob",
    });

    return {
      blob: response.data as Blob,
      fileName: resolveCsvFilename(response.headers?.["content-disposition"]),
    };
  },
};
