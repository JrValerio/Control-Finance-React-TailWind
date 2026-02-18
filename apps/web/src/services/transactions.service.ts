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

export interface ImportDryRunError {
  field: string;
  message: string;
}

export interface ImportDryRunRawRow {
  date: string;
  type: string;
  value: string;
  description: string;
  notes: string;
  category: string;
}

export interface ImportDryRunNormalizedRow {
  date: string;
  type: TransactionType;
  value: number;
  description: string;
  notes: string;
  categoryId: number | null;
}

export interface ImportDryRunRow {
  line: number;
  status: "valid" | "invalid";
  raw: ImportDryRunRawRow;
  normalized: ImportDryRunNormalizedRow | null;
  errors: ImportDryRunError[];
}

export interface ImportDryRunSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  income: number;
  expense: number;
}

export interface ImportDryRunResult {
  importId: string;
  expiresAt: string;
  summary: ImportDryRunSummary;
  rows: ImportDryRunRow[];
}

export interface ImportCommitResult {
  imported: number;
  summary: {
    income: number;
    expense: number;
    balance: number;
  };
}

export interface ImportHistorySummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  income: number;
  expense: number;
  imported: number;
}

export interface ImportHistoryItem {
  id: string;
  createdAt: string;
  expiresAt: string;
  committedAt: string | null;
  summary: ImportHistorySummary;
}

export interface ImportHistoryPagination {
  limit: number;
  offset: number;
}

export interface ImportHistoryResponse {
  items: ImportHistoryItem[];
  pagination: ImportHistoryPagination;
}

export interface ImportHistoryOptions {
  limit?: number;
  offset?: number;
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

interface ImportDryRunApiResponse {
  importId?: unknown;
  expiresAt?: unknown;
  summary?: {
    totalRows?: unknown;
    validRows?: unknown;
    invalidRows?: unknown;
    income?: unknown;
    expense?: unknown;
  };
  rows?: Array<{
    line?: unknown;
    status?: unknown;
    raw?: {
      date?: unknown;
      type?: unknown;
      value?: unknown;
      description?: unknown;
      notes?: unknown;
      category?: unknown;
    };
    normalized?: {
      date?: unknown;
      type?: unknown;
      value?: unknown;
      description?: unknown;
      notes?: unknown;
      categoryId?: unknown;
    } | null;
    errors?: Array<{
      field?: unknown;
      message?: unknown;
    }>;
  }>;
}

interface ImportCommitApiResponse {
  imported?: unknown;
  summary?: {
    income?: unknown;
    expense?: unknown;
    balance?: unknown;
  };
}

interface ImportHistoryApiResponse {
  items?: Array<{
    id?: unknown;
    createdAt?: unknown;
    expiresAt?: unknown;
    committedAt?: unknown;
    summary?: {
      totalRows?: unknown;
      validRows?: unknown;
      invalidRows?: unknown;
      income?: unknown;
      expense?: unknown;
      imported?: unknown;
    };
  }>;
  pagination?: {
    limit?: unknown;
    offset?: unknown;
  };
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
  dryRunImportCsv: async (file: File): Promise<ImportDryRunResult> => {
    const formData = new FormData();
    formData.append("file", file);

    const { data } = await api.post("/transactions/import/dry-run", formData);
    const responseBody = data as ImportDryRunApiResponse;
    const rows = Array.isArray(responseBody.rows)
      ? responseBody.rows.map((row) => {
          const normalizedStatus: ImportDryRunRow["status"] =
            row?.status === "valid" ? "valid" : "invalid";
          const numericLine = Number(row?.line);
          const normalized = row?.normalized;
          const normalizedType = String(normalized?.type || "").trim();
          const numericNormalizedCategoryId = Number(normalized?.categoryId);

          return {
            line: Number.isInteger(numericLine) && numericLine >= 2 ? numericLine : 0,
            status: normalizedStatus,
            raw: {
              date: String(row?.raw?.date || ""),
              type: String(row?.raw?.type || ""),
              value: String(row?.raw?.value || ""),
              description: String(row?.raw?.description || ""),
              notes: String(row?.raw?.notes || ""),
              category: String(row?.raw?.category || ""),
            },
            normalized:
              normalized && (normalizedType === "Entrada" || normalizedType === "Saida")
                ? {
                    date: String(normalized.date || ""),
                    type: normalizedType as TransactionType,
                    value: Number(normalized.value) || 0,
                    description: String(normalized.description || ""),
                    notes: String(normalized.notes || ""),
                    categoryId:
                      Number.isInteger(numericNormalizedCategoryId) &&
                      numericNormalizedCategoryId > 0
                        ? numericNormalizedCategoryId
                        : null,
                  }
                : null,
            errors: Array.isArray(row?.errors)
              ? row.errors.map((error) => ({
                  field: String(error?.field || ""),
                  message: String(error?.message || ""),
                }))
              : [],
          };
        })
      : [];

    return {
      importId: String(responseBody.importId || ""),
      expiresAt: String(responseBody.expiresAt || ""),
      summary: {
        totalRows: Number(responseBody.summary?.totalRows) || 0,
        validRows: Number(responseBody.summary?.validRows) || 0,
        invalidRows: Number(responseBody.summary?.invalidRows) || 0,
        income: Number(responseBody.summary?.income) || 0,
        expense: Number(responseBody.summary?.expense) || 0,
      },
      rows,
    };
  },
  commitImportCsv: async (importId: string): Promise<ImportCommitResult> => {
    const { data } = await api.post("/transactions/import/commit", { importId });
    const responseBody = data as ImportCommitApiResponse;

    return {
      imported: Number(responseBody.imported) || 0,
      summary: {
        income: Number(responseBody.summary?.income) || 0,
        expense: Number(responseBody.summary?.expense) || 0,
        balance: Number(responseBody.summary?.balance) || 0,
      },
    };
  },
  getImportHistory: async (options: ImportHistoryOptions = {}): Promise<ImportHistoryResponse> => {
    const fallbackLimit =
      Number.isInteger(options.limit) && (options.limit as number) > 0 ? (options.limit as number) : 20;
    const fallbackOffset =
      Number.isInteger(options.offset) && (options.offset as number) >= 0
        ? (options.offset as number)
        : 0;
    const { data } = await api.get("/transactions/imports", {
      params: {
        limit: fallbackLimit,
        offset: fallbackOffset,
      },
    });
    const responseBody = data as ImportHistoryApiResponse;
    const items = Array.isArray(responseBody.items)
      ? responseBody.items.map((item) => ({
          id: String(item?.id || ""),
          createdAt: String(item?.createdAt || ""),
          expiresAt: String(item?.expiresAt || ""),
          committedAt:
            typeof item?.committedAt === "string" && item.committedAt.trim()
              ? item.committedAt
              : null,
          summary: {
            totalRows: Number(item?.summary?.totalRows) || 0,
            validRows: Number(item?.summary?.validRows) || 0,
            invalidRows: Number(item?.summary?.invalidRows) || 0,
            income: Number(item?.summary?.income) || 0,
            expense: Number(item?.summary?.expense) || 0,
            imported: Number(item?.summary?.imported) || 0,
          },
        }))
      : [];
    const responseLimit = Number(responseBody.pagination?.limit);
    const responseOffset = Number(responseBody.pagination?.offset);

    return {
      items: items.filter((item) => Boolean(item.id)),
      pagination: {
        limit: Number.isInteger(responseLimit) && responseLimit > 0 ? responseLimit : fallbackLimit,
        offset:
          Number.isInteger(responseOffset) && responseOffset >= 0
            ? responseOffset
            : fallbackOffset,
      },
    };
  },
};
