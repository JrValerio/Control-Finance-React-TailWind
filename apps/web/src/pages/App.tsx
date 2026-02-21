import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Modal from "../components/Modal";
import ImportCsvModal from "../components/ImportCsvModal";
import ImportHistoryModal from "../components/ImportHistoryModal";
import TransactionList from "../components/TransactionList";
import {
  transactionsService,
  type CategoryOption,
  type MonthlyBudget,
  type MonthlyBudgetStatus,
  type MonthlySummary,
  type Transaction,
  type TransactionType,
} from "../services/transactions.service";
import {
  CATEGORY_ALL,
  CATEGORY_ENTRY,
  CATEGORY_EXIT,
  isValidISODate,
  PERIOD_ALL,
  PERIOD_CUSTOM,
  PERIOD_LAST_30_DAYS,
  PERIOD_LAST_7_DAYS,
  PERIOD_TODAY,
  getTodayISODate,
  normalizeTransactionDate,
  resolvePeriodRange,
} from "../components/DatabaseUtils";

const TransactionChart = lazy(() => import("../components/TransactionChart"));

type SelectedCategory = "Todos" | TransactionType;
type SelectedPeriod =
  | "Todo periodo"
  | "Hoje"
  | "Ultimos 7 dias"
  | "Ultimos 30 dias"
  | "Personalizado";
type FilterPresetId = "this-month" | "clear";
type RemovableChipId = "q" | "type" | "period" | "category" | "sort";
type SummaryMetricKey = "income" | "expense" | "balance";
type MonthOverMonthDirection = "up" | "down" | "flat";
type MonthOverMonthTone = "good" | "bad" | "neutral";
type BudgetAlertStatus = Exclude<MonthlyBudgetStatus, "ok">;

interface FilterState {
  selectedCategory: SelectedCategory;
  selectedPeriod: SelectedPeriod;
  selectedSort: string;
  selectedQuery: string;
  selectedTransactionCategoryId: string;
  customStartDate: string;
  customEndDate: string;
}

interface PaginationState {
  page: number;
  limit: number;
  offset: number;
}

interface PaginationMeta extends PaginationState {
  total: number;
  totalPages: number;
}

interface UndoState {
  transactionId: number;
}

interface BudgetFormState {
  categoryId: string;
  amount: string;
}

interface AppliedChip {
  id: RemovableChipId;
  text: string;
  removable: boolean;
  removeLabel: string;
}

interface TransactionWithCategoryName extends Transaction {
  categoryName: string;
}

interface TransactionModalPayload {
  value: number;
  type: TransactionType;
  categoryId: number | null;
  date: string;
  description: string;
  notes: string;
}

interface MonthOverMonthMetric {
  delta: number;
  deltaPercent: number | null;
  direction: MonthOverMonthDirection;
  tone: MonthOverMonthTone;
}

interface ApiLikeError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

interface AppProps {
  onLogout?: () => void;
  onOpenCategoriesSettings?: () => void;
}

const PERIOD_OPTIONS = [
  PERIOD_ALL,
  PERIOD_TODAY,
  PERIOD_LAST_7_DAYS,
  PERIOD_LAST_30_DAYS,
  PERIOD_CUSTOM,
];
const SORT_OPTIONS = [
  { value: "date:asc", label: "Data (mais antigas)" },
  { value: "date:desc", label: "Data (mais recentes)" },
  { value: "amount:desc", label: "Valor (maior)" },
  { value: "amount:asc", label: "Valor (menor)" },
  { value: "description:asc", label: "Descricao (A-Z)" },
  { value: "description:desc", label: "Descricao (Z-A)" },
];
const FILTER_PRESETS = [
  { id: "this-month", label: "Este mes" },
] as const;
const FILTER_BUTTON_LABELS: Record<SelectedCategory, string> = {
  Todos: "Todas",
  Entrada: "Entradas",
  Saida: "Saidas",
};
const FILTER_BUTTON_ARIA_LABELS: Record<SelectedCategory, string> = {
  Todos: "Filtrar todas",
  Entrada: "Filtrar entradas",
  Saida: "Filtrar saidas",
};
const SORT_OPTION_VALUES = new Set(SORT_OPTIONS.map((option) => option.value));
const DEFAULT_SORT = "date:asc";
const DEFAULT_OFFSET = 0;
const DEFAULT_LIMIT = 20;
const MOBILE_HEADER_ACTIONS_BREAKPOINT = 420;
const MOBILE_FILTERS_BREAKPOINT = 640;
const MOBILE_ACTIONS_MENU_ID = "mobile-header-actions-menu";
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const PAGE_SIZE_STORAGE_KEY = "control_finance.page_size";
const DEFAULT_MONTHLY_SUMMARY: MonthlySummary = {
  month: "",
  income: 0,
  expense: 0,
  balance: 0,
  byCategory: [],
};
const MONTH_VALUE_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const MOM_TONE_CLASSNAMES: Record<MonthOverMonthTone, string> = {
  good: "text-green-200",
  bad: "text-red-200",
  neutral: "text-gray-200",
};
const DEFAULT_MONTHLY_BUDGETS: MonthlyBudget[] = [];
const DEFAULT_BUDGET_FORM: BudgetFormState = {
  categoryId: "",
  amount: "",
};
const BUDGET_STATUS_LABELS: Record<MonthlyBudgetStatus, string> = {
  ok: "Dentro da meta",
  near_limit: "Proximo do limite",
  exceeded: "Acima da meta",
};
const BUDGET_STATUS_BADGE_CLASSNAMES: Record<MonthlyBudgetStatus, string> = {
  ok: "border-green-200 bg-green-50 text-green-700",
  near_limit: "border-amber-200 bg-amber-50 text-amber-700",
  exceeded: "border-red-200 bg-red-50 text-red-700",
};
const BUDGET_STATUS_BAR_CLASSNAMES: Record<MonthlyBudgetStatus, string> = {
  ok: "bg-green-500",
  near_limit: "bg-amber-500",
  exceeded: "bg-red-500",
};
const BUDGET_ALERT_SEVERITY: Record<BudgetAlertStatus, number> = {
  near_limit: 1,
  exceeded: 2,
};
const isSelectedPeriod = (value: string | null): value is SelectedPeriod =>
  value === PERIOD_ALL ||
  value === PERIOD_TODAY ||
  value === PERIOD_LAST_7_DAYS ||
  value === PERIOD_LAST_30_DAYS ||
  value === PERIOD_CUSTOM;

const getCurrentMonth = () => getTodayISODate().slice(0, 7);
const getPreviousMonth = (monthValue: string): string => {
  if (!MONTH_VALUE_REGEX.test(String(monthValue || "").trim())) {
    return getCurrentMonth();
  }

  const [yearPart, monthPart] = monthValue.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const previousMonthDate = new Date(year, month - 2, 1);
  const normalizedMonth = String(previousMonthDate.getMonth() + 1).padStart(2, "0");

  return `${previousMonthDate.getFullYear()}-${normalizedMonth}`;
};
const getCurrentMonthRange = (referenceDate = new Date()) => {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);

  return {
    startDate: getTodayISODate(startDate),
    endDate: getTodayISODate(endDate),
  };
};
const getMonthRange = (monthValue: string) => {
  if (!MONTH_VALUE_REGEX.test(String(monthValue || "").trim())) {
    return getCurrentMonthRange();
  }

  const [yearPart, monthPart] = monthValue.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  return getCurrentMonthRange(new Date(year, month - 1, 1));
};

const parseIntegerInRange = (
  value: string | null | undefined,
  { min, max }: { min: number; max: number },
) => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < min || parsedValue > max) {
    return null;
  }

  return parsedValue;
};

const normalizeSortOption = (value: string | null | undefined): string => {
  if (typeof value !== "string") {
    return DEFAULT_SORT;
  }

  const normalizedValue = value.trim().toLowerCase();
  return SORT_OPTION_VALUES.has(normalizedValue) ? normalizedValue : DEFAULT_SORT;
};

const getInitialFilterState = (): FilterState => {
  if (typeof window === "undefined") {
    return {
      selectedCategory: CATEGORY_ALL,
      selectedPeriod: PERIOD_ALL,
      selectedSort: DEFAULT_SORT,
      selectedQuery: "",
      selectedTransactionCategoryId: "",
      customStartDate: "",
      customEndDate: "",
    };
  }

  const params = new URLSearchParams(window.location.search);
  const queryType = params.get("type");
  const queryPeriod = params.get("period");
  const queryFrom = params.get("from");
  const queryTo = params.get("to");
  const querySort = normalizeSortOption(params.get("sort"));
  const queryValue = params.get("q");
  const querySearch = typeof queryValue === "string" ? queryValue.trim() : "";
  const queryCategoryId = parseIntegerInRange(params.get("categoryId"), {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  });

  const selectedCategory =
    queryType === CATEGORY_ENTRY || queryType === CATEGORY_EXIT ? queryType : CATEGORY_ALL;
  let selectedPeriod: SelectedPeriod = isSelectedPeriod(queryPeriod) ? queryPeriod : PERIOD_ALL;
  const customStartDate = isValidISODate(queryFrom) ? queryFrom : "";
  const customEndDate = isValidISODate(queryTo) ? queryTo : "";

  if (selectedPeriod === PERIOD_ALL && (customStartDate || customEndDate)) {
    selectedPeriod = PERIOD_CUSTOM;
  }

  return {
    selectedCategory,
    selectedPeriod,
    selectedSort: querySort,
    selectedQuery: querySearch,
    selectedTransactionCategoryId: queryCategoryId ? String(queryCategoryId) : "",
    customStartDate: selectedPeriod === PERIOD_CUSTOM ? customStartDate : "",
    customEndDate: selectedPeriod === PERIOD_CUSTOM ? customEndDate : "",
  };
};

const getApiErrorMessage = (error: unknown, fallbackMessage: string): string => {
  const normalizedError = error as ApiLikeError;
  return normalizedError?.response?.data?.message || normalizedError?.message || fallbackMessage;
};

const normalizeTransactions = (transactions: unknown): Transaction[] => {
  if (!Array.isArray(transactions)) {
    return [];
  }

  const fallbackDate = getTodayISODate();

  return transactions
    .map((transaction) => ({
      id: Number(transaction.id),
      value: Number(transaction.value),
      type: transaction.type,
      categoryId: Number.isInteger(Number(transaction.categoryId))
        ? Number(transaction.categoryId)
        : null,
      date: normalizeTransactionDate(transaction.date, fallbackDate),
      description: typeof transaction.description === "string" ? transaction.description : "",
      notes: typeof transaction.notes === "string" ? transaction.notes : "",
    }))
    .filter(
      (transaction) =>
        Number.isFinite(transaction.id) &&
        Number.isFinite(transaction.value) &&
        [CATEGORY_ENTRY, CATEGORY_EXIT].includes(transaction.type),
    );
};

const downloadBlobFile = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = objectUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(objectUrl);
};

const getInitialPageSize = (): number => {
  if (typeof window === "undefined") {
    return DEFAULT_LIMIT;
  }

  const queryLimit = parseIntegerInRange(new URLSearchParams(window.location.search).get("limit"), {
    min: 1,
    max: 100,
  });

  if (PAGE_SIZE_OPTIONS.includes(queryLimit)) {
    return queryLimit;
  }

  const storedPageSize = Number.parseInt(
    window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY) || "",
    10,
  );

  if (PAGE_SIZE_OPTIONS.includes(storedPageSize)) {
    return storedPageSize;
  }

  return DEFAULT_LIMIT;
};

const getInitialOffset = (): number => {
  if (typeof window === "undefined") {
    return DEFAULT_OFFSET;
  }

  const queryOffset = parseIntegerInRange(new URLSearchParams(window.location.search).get("offset"), {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  });

  return queryOffset ?? DEFAULT_OFFSET;
};

const getPageFromOffset = (offset: number, limit: number) => {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : DEFAULT_OFFSET;
  return Math.floor(safeOffset / safeLimit) + 1;
};

const getInitialPaginationState = (): PaginationState => {
  const limit = getInitialPageSize();
  const offset = getInitialOffset();

  return {
    limit,
    offset,
    page: getPageFromOffset(offset, limit),
  };
};

const formatCurrency = (value: number) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatPercentage = (value: number) => `${Number(value || 0).toFixed(2)}%`;
const formatSignedCurrency = (value: number) => {
  if (value > 0) {
    return `+${formatCurrency(value)}`;
  }

  if (value < 0) {
    return `-${formatCurrency(Math.abs(value))}`;
  }

  return formatCurrency(0);
};
const formatSignedPercentage = (value: number | null) => {
  if (value === null) {
    return "—";
  }

  const normalizedValue = Number(value) || 0;
  const prefix = normalizedValue > 0 ? "+" : "";
  return `${prefix}${normalizedValue.toFixed(1)}%`;
};
const isCompactHeaderActionsMode = (): boolean =>
  typeof window !== "undefined" && window.innerWidth < MOBILE_HEADER_ACTIONS_BREAKPOINT;
const isCompactFiltersPanelMode = (): boolean =>
  typeof window !== "undefined" && window.innerWidth < MOBILE_FILTERS_BREAKPOINT;
const normalizeMonthlySummary = (summary: MonthlySummary, fallbackMonth: string): MonthlySummary => ({
  month: summary?.month || fallbackMonth,
  income: Number(summary?.income) || 0,
  expense: Number(summary?.expense) || 0,
  balance: Number(summary?.balance) || 0,
  byCategory: Array.isArray(summary?.byCategory) ? summary.byCategory : [],
});
const calculateMonthOverMonthMetric = (
  metricKey: SummaryMetricKey,
  currentValue: number,
  previousValue: number,
): MonthOverMonthMetric => {
  const normalizedCurrent = Number(currentValue) || 0;
  const normalizedPrevious = Number(previousValue) || 0;
  const delta = normalizedCurrent - normalizedPrevious;
  const direction: MonthOverMonthDirection = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const deltaPercent =
    normalizedPrevious === 0
      ? normalizedCurrent === 0
        ? 0
        : null
      : (delta / normalizedPrevious) * 100;

  let tone: MonthOverMonthTone = "neutral";

  if (direction !== "flat") {
    if (metricKey === "expense") {
      tone = direction === "down" ? "good" : "bad";
    } else {
      tone = direction === "up" ? "good" : "bad";
    }
  }

  return {
    delta,
    deltaPercent,
    direction,
    tone,
  };
};
const hasInitialActiveFilters = (filters: FilterState): boolean =>
  filters.selectedCategory !== CATEGORY_ALL ||
  filters.selectedPeriod !== PERIOD_ALL ||
  Boolean(filters.selectedTransactionCategoryId) ||
  Boolean(filters.selectedQuery);

const App = ({
  onLogout = undefined,
  onOpenCategoriesSettings = undefined,
}: AppProps): JSX.Element => {
  const initialFilterState = useMemo(() => getInitialFilterState(), []);
  const initialFiltersAreActive = useMemo(
    () => hasInitialActiveFilters(initialFilterState),
    [initialFilterState],
  );
  const initialPaginationState = useMemo(() => getInitialPaginationState(), []);
  const listSectionRef = useRef<HTMLElement | null>(null);
  const filtersPanelRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileActionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const firstMobileActionsItemRef = useRef<HTMLButtonElement | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory>(
    initialFilterState.selectedCategory,
  );
  const [selectedPeriod, setSelectedPeriod] = useState<SelectedPeriod>(initialFilterState.selectedPeriod);
  const [selectedSort, setSelectedSort] = useState(initialFilterState.selectedSort || DEFAULT_SORT);
  const [selectedQuery, setSelectedQuery] = useState(initialFilterState.selectedQuery || "");
  const [queryInput, setQueryInput] = useState(initialFilterState.selectedQuery || "");
  const [selectedTransactionCategoryId, setSelectedTransactionCategoryId] = useState(
    initialFilterState.selectedTransactionCategoryId,
  );
  const [selectedSummaryMonth, setSelectedSummaryMonth] = useState(() => getCurrentMonth());
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [hasLoadedCategories, setHasLoadedCategories] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(initialFilterState.customStartDate);
  const [customEndDate, setCustomEndDate] = useState(initialFilterState.customEndDate);
  const [currentOffset, setCurrentOffset] = useState(initialPaginationState.offset);
  const [pageSize, setPageSize] = useState(initialPaginationState.limit);
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta>(() => ({
    page: initialPaginationState.page,
    limit: initialPaginationState.limit,
    offset: initialPaginationState.offset,
    total: 0,
    totalPages: 1,
  }));
  const [isModalOpen, setModalOpen] = useState(false);
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [isImportHistoryModalOpen, setImportHistoryModalOpen] = useState(false);
  const [isMobileActionsMenuOpen, setMobileActionsMenuOpen] = useState(false);
  const [useMobileActionsMenu, setUseMobileActionsMenu] = useState(() =>
    isCompactHeaderActionsMode(),
  );
  const [isMobileFiltersPanel, setIsMobileFiltersPanel] = useState(() =>
    isCompactFiltersPanelMode(),
  );
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(() =>
    !isCompactFiltersPanelMode() || initialFiltersAreActive,
  );
  const [isBudgetModalOpen, setBudgetModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithCategoryName | null>(null);
  const [editingBudget, setEditingBudget] = useState<MonthlyBudget | null>(null);
  const [budgetForm, setBudgetForm] = useState<BudgetFormState>(DEFAULT_BUDGET_FORM);
  const [pendingDeleteTransactionId, setPendingDeleteTransactionId] = useState<number | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setLoadingTransactions] = useState(false);
  const [isLoadingSummary, setLoadingSummary] = useState(false);
  const [isExportingCsv, setExportingCsv] = useState(false);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>(DEFAULT_MONTHLY_SUMMARY);
  const [previousMonthlySummary, setPreviousMonthlySummary] = useState<MonthlySummary>(() => ({
    ...DEFAULT_MONTHLY_SUMMARY,
    month: getPreviousMonth(getCurrentMonth()),
  }));
  const [monthlyBudgets, setMonthlyBudgets] = useState<MonthlyBudget[]>(DEFAULT_MONTHLY_BUDGETS);
  const [summaryError, setSummaryError] = useState("");
  const [momError, setMomError] = useState("");
  const [budgetsError, setBudgetsError] = useState("");
  const [budgetSuccessMessage, setBudgetSuccessMessage] = useState("");
  const [budgetMutationError, setBudgetMutationError] = useState("");
  const [isSavingBudget, setSavingBudget] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [modalRequestError, setModalRequestError] = useState("");
  const [isLoadingBudgets, setLoadingBudgets] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const budgetSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const periodRange = useMemo(
    () =>
      resolvePeriodRange(selectedPeriod, {
        startDate: customStartDate,
        endDate: customEndDate,
      }),
    [selectedPeriod, customStartDate, customEndDate],
  );

  const clearUndoState = useCallback(() => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    setUndoState(null);
  }, []);

  const scheduleUndo = useCallback(
    (transactionId: number) => {
      clearUndoState();
      setUndoState({ transactionId });
      undoTimeoutRef.current = setTimeout(() => {
        undoTimeoutRef.current = null;
        setUndoState(null);
      }, 10000);
    },
    [clearUndoState],
  );

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }

      if (budgetSuccessTimeoutRef.current) {
        clearTimeout(budgetSuccessTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncMobileActionsMode = () => {
      setUseMobileActionsMenu(isCompactHeaderActionsMode());
    };

    syncMobileActionsMode();
    window.addEventListener("resize", syncMobileActionsMode);

    return () => {
      window.removeEventListener("resize", syncMobileActionsMode);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncMobileFiltersMode = () => {
      const isMobileMode = isCompactFiltersPanelMode();
      setIsMobileFiltersPanel(isMobileMode);

      if (!isMobileMode) {
        setIsFiltersPanelOpen(true);
      }
    };

    syncMobileFiltersMode();
    window.addEventListener("resize", syncMobileFiltersMode);

    return () => {
      window.removeEventListener("resize", syncMobileFiltersMode);
    };
  }, []);

  useEffect(() => {
    if (!useMobileActionsMenu && isMobileActionsMenuOpen) {
      setMobileActionsMenuOpen(false);
    }
  }, [isMobileActionsMenuOpen, useMobileActionsMenu]);

  useEffect(() => {
    if (!isMobileActionsMenuOpen || typeof window === "undefined") {
      return undefined;
    }

    const handleWindowMouseDown = (event: MouseEvent) => {
      const eventTarget = event.target as Node | null;

      if (
        mobileActionsMenuRef.current?.contains(eventTarget) ||
        mobileActionsButtonRef.current?.contains(eventTarget)
      ) {
        return;
      }

      setMobileActionsMenuOpen(false);
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileActionsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handleWindowMouseDown);
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("mousedown", handleWindowMouseDown);
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [isMobileActionsMenuOpen]);

  useEffect(() => {
    if (!isMobileActionsMenuOpen) {
      return;
    }

    const focusFirstMenuItem = () => {
      firstMobileActionsItemRef.current?.focus();
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(focusFirstMenuItem);
      return;
    }

    focusFirstMenuItem();
  }, [isMobileActionsMenuOpen]);

  const clearBudgetSuccessMessage = useCallback(() => {
    if (budgetSuccessTimeoutRef.current) {
      clearTimeout(budgetSuccessTimeoutRef.current);
      budgetSuccessTimeoutRef.current = null;
    }

    setBudgetSuccessMessage("");
  }, []);

  const showBudgetSuccessMessage = useCallback(
    (message: string) => {
      clearBudgetSuccessMessage();
      setBudgetSuccessMessage(message);
      budgetSuccessTimeoutRef.current = setTimeout(() => {
        budgetSuccessTimeoutRef.current = null;
        setBudgetSuccessMessage("");
      }, 2500);
    },
    [clearBudgetSuccessMessage],
  );

  const loadCategories = useCallback(async () => {
    try {
      const categoryOptions = await transactionsService.listCategories();
      setCategories(Array.isArray(categoryOptions) ? categoryOptions : []);
      setHasLoadedCategories(true);
    } catch {
      setCategories([]);
      setHasLoadedCategories(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const loadMonthlySummary = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError("");
    setMomError("");
    const previousSummaryMonth = getPreviousMonth(selectedSummaryMonth);

    const [currentSummaryResult, previousSummaryResult] = await Promise.allSettled([
      transactionsService.getMonthlySummary(selectedSummaryMonth),
      transactionsService.getMonthlySummary(previousSummaryMonth),
    ]);

    if (currentSummaryResult.status === "fulfilled") {
      setMonthlySummary(normalizeMonthlySummary(currentSummaryResult.value, selectedSummaryMonth));
    } else {
      setMonthlySummary({
        ...DEFAULT_MONTHLY_SUMMARY,
        month: selectedSummaryMonth,
      });
      setSummaryError(
        getApiErrorMessage(currentSummaryResult.reason, "Nao foi possivel carregar o resumo mensal."),
      );
    }

    if (previousSummaryResult.status === "fulfilled") {
      setPreviousMonthlySummary(
        normalizeMonthlySummary(previousSummaryResult.value, previousSummaryMonth),
      );
    } else {
      setPreviousMonthlySummary({
        ...DEFAULT_MONTHLY_SUMMARY,
        month: previousSummaryMonth,
      });
      setMomError(
        getApiErrorMessage(previousSummaryResult.reason, "Comparacao mensal indisponivel."),
      );
    }

    setLoadingSummary(false);
  }, [selectedSummaryMonth]);

  useEffect(() => {
    loadMonthlySummary();
  }, [loadMonthlySummary]);

  const loadMonthlyBudgets = useCallback(async () => {
    setLoadingBudgets(true);
    setBudgetsError("");

    try {
      const budgets = await transactionsService.getMonthlyBudgets(selectedSummaryMonth);
      setMonthlyBudgets(Array.isArray(budgets) ? budgets : []);
    } catch (error) {
      setMonthlyBudgets(DEFAULT_MONTHLY_BUDGETS);
      setBudgetsError(getApiErrorMessage(error, "Nao foi possivel carregar as metas mensais."));
    } finally {
      setLoadingBudgets(false);
    }
  }, [selectedSummaryMonth]);

  useEffect(() => {
    loadMonthlyBudgets();
  }, [loadMonthlyBudgets]);

  const openCreateBudgetModal = () => {
    setEditingBudget(null);
    setBudgetForm(DEFAULT_BUDGET_FORM);
    setBudgetMutationError("");
    setBudgetModalOpen(true);
  };

  const openEditBudgetModal = (budget: MonthlyBudget) => {
    setEditingBudget(budget);
    setBudgetForm({
      categoryId: String(budget?.categoryId || ""),
      amount: String(budget?.budget ?? ""),
    });
    setBudgetMutationError("");
    setBudgetModalOpen(true);
  };

  const closeBudgetModal = () => {
    if (isSavingBudget) {
      return;
    }

    setBudgetModalOpen(false);
    setEditingBudget(null);
    setBudgetForm(DEFAULT_BUDGET_FORM);
    setBudgetMutationError("");
  };

  const handleSaveBudget = async () => {
    const categoryId = Number.parseInt(String(budgetForm.categoryId || ""), 10);
    const amount = Number(budgetForm.amount);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      setBudgetMutationError("Selecione uma categoria valida.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setBudgetMutationError("Informe um valor de meta maior que zero.");
      return;
    }

    setSavingBudget(true);
    setBudgetMutationError("");
    clearBudgetSuccessMessage();

    try {
      await transactionsService.createOrUpdateMonthlyBudget({
        categoryId,
        month: selectedSummaryMonth,
        amount,
      });
      await loadMonthlyBudgets();
      setBudgetModalOpen(false);
      setEditingBudget(null);
      setBudgetForm(DEFAULT_BUDGET_FORM);
      showBudgetSuccessMessage("Meta salva com sucesso.");
    } catch (error) {
      setBudgetMutationError(getApiErrorMessage(error, "Nao foi possivel salvar a meta."));
    } finally {
      setSavingBudget(false);
    }
  };

  const handleDeleteBudget = async (budget: MonthlyBudget) => {
    const confirmationMessage = `Excluir meta de "${budget.categoryName}"?`;
    // In non-browser test environments, skip native confirm prompt.
    const isConfirmed = typeof window === "undefined" ? true : window.confirm(confirmationMessage);

    if (!isConfirmed) {
      return;
    }

    setBudgetsError("");
    clearBudgetSuccessMessage();

    try {
      await transactionsService.deleteMonthlyBudget(budget.id);
      await loadMonthlyBudgets();
      showBudgetSuccessMessage("Meta removida.");
    } catch (error) {
      setBudgetsError(getApiErrorMessage(error, "Nao foi possivel remover a meta."));
    }
  };

  const loadTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    setRequestError("");

    try {
      const response = await transactionsService.listPage({
        limit: pageSize,
        offset: currentOffset,
        sort: selectedSort,
        ...(selectedQuery ? { q: selectedQuery } : {}),
        from: periodRange.startDate || undefined,
        to: periodRange.endDate || undefined,
        type:
          selectedCategory !== CATEGORY_ALL
            ? (selectedCategory as TransactionType)
            : undefined,
        categoryId: selectedTransactionCategoryId
          ? Number(selectedTransactionCategoryId)
          : undefined,
      });

      setTransactions(normalizeTransactions(response.data));
      setPaginationMeta({
        page: response.meta.page,
        limit: response.meta.limit,
        offset: response.meta.offset,
        total: response.meta.total,
        totalPages: response.meta.totalPages,
      });
    } catch (error) {
      setTransactions([]);
      const fallbackPage = getPageFromOffset(currentOffset, pageSize);
      setPaginationMeta({
        page: fallbackPage,
        limit: pageSize,
        offset: currentOffset,
        total: 0,
        totalPages: 1,
      });
      setRequestError(getApiErrorMessage(error, "Nao foi possivel carregar as transacoes."));
    } finally {
      setLoadingTransactions(false);
    }
  }, [
    currentOffset,
    pageSize,
    periodRange,
    selectedCategory,
    selectedQuery,
    selectedSort,
    selectedTransactionCategoryId,
  ]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const maxOffset =
      paginationMeta.total > 0
        ? Math.max((paginationMeta.totalPages - 1) * paginationMeta.limit, 0)
        : 0;

    if (currentOffset > maxOffset) {
      setCurrentOffset(maxOffset);
    }
  }, [currentOffset, paginationMeta.limit, paginationMeta.total, paginationMeta.totalPages]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("limit", String(pageSize));
    params.set("offset", String(currentOffset));
    params.set("sort", selectedSort);

    if (selectedQuery) {
      params.set("q", selectedQuery);
    } else {
      params.delete("q");
    }

    if (selectedCategory !== CATEGORY_ALL) {
      params.set("type", selectedCategory);
    } else {
      params.delete("type");
    }

    if (selectedTransactionCategoryId) {
      params.set("categoryId", selectedTransactionCategoryId);
    } else {
      params.delete("categoryId");
    }

    if (selectedPeriod !== PERIOD_ALL) {
      params.set("period", selectedPeriod);
    } else {
      params.delete("period");
    }

    if (selectedPeriod === PERIOD_CUSTOM && customStartDate) {
      params.set("from", customStartDate);
    } else {
      params.delete("from");
    }

    if (selectedPeriod === PERIOD_CUSTOM && customEndDate) {
      params.set("to", customEndDate);
    } else {
      params.delete("to");
    }

    const nextSearch = params.toString();
    const currentSearch = window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : window.location.search;

    if (nextSearch !== currentSearch) {
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      window.history.replaceState(null, "", nextUrl);
    }
  }, [
    currentOffset,
    customEndDate,
    customStartDate,
    pageSize,
    selectedCategory,
    selectedPeriod,
    selectedQuery,
    selectedSort,
    selectedTransactionCategoryId,
  ]);

  const filteredTransactions = useMemo(() => {
    return transactions;
  }, [transactions]);

  const categoryNameById = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => {
      map.set(Number(category.id), category.name);
    });
    return map;
  }, [categories]);

  const transactionsWithCategoryName = useMemo(() => {
    return filteredTransactions.map((transaction) => ({
      ...transaction,
      categoryName:
        transaction.categoryId === null
          ? "Sem categoria"
          : categoryNameById.get(transaction.categoryId) || "Categoria removida",
    }));
  }, [categoryNameById, filteredTransactions]);

  const chartData = useMemo(() => {
    return [
      { name: "Entradas", total: monthlySummary.income },
      { name: "Saidas", total: monthlySummary.expense },
    ];
  }, [monthlySummary.expense, monthlySummary.income]);

  const summaryByCategoryExpenses = useMemo(() => {
    if (!Array.isArray(monthlySummary.byCategory)) {
      return [];
    }

    return monthlySummary.byCategory
      .map((categoryItem) => {
        const normalizedCategoryId = Number(categoryItem?.categoryId);
        const normalizedExpense = Number(categoryItem?.expense);
        const normalizedCategoryName =
          typeof categoryItem?.categoryName === "string" &&
          categoryItem.categoryName.trim()
            ? categoryItem.categoryName.trim()
            : "Sem categoria";

        return {
          categoryId:
            Number.isInteger(normalizedCategoryId) && normalizedCategoryId > 0
              ? normalizedCategoryId
              : null,
          categoryName: normalizedCategoryName,
          expense: Number.isFinite(normalizedExpense) ? normalizedExpense : 0,
        };
      })
      .filter((categoryItem) => categoryItem.expense > 0);
  }, [monthlySummary.byCategory]);

  const monthOverMonthMetrics = useMemo(
    () => ({
      balance: calculateMonthOverMonthMetric(
        "balance",
        monthlySummary.balance,
        previousMonthlySummary.balance,
      ),
      income: calculateMonthOverMonthMetric(
        "income",
        monthlySummary.income,
        previousMonthlySummary.income,
      ),
      expense: calculateMonthOverMonthMetric(
        "expense",
        monthlySummary.expense,
        previousMonthlySummary.expense,
      ),
    }),
    [
      monthlySummary.balance,
      monthlySummary.expense,
      monthlySummary.income,
      previousMonthlySummary.balance,
      previousMonthlySummary.expense,
      previousMonthlySummary.income,
    ],
  );
  const budgetAlerts = useMemo(
    () =>
      monthlyBudgets
        .filter(
          (budget): budget is MonthlyBudget & { status: BudgetAlertStatus } =>
            budget.status === "near_limit" || budget.status === "exceeded",
        )
        .sort((leftBudget, rightBudget) => {
          const severityDifference =
            BUDGET_ALERT_SEVERITY[rightBudget.status] - BUDGET_ALERT_SEVERITY[leftBudget.status];

          if (severityDifference !== 0) {
            return severityDifference;
          }

          return rightBudget.percentage - leftBudget.percentage;
        }),
    [monthlyBudgets],
  );

  const openCreateModal = () => {
    setEditingTransaction(null);
    setModalRequestError("");
    setModalOpen(true);
  };

  const openEditModal = (transaction: TransactionWithCategoryName) => {
    setEditingTransaction(transaction);
    setModalRequestError("");
    setModalOpen(true);
  };

  const handleSaveTransaction = async ({
    value,
    type,
    date,
    description,
    notes,
    categoryId,
  }: TransactionModalPayload) => {
    setRequestError("");
    setModalRequestError("");

    try {
      if (editingTransaction) {
        await transactionsService.update(editingTransaction.id, {
          value,
          type,
          category_id: categoryId,
          date,
          description,
          notes,
        });
      } else {
        await transactionsService.create({
          value,
          type,
          category_id: categoryId,
          date,
          description,
          notes,
        });
      }

      setEditingTransaction(null);
      setModalRequestError("");
      setModalOpen(false);
      await loadTransactions();
      await loadMonthlySummary();
      await loadMonthlyBudgets();
      await loadCategories();
    } catch (error) {
      const fallbackMessage = editingTransaction
        ? "Nao foi possivel atualizar a transacao."
        : "Nao foi possivel cadastrar a transacao.";
      const apiMessage = getApiErrorMessage(error, fallbackMessage);

      if (apiMessage === "Categoria nao encontrada.") {
        setModalRequestError(
          "A categoria selecionada foi removida. Escolha outra categoria ou use Sem categoria.",
        );
        return;
      }

      setModalRequestError(apiMessage);
    }
  };

  const requestDeleteTransaction = (id: number) => {
    setPendingDeleteTransactionId(id);
  };

  const closeDeleteDialog = () => {
    setPendingDeleteTransactionId(null);
  };

  const confirmDeleteTransaction = async () => {
    if (!pendingDeleteTransactionId) {
      return;
    }

    setRequestError("");

    try {
      await transactionsService.remove(pendingDeleteTransactionId);
      scheduleUndo(pendingDeleteTransactionId);
      setPendingDeleteTransactionId(null);
      await loadTransactions();
      await loadMonthlySummary();
      await loadMonthlyBudgets();
    } catch (error) {
      setRequestError(getApiErrorMessage(error, "Nao foi possivel excluir a transacao."));
    }
  };

  const restoreDeletedTransaction = async () => {
    if (!undoState?.transactionId) {
      return;
    }

    setRequestError("");

    try {
      await transactionsService.restore(undoState.transactionId);
      clearUndoState();
      await loadTransactions();
      await loadMonthlySummary();
      await loadMonthlyBudgets();
    } catch (error) {
      setRequestError(getApiErrorMessage(error, "Nao foi possivel desfazer a exclusao."));
    }
  };

  const handleExportCsv = async () => {
    setRequestError("");
    setExportingCsv(true);

    const exportFilters = {
      from: periodRange.startDate || undefined,
      to: periodRange.endDate || undefined,
      type:
        selectedCategory !== CATEGORY_ALL
          ? (selectedCategory as TransactionType)
          : undefined,
      categoryId: selectedTransactionCategoryId
        ? Number(selectedTransactionCategoryId)
        : undefined,
    };

    try {
      const exportResponse = await transactionsService.exportCsv(exportFilters);
      const csvBlob =
        exportResponse.blob instanceof Blob
          ? exportResponse.blob
          : new Blob([exportResponse.blob], { type: "text/csv;charset=utf-8" });
      const fallbackFileName = `transacoes-${getTodayISODate()}.csv`;

      downloadBlobFile(csvBlob, exportResponse.fileName || fallbackFileName);
    } catch (error) {
      setRequestError(getApiErrorMessage(error, "Nao foi possivel exportar o CSV."));
    } finally {
      setExportingCsv(false);
    }
  };

  const closeMobileActionsMenu = () => {
    setMobileActionsMenuOpen(false);
  };

  const toggleMobileActionsMenu = () => {
    setMobileActionsMenuOpen((previousState) => !previousState);
  };

  const handleExportCsvFromMenu = () => {
    closeMobileActionsMenu();
    void handleExportCsv();
  };

  const handleOpenImportModal = () => {
    closeMobileActionsMenu();
    setImportModalOpen(true);
  };

  const handleOpenImportHistoryModal = () => {
    closeMobileActionsMenu();
    setImportHistoryModalOpen(true);
  };

  const handleOpenCategoriesSettings = () => {
    closeMobileActionsMenu();
    onOpenCategoriesSettings?.();
  };

  const handleLogoutFromActionsMenu = () => {
    closeMobileActionsMenu();
    onLogout?.();
  };

  const handleImportCommitted = useCallback(async () => {
    await loadTransactions();
    await loadMonthlySummary();
    await loadMonthlyBudgets();
    setImportModalOpen(false);
  }, [loadMonthlyBudgets, loadMonthlySummary, loadTransactions]);

  const scrollToListTop = () => {
    const scrollTarget = listSectionRef.current;

    if (!scrollTarget || typeof scrollTarget.scrollIntoView !== "function") {
      return;
    }

    scrollTarget.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleViewBudgetTransactions = (budget: MonthlyBudget) => {
    const monthRange = getMonthRange(selectedSummaryMonth);
    setSelectedTransactionCategoryId(String(budget.categoryId));
    setSelectedPeriod(PERIOD_CUSTOM);
    setCustomStartDate(monthRange.startDate);
    setCustomEndDate(monthRange.endDate);
    setCurrentOffset(DEFAULT_OFFSET);
    scrollToListTop();
  };

  const applyFilterPreset = (presetId: FilterPresetId) => {
    if (presetId === "this-month") {
      const { startDate, endDate } = getCurrentMonthRange();
      setSelectedPeriod(PERIOD_CUSTOM);
      setCustomStartDate(startDate);
      setCustomEndDate(endDate);
      setCurrentOffset(DEFAULT_OFFSET);
      scrollToListTop();
      return;
    }

    if (presetId === "clear") {
      setSelectedCategory(CATEGORY_ALL);
      setSelectedPeriod(PERIOD_ALL);
      setCustomStartDate("");
      setCustomEndDate("");
      setSelectedTransactionCategoryId("");
      setQueryInput("");
      setSelectedQuery("");
      setCurrentOffset(DEFAULT_OFFSET);
      scrollToListTop();
    }
  };

  const goToOffset = (nextOffset: number) => {
    const maxOffset =
      paginationMeta.total > 0
        ? Math.max((paginationMeta.totalPages - 1) * paginationMeta.limit, 0)
        : 0;
    const clampedOffset = Math.min(Math.max(nextOffset, 0), maxOffset);

    if (clampedOffset === currentOffset) {
      return;
    }

    setCurrentOffset(clampedOffset);
    scrollToListTop();
  };

  const handlePreviousPage = () => {
    goToOffset(currentOffset - pageSize);
  };

  const handleNextPage = () => {
    goToOffset(currentOffset + pageSize);
  };

  const handleFirstPage = () => {
    goToOffset(DEFAULT_OFFSET);
  };

  const handleLastPage = () => {
    const lastOffset =
      paginationMeta.total > 0
        ? Math.max((paginationMeta.totalPages - 1) * paginationMeta.limit, 0)
        : DEFAULT_OFFSET;
    goToOffset(lastOffset);
  };

  const handlePageSizeChange = (nextPageSize: string) => {
    const parsedPageSize = Number.parseInt(nextPageSize, 10);

    if (!PAGE_SIZE_OPTIONS.includes(parsedPageSize)) {
      return;
    }

    setPageSize(parsedPageSize);
    setCurrentOffset(DEFAULT_OFFSET);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(parsedPageSize));
    }

    scrollToListTop();
  };

  const handleApplyQueryFilter = (event?: FormEvent<HTMLFormElement>) => {
    if (event) {
      event.preventDefault();
    }

    const normalizedQuery = queryInput.trim();
    setQueryInput(normalizedQuery);
    setSelectedQuery(normalizedQuery);
    setCurrentOffset(DEFAULT_OFFSET);
  };
  const handleQueryInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") {
      return;
    }

    const normalizedInput = queryInput.trim();
    const normalizedSelectedQuery = selectedQuery.trim();

    if (!normalizedInput && !normalizedSelectedQuery) {
      return;
    }

    event.preventDefault();

    if (normalizedSelectedQuery && normalizedInput === normalizedSelectedQuery) {
      handleRemoveAppliedChip("q");
      return;
    }

    if (normalizedInput) {
      setQueryInput("");
      return;
    }

    if (normalizedSelectedQuery) {
      handleRemoveAppliedChip("q");
    }
  };
  const handleRemoveAppliedChip = (chipId: RemovableChipId) => {
    let shouldFocusSearchInput = false;

    if (chipId === "q") {
      setQueryInput("");
      setSelectedQuery("");
      shouldFocusSearchInput = true;
    } else if (chipId === "type") {
      setSelectedCategory(CATEGORY_ALL);
    } else if (chipId === "period") {
      setSelectedPeriod(PERIOD_ALL);
      setCustomStartDate("");
      setCustomEndDate("");
    } else if (chipId === "category") {
      setSelectedTransactionCategoryId("");
    } else if (chipId === "sort") {
      setSelectedSort(DEFAULT_SORT);
    } else {
      return;
    }

    setCurrentOffset(DEFAULT_OFFSET);
    scrollToListTop();

    if (shouldFocusSearchInput) {
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
          searchInputRef.current?.focus();
        });
      } else {
        searchInputRef.current?.focus();
      }
    }
  };
  const handleEditFilters = useCallback(() => {
    if (isMobileFiltersPanel) {
      setIsFiltersPanelOpen(true);
    }

    const focusSearchInput = () => {
      searchInputRef.current?.focus();
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        if (isMobileFiltersPanel) {
          filtersPanelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        }
        window.requestAnimationFrame(focusSearchInput);
      });
      return;
    }

    if (isMobileFiltersPanel) {
      filtersPanelRef.current?.scrollIntoView?.({ block: "start" });
    }

    focusSearchInput();
  }, [isMobileFiltersPanel]);

  const filterButtons: SelectedCategory[] = [CATEGORY_ALL, CATEGORY_ENTRY, CATEGORY_EXIT];
  const todayISO = getTodayISODate();
  const currentMonthRange = useMemo(
    () => getCurrentMonthRange(new Date(`${todayISO}T00:00:00`)),
    [todayISO],
  );
  const activeFiltersCount = useMemo(() => {
    let count = 0;

    if (selectedCategory !== CATEGORY_ALL) {
      count += 1;
    }

    if (selectedPeriod !== PERIOD_ALL) {
      count += 1;
    }

    if (selectedTransactionCategoryId) {
      count += 1;
    }

    if (selectedQuery) {
      count += 1;
    }

    return count;
  }, [selectedCategory, selectedPeriod, selectedQuery, selectedTransactionCategoryId]);
  const hasActiveFilters = activeFiltersCount > 0;
  const isFiltersContentVisible = !isMobileFiltersPanel || isFiltersPanelOpen;
  const shouldShowPresets = !hasActiveFilters;
  const hasMonthlySummaryData =
    monthlySummary.income > 0 ||
    monthlySummary.expense > 0 ||
    monthlySummary.byCategory.length > 0;
  const hasMonthlyBudgetsData = monthlyBudgets.length > 0;
  const canCreateBudget = categories.length > 0 && !isLoadingBudgets && !isSavingBudget;
  const appliedChips = useMemo<AppliedChip[]>(() => {
    const chips: AppliedChip[] = [];

    if (selectedQuery) {
      chips.push({
        id: "q",
        text: `Busca: "${selectedQuery}"`,
        removable: true,
        removeLabel: "Busca",
      });
    }

    if (selectedCategory !== CATEGORY_ALL) {
      const categoryTypeLabel = selectedCategory === CATEGORY_ENTRY ? "Entradas" : "Saidas";
      chips.push({
        id: "type",
        text: `Tipo: ${categoryTypeLabel}`,
        removable: true,
        removeLabel: "Tipo",
      });
    }

    if (selectedPeriod !== PERIOD_ALL) {
      if (selectedPeriod === PERIOD_CUSTOM) {
        const startLabel = customStartDate || "--";
        const endLabel = customEndDate || "--";
        chips.push({
          id: "period",
          text: `Periodo: ${startLabel} -> ${endLabel}`,
          removable: true,
          removeLabel: "Periodo",
        });
      } else {
        chips.push({
          id: "period",
          text: `Periodo: ${selectedPeriod}`,
          removable: true,
          removeLabel: "Periodo",
        });
      }
    }

    if (selectedTransactionCategoryId) {
      const categoryName = categoryNameById.get(Number(selectedTransactionCategoryId));
      chips.push({
        id: "category",
        text: `Categoria: ${categoryName || `#${selectedTransactionCategoryId}`}`,
        removable: true,
        removeLabel: "Categoria",
      });
    }

    const selectedSortLabel =
      SORT_OPTIONS.find((sortOption) => sortOption.value === selectedSort)?.label || selectedSort;
    chips.push({
      id: "sort",
      text: `Ordenacao: ${selectedSortLabel}`,
      removable: true,
      removeLabel: "Ordenacao",
    });

    return chips;
  }, [
    categoryNameById,
    customEndDate,
    customStartDate,
    selectedCategory,
    selectedPeriod,
    selectedQuery,
    selectedSort,
    selectedTransactionCategoryId,
  ]);
  const visibleFilterPresets = FILTER_PRESETS;
  const isPresetActive = (presetId: (typeof FILTER_PRESETS)[number]["id"]): boolean => {
    if (presetId === "this-month") {
      return (
        selectedPeriod === PERIOD_CUSTOM &&
        customStartDate === currentMonthRange.startDate &&
        customEndDate === currentMonthRange.endDate
      );
    }

    return false;
  };
  const currentPage = paginationMeta.page;
  const rangeStart = paginationMeta.total === 0 ? 0 : paginationMeta.offset + 1;
  const rangeEnd = Math.min(
    paginationMeta.offset + filteredTransactions.length,
    paginationMeta.total,
  );

  useEffect(() => {
    if (!isMobileFiltersPanel) {
      return;
    }

    if (hasActiveFilters) {
      setIsFiltersPanelOpen(true);
    }
  }, [hasActiveFilters, isMobileFiltersPanel]);

  return (
    <div className="App min-h-screen bg-white pb-10">
      <header className="w-full bg-gray-500 py-3 shadow-md sm:py-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-4xl font-semibold">
            <span className="text-brand-1">Control</span>
            <span className="text-gray-100">Finance</span>
          </h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {useMobileActionsMenu ? (
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isMobileActionsMenuOpen}
                  aria-controls={MOBILE_ACTIONS_MENU_ID}
                  onClick={toggleMobileActionsMenu}
                  ref={mobileActionsButtonRef}
                  className="whitespace-nowrap rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-100 hover:bg-gray-400"
                >
                  Acoes
                </button>
                {isMobileActionsMenuOpen ? (
                  <div
                    role="menu"
                    id={MOBILE_ACTIONS_MENU_ID}
                    aria-label="Acoes rapidas"
                    ref={mobileActionsMenuRef}
                    className="absolute right-0 top-full z-20 mt-1 flex w-44 flex-col gap-1 rounded border border-gray-300 bg-white p-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      ref={firstMobileActionsItemRef}
                      onClick={handleExportCsvFromMenu}
                      disabled={isExportingCsv}
                      className="rounded px-2 py-2 text-left text-xs font-semibold text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isExportingCsv ? "Exportando CSV..." : "Exportar CSV"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleOpenImportModal}
                      className="rounded px-2 py-2 text-left text-xs font-semibold text-gray-900 hover:bg-gray-100"
                    >
                      Importar CSV
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleOpenImportHistoryModal}
                      className="rounded px-2 py-2 text-left text-xs font-semibold text-gray-900 hover:bg-gray-100"
                    >
                      Historico de imports
                    </button>
                    {onOpenCategoriesSettings ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleOpenCategoriesSettings}
                        className="rounded px-2 py-2 text-left text-xs font-semibold text-gray-900 hover:bg-gray-100"
                      >
                        Categorias
                      </button>
                    ) : null}
                    {onLogout ? (
                      <>
                        <div className="my-1 h-px bg-gray-200" role="separator" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleLogoutFromActionsMenu}
                          className="rounded px-2 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Sair
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-1 rounded border border-gray-300 bg-white/70 p-1 sm:gap-2">
                {onLogout ? (
                  <button
                    onClick={onLogout}
                    className="whitespace-nowrap rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-100 hover:bg-gray-400"
                  >
                    Sair
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={isExportingCsv}
                  className="whitespace-nowrap rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-100 hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isExportingCsv ? "Exportando CSV..." : "Exportar CSV"}
                </button>
                <button
                  type="button"
                  onClick={handleOpenImportModal}
                  className="whitespace-nowrap rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-100 hover:bg-gray-400"
                >
                  Importar CSV
                </button>
                <button
                  type="button"
                  onClick={handleOpenImportHistoryModal}
                  className="whitespace-nowrap rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-100 hover:bg-gray-400"
                >
                  Historico de imports
                </button>
                {onOpenCategoriesSettings ? (
                  <button
                    type="button"
                    onClick={handleOpenCategoriesSettings}
                    className="whitespace-nowrap rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-100 hover:bg-gray-400"
                  >
                    Categorias
                  </button>
                ) : null}
              </div>
            )}
            <button
              onClick={openCreateModal}
              className="whitespace-nowrap rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2"
            >
              Registrar novo valor
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-8 w-full max-w-6xl space-y-6 px-4 sm:mt-10 sm:px-6">
        <section ref={filtersPanelRef}>
          <div className="space-y-4 rounded border border-gray-300 bg-white p-4">
            <div className="flex items-start justify-between gap-3 rounded border border-gray-200 bg-gray-50 px-3 py-2">
              <h2 className="text-base font-semibold text-gray-100">Resumo financeiro</h2>
              <div className="flex items-center gap-2">
                {!hasActiveFilters && !isMobileFiltersPanel ? (
                  <span className="rounded-full border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-600">
                    Sem filtros ativos
                  </span>
                ) : null}
                {isMobileFiltersPanel ? (
                  <button
                    type="button"
                    onClick={() => setIsFiltersPanelOpen((currentValue) => !currentValue)}
                    aria-expanded={isFiltersPanelOpen}
                    className="whitespace-nowrap rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    {isFiltersPanelOpen ? "Ocultar" : "Filtros"}
                  </button>
                ) : null}
              </div>
            </div>

            {hasActiveFilters && appliedChips.length > 0 ? (
              <div className="w-full max-w-full space-y-2 overflow-hidden rounded border border-gray-200 bg-gray-50 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-700">
                    Filtros ativos ({activeFiltersCount})
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleEditFilters}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Editar filtros
                    </button>
                    <button
                      type="button"
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      onClick={() => applyFilterPreset("clear")}
                    >
                      Limpar tudo
                    </button>
                  </div>
                </div>
                <div className="w-full max-w-full overflow-x-auto">
                  <div className="flex flex-nowrap items-center gap-2 pb-1">
                    {appliedChips.map((chip) => (
                      <span
                        key={chip.id}
                        className="inline-flex whitespace-nowrap items-center gap-1 rounded-full border border-gray-300 bg-white py-1 pl-2.5 pr-1.5 text-xs font-medium text-gray-700"
                      >
                        {chip.text}
                        {chip.removable ? (
                          <button
                            type="button"
                            aria-label={`Remover filtro: ${chip.removeLabel}`}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-1 focus:ring-offset-1"
                            onClick={() => handleRemoveAppliedChip(chip.id)}
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              className="h-3.5 w-3.5"
                            >
                              <path d="M4 4L12 12" />
                              <path d="M12 4L4 12" />
                            </svg>
                          </button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {isFiltersContentVisible ? (
              <div className="space-y-4">
                <div className="space-y-3 rounded border border-gray-200 bg-gray-50 p-3">
                  {shouldShowPresets ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {visibleFilterPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          aria-pressed={isPresetActive(preset.id)}
                          onClick={() => applyFilterPreset(preset.id)}
                          className={`min-w-[88px] rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            isPresetActive(preset.id)
                              ? "border-brand-1 bg-brand-3 text-brand-1"
                              : "border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-200">
                      Tipo
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {filterButtons.map((category) => {
                        const active = selectedCategory === category;

                        return (
                          <button
                            key={category}
                            aria-label={FILTER_BUTTON_ARIA_LABELS[category]}
                            onClick={() => {
                              setSelectedCategory(category);
                              setCurrentOffset(DEFAULT_OFFSET);
                            }}
                            className={`min-w-[84px] rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              active
                                ? "border-brand-1 bg-brand-3 text-brand-1"
                                : "border-gray-300 bg-white text-gray-200"
                            }`}
                          >
                            {FILTER_BUTTON_LABELS[category]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded border border-gray-200 bg-white p-3">
            <label
              htmlFor="periodo"
              className="mb-2 block text-sm font-medium text-gray-100"
            >
              Periodo
            </label>
            <select
              id="periodo"
              value={selectedPeriod}
              onChange={(event) => {
                const nextPeriod = event.target.value as SelectedPeriod;
                setSelectedPeriod(nextPeriod);
                setCurrentOffset(DEFAULT_OFFSET);

                if (nextPeriod !== PERIOD_CUSTOM) {
                  setCustomStartDate("");
                  setCustomEndDate("");
                }
              }}
              className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
            >
              {PERIOD_OPTIONS.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>

            <div className="mt-3">
              <label
                htmlFor="categoria-filtro"
                className="mb-1 block text-xs font-medium text-gray-100"
              >
                Categoria
              </label>
              <select
                id="categoria-filtro"
                value={selectedTransactionCategoryId}
                onChange={(event) => {
                  setSelectedTransactionCategoryId(event.target.value);
                  setCurrentOffset(DEFAULT_OFFSET);
                }}
                className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
              >
                <option value="">Todas</option>
                {categories.map((categoryOption) => (
                  <option key={categoryOption.id} value={String(categoryOption.id)}>
                    {categoryOption.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3">
              <label
                htmlFor="ordenacao-transacoes"
                className="mb-1 block text-xs font-medium text-gray-100"
              >
                Ordenar por
              </label>
              <select
                id="ordenacao-transacoes"
                value={selectedSort}
                onChange={(event) => {
                  setSelectedSort(normalizeSortOption(event.target.value));
                  setCurrentOffset(DEFAULT_OFFSET);
                }}
                className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
              >
                {SORT_OPTIONS.map((sortOption) => (
                  <option key={sortOption.value} value={sortOption.value}>
                    {sortOption.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3">
              <label htmlFor="busca-transacoes" className="mb-1 block text-xs font-medium text-gray-100">
                Buscar
              </label>
              <form onSubmit={handleApplyQueryFilter} className="flex gap-2">
                <input
                  ref={searchInputRef}
                  id="busca-transacoes"
                  type="text"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  onKeyDown={handleQueryInputKeyDown}
                  placeholder="Descricao ou observacoes"
                  className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
                />
                <button
                  type="submit"
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-400"
                >
                  Aplicar
                </button>
              </form>
            </div>

                  {selectedPeriod === PERIOD_CUSTOM ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="data-inicial"
                          className="mb-1 block text-xs font-medium text-gray-100"
                        >
                          Data inicial
                        </label>
                        <input
                          id="data-inicial"
                          type="date"
                          value={customStartDate}
                          onChange={(event) => {
                            setCustomStartDate(event.target.value);
                            setCurrentOffset(DEFAULT_OFFSET);
                          }}
                          className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="data-final"
                          className="mb-1 block text-xs font-medium text-gray-100"
                        >
                          Data final
                        </label>
                        <input
                          id="data-final"
                          type="date"
                          value={customEndDate}
                          onChange={(event) => {
                            setCustomEndDate(event.target.value);
                            setCurrentOffset(DEFAULT_OFFSET);
                          }}
                          className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <div className="space-y-6">
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-gray-100">Resumo mensal</h3>
          <input
            type="month"
            aria-label="Mes do resumo"
            value={selectedSummaryMonth}
            onChange={(event) => setSelectedSummaryMonth(event.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-100"
          />
            </div>
            {summaryError ? (
              <div
                className="mb-3 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                role="status"
                aria-live="polite"
              >
                <span>{summaryError}</span>
                <button
                  type="button"
                  onClick={loadMonthlySummary}
                  className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  Tentar novamente
                </button>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded border border-brand-1 bg-gray-400 px-4 py-3.5">
            <p className="text-xs font-medium uppercase text-gray-200">Saldo</p>
            <p className="text-base font-medium text-gray-100">
              {isLoadingSummary ? "Carregando..." : formatCurrency(monthlySummary.balance)}
            </p>
            <p
              className={`mt-1 text-xs font-medium ${
                isLoadingSummary || summaryError || momError
                  ? MOM_TONE_CLASSNAMES.neutral
                  : MOM_TONE_CLASSNAMES[monthOverMonthMetrics.balance.tone]
              }`}
              data-testid="mom-balance"
            >
              {isLoadingSummary
                ? "MoM: Calculando..."
                : summaryError || momError
                  ? "MoM: —"
                  : `MoM: ${
                      monthOverMonthMetrics.balance.direction === "up"
                        ? "↑"
                        : monthOverMonthMetrics.balance.direction === "down"
                          ? "↓"
                          : "→"
                    } ${formatSignedPercentage(monthOverMonthMetrics.balance.deltaPercent)} (${formatSignedCurrency(monthOverMonthMetrics.balance.delta)})`}
            </p>
          </div>
          <div className="rounded border border-brand-1 bg-gray-400 px-4 py-3.5">
            <p className="text-xs font-medium uppercase text-gray-200">Entradas</p>
            <p className="text-base font-medium text-gray-100">
              {isLoadingSummary ? "Carregando..." : formatCurrency(monthlySummary.income)}
            </p>
            <p
              className={`mt-1 text-xs font-medium ${
                isLoadingSummary || summaryError || momError
                  ? MOM_TONE_CLASSNAMES.neutral
                  : MOM_TONE_CLASSNAMES[monthOverMonthMetrics.income.tone]
              }`}
              data-testid="mom-income"
            >
              {isLoadingSummary
                ? "MoM: Calculando..."
                : summaryError || momError
                  ? "MoM: —"
                  : `MoM: ${
                      monthOverMonthMetrics.income.direction === "up"
                        ? "↑"
                        : monthOverMonthMetrics.income.direction === "down"
                          ? "↓"
                          : "→"
                    } ${formatSignedPercentage(monthOverMonthMetrics.income.deltaPercent)} (${formatSignedCurrency(monthOverMonthMetrics.income.delta)})`}
            </p>
          </div>
          <div className="rounded border border-brand-1 bg-gray-400 px-4 py-3.5">
            <p className="text-xs font-medium uppercase text-gray-200">Saidas</p>
            <p className="text-base font-medium text-gray-100">
              {isLoadingSummary ? "Carregando..." : formatCurrency(monthlySummary.expense)}
            </p>
            <p
              className={`mt-1 text-xs font-medium ${
                isLoadingSummary || summaryError || momError
                  ? MOM_TONE_CLASSNAMES.neutral
                  : MOM_TONE_CLASSNAMES[monthOverMonthMetrics.expense.tone]
              }`}
              data-testid="mom-expense"
            >
              {isLoadingSummary
                ? "MoM: Calculando..."
                : summaryError || momError
                  ? "MoM: —"
                  : `MoM: ${
                      monthOverMonthMetrics.expense.direction === "up"
                        ? "↑"
                        : monthOverMonthMetrics.expense.direction === "down"
                          ? "↓"
                          : "→"
                    } ${formatSignedPercentage(monthOverMonthMetrics.expense.deltaPercent)} (${formatSignedCurrency(monthOverMonthMetrics.expense.delta)})`}
            </p>
          </div>
            </div>
            {!isLoadingSummary && !summaryError && momError ? (
              <div className="mt-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600">
                {momError}
              </div>
            ) : null}
            {!isLoadingSummary && !summaryError && !hasMonthlySummaryData ? (
              <div className="mt-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600">
                Sem dados para o mes selecionado.
              </div>
            ) : null}
            {!isLoadingSummary &&
            !summaryError &&
            summaryByCategoryExpenses.length > 0 ? (
              <div className="mt-3 rounded border border-gray-300 bg-white p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Despesas por categoria
                </h4>
                <ul className="mt-2 space-y-1.5">
                  {summaryByCategoryExpenses.map((categoryItem) => (
                    <li
                      key={`${categoryItem.categoryId ?? "uncategorized"}-${categoryItem.categoryName}`}
                      className="flex items-center justify-between gap-3 text-sm text-gray-700"
                    >
                      <span className="break-words">{categoryItem.categoryName}</span>
                      <span className="whitespace-nowrap font-semibold">
                        {formatCurrency(categoryItem.expense)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

      <section>
        <div className="rounded border border-gray-300 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium text-gray-100">Metas do mes</h3>
              <span className="text-xs text-gray-200">{selectedSummaryMonth}</span>
            </div>
            <button
              type="button"
              onClick={openCreateBudgetModal}
              disabled={!canCreateBudget}
              className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              + Nova meta
            </button>
          </div>
          {budgetsError ? (
            <div
              className="mb-3 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="status"
              aria-live="polite"
            >
              <span>{budgetsError}</span>
              <button
                type="button"
                onClick={loadMonthlyBudgets}
                className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Tentar novamente
              </button>
            </div>
          ) : null}
          {!budgetsError && budgetSuccessMessage ? (
            <div
              className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
              role="status"
              aria-live="polite"
            >
              {budgetSuccessMessage}
            </div>
          ) : null}
          {!isLoadingBudgets && !budgetsError && budgetAlerts.length > 0 ? (
            <div
              className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-3"
              role="region"
              aria-label="Alertas de orcamento"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Alertas de orcamento
                </h4>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {budgetAlerts.length}
                </span>
              </div>
              <ul className="space-y-2">
                {budgetAlerts.map((budget) => (
                  <li
                    key={`budget-alert-${budget.id}`}
                    data-testid="budget-alert-item"
                    className="rounded border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900">{budget.categoryName}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${BUDGET_STATUS_BADGE_CLASSNAMES[budget.status]}`}
                      >
                        {BUDGET_STATUS_LABELS[budget.status]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700">
                      Uso: {formatPercentage(budget.percentage)} ({formatCurrency(budget.actual)} de{" "}
                      {formatCurrency(budget.budget)})
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-label={`Ver transacoes: ${budget.categoryName}`}
                        onClick={() => handleViewBudgetTransactions(budget)}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-100"
                      >
                        Ver transacoes
                      </button>
                      <button
                        type="button"
                        aria-label={`Ajustar meta: ${budget.categoryName}`}
                        onClick={() => openEditBudgetModal(budget)}
                        className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        Ajustar meta
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {isLoadingBudgets ? (
            <div className="space-y-2" role="status" aria-live="polite">
              {Array.from({ length: 3 }).map((_unusedValue, index) => (
                <div
                  key={`budgets-skeleton-${index + 1}`}
                  className="h-16 animate-pulse rounded border border-gray-300 bg-gray-100"
                />
              ))}
              <span className="sr-only">Carregando metas do mes...</span>
            </div>
          ) : null}
          {!isLoadingBudgets && !budgetsError && !hasMonthlyBudgetsData ? (
            <div className="rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              <p>Nenhuma meta cadastrada para o mes selecionado.</p>
              <button
                type="button"
                onClick={openCreateBudgetModal}
                disabled={!canCreateBudget}
                className="mt-2 rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Criar meta
              </button>
            </div>
          ) : null}
          {!isLoadingBudgets && !budgetsError && hasMonthlyBudgetsData ? (
            <ul className="space-y-2">
              {monthlyBudgets.map((budget) => {
                const safeStatus =
                  budget.status === "near_limit" || budget.status === "exceeded"
                    ? budget.status
                    : "ok";
                const progressWidth = `${Math.min(Math.max(budget.percentage, 0), 100)}%`;

                return (
                  <li
                    key={budget.id}
                    className="rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900">{budget.categoryName}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${BUDGET_STATUS_BADGE_CLASSNAMES[safeStatus]}`}
                      >
                        {BUDGET_STATUS_LABELS[safeStatus]}
                      </span>
                    </div>
                    <div className="mb-2 h-2 w-full rounded-full bg-gray-200">
                      <div
                        className={`h-2 rounded-full ${BUDGET_STATUS_BAR_CLASSNAMES[safeStatus]}`}
                        style={{ width: progressWidth }}
                        title={safeStatus === "exceeded" ? "Acima de 100%" : undefined}
                      />
                    </div>
                    <div className="grid gap-1 text-xs text-gray-700 sm:grid-cols-2">
                      <span>Orcado: {formatCurrency(budget.budget)}</span>
                      <span>Realizado: {formatCurrency(budget.actual)}</span>
                      <span>Restante: {formatCurrency(budget.remaining)}</span>
                      <span>Uso: {formatPercentage(budget.percentage)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-label={`Editar meta: ${budget.categoryName}`}
                        onClick={() => openEditBudgetModal(budget)}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-100"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        aria-label={`Excluir meta: ${budget.categoryName}`}
                        onClick={() => handleDeleteBudget(budget)}
                        className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </section>

      <section>
        <Suspense
          fallback={
            <div className="rounded border border-brand-1 bg-gray-500 p-4 text-sm text-gray-100">
              Carregando grafico...
            </div>
          }
        >
          <TransactionChart data={chartData} />
        </Suspense>
      </section>

      <section ref={listSectionRef} className="rounded border border-brand-1 bg-gray-500 px-4 py-3.5">
        {requestError ? (
          <div className="p-4 text-center">
            <p className="text-sm font-medium text-red-300">{requestError}</p>
            <button
              onClick={loadTransactions}
              className="mt-2 font-medium text-brand-1 hover:text-brand-2"
            >
              Tentar novamente
            </button>
          </div>
        ) : isLoadingTransactions ? (
          <div className="space-y-2 p-2" role="status" aria-live="polite">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`transactions-skeleton-${index + 1}`}
                className="h-20 animate-pulse rounded border border-gray-300 bg-gray-400"
              />
            ))}
            <span className="sr-only">Carregando transacoes...</span>
          </div>
        ) : filteredTransactions.length === 0 ? (
          hasActiveFilters ? (
            <div className="p-4 text-center text-gray-100">
              Nenhum valor encontrado para os filtros selecionados.
            </div>
          ) : (
            <div className="p-4 text-center">
              <p className="text-gray-100">Nenhum valor cadastrado.</p>
              <button
                onClick={openCreateModal}
                className="font-medium text-brand-1 hover:text-brand-2"
              >
                Registrar valor
              </button>
            </div>
          )
        ) : (
          <TransactionList
            transactions={transactionsWithCategoryName}
            onDelete={requestDeleteTransaction}
            onEdit={openEditModal}
          />
        )}

        {!requestError && !isLoadingTransactions ? (
          <div className="mt-2 border-t border-gray-300 px-2 pt-3 text-sm text-gray-100">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span>
                Mostrando {rangeStart}-{rangeEnd} de {paginationMeta.total}
              </span>
              <label className="flex items-center gap-2 text-xs font-semibold">
                Itens por pagina
                <select
                  aria-label="Itens por pagina"
                  value={pageSize}
                  onChange={(event) => handlePageSizeChange(event.target.value)}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-100"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {paginationMeta.totalPages > 2 ? (
                <button
                  type="button"
                  onClick={handleFirstPage}
                  disabled={currentPage <= 1}
                  className="rounded border border-gray-300 px-3 py-1 font-semibold text-gray-100 hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Primeira
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePreviousPage}
                disabled={currentPage <= 1}
                className="rounded border border-gray-300 px-3 py-1 font-semibold text-gray-100 hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Anterior
              </button>
              <span>
                Pagina {currentPage} de {paginationMeta.totalPages}
              </span>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={currentPage >= paginationMeta.totalPages}
                className="rounded border border-gray-300 px-3 py-1 font-semibold text-gray-100 hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Proxima
              </button>
              </div>
              {paginationMeta.totalPages > 2 ? (
                <button
                  type="button"
                  onClick={handleLastPage}
                  disabled={currentPage >= paginationMeta.totalPages}
                  className="rounded border border-gray-300 px-3 py-1 font-semibold text-gray-100 hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Ultima
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        ) : null}
      </section>
        </div>
      </main>

      {undoState ? (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-500 -translate-x-1/2 rounded border border-brand-1 bg-white px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-100">Transacao removida.</p>
            <button
              type="button"
              onClick={restoreDeletedTransaction}
              className="rounded border border-brand-1 px-3 py-1 text-xs font-semibold text-brand-1 hover:bg-brand-3"
            >
              Desfazer
            </button>
          </div>
        </div>
      ) : null}

      {isBudgetModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100 bg-opacity-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="budget-modal-title"
            className="w-full max-w-sm rounded bg-white p-4 shadow-lg"
          >
            <h3 id="budget-modal-title" className="text-base font-semibold text-gray-900">
              Meta do mes
            </h3>
            <p className="mt-1 text-xs text-gray-600">Mes selecionado: {selectedSummaryMonth}</p>
            {editingBudget ? (
              <div className="mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                <p>
                  Editando: <strong>{editingBudget.categoryName}</strong>
                </p>
                <p>Categoria bloqueada no modo edicao</p>
              </div>
            ) : null}

            {budgetMutationError ? (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-700" role="alert">
                {budgetMutationError}
              </p>
            ) : null}

            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="budget-category" className="mb-1 block text-xs font-medium text-gray-900">
                  Categoria da meta
                </label>
                <select
                  id="budget-category"
                  value={budgetForm.categoryId}
                  onChange={(event) =>
                    setBudgetForm((previousState) => ({
                      ...previousState,
                      categoryId: event.target.value,
                    }))
                  }
                  disabled={isSavingBudget || Boolean(editingBudget)}
                  className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">Selecione...</option>
                  {categories.map((categoryOption) => (
                    <option key={categoryOption.id} value={String(categoryOption.id)}>
                      {categoryOption.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="budget-amount" className="mb-1 block text-xs font-medium text-gray-900">
                  Valor da meta
                </label>
                <input
                  id="budget-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={budgetForm.amount}
                  onChange={(event) =>
                    setBudgetForm((previousState) => ({
                      ...previousState,
                      amount: event.target.value,
                    }))
                  }
                  disabled={isSavingBudget}
                  className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeBudgetModal}
                disabled={isSavingBudget}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveBudget}
                disabled={isSavingBudget}
                className="rounded bg-brand-1 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingBudget ? "Salvando..." : "Salvar meta"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteTransactionId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100 bg-opacity-50 p-4">
          <div className="w-full max-w-sm rounded bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold text-gray-100">Confirmar exclusao</h3>
            <p className="mt-2 text-sm text-gray-200">
              Deseja realmente excluir esta transacao?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteTransaction}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                Confirmar exclusao
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTransaction(null);
          setModalRequestError("");
        }}
        onClearSubmitError={() => setModalRequestError("")}
        submitErrorMessage={modalRequestError}
        onSave={handleSaveTransaction}
        categories={categories}
        hasLoadedCategories={hasLoadedCategories}
        initialTransaction={editingTransaction}
      />

      <ImportCsvModal
        isOpen={isImportModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={handleImportCommitted}
      />

      <ImportHistoryModal
        isOpen={isImportHistoryModalOpen}
        onClose={() => setImportHistoryModalOpen(false)}
      />
    </div>
  );
};

export default App;
