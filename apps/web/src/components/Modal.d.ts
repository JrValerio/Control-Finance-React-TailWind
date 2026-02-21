import type { CategoryOption, Transaction, TransactionType } from "../services/transactions.service";

interface TransactionModalPayload {
  value: number;
  type: TransactionType;
  date: string;
  description: string;
  notes: string;
  categoryId: number | null;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TransactionModalPayload) => void;
  onClearSubmitError?: () => void;
  submitErrorMessage?: string;
  initialTransaction?: Transaction | null;
  hasLoadedCategories?: boolean;
  categories?: CategoryOption[];
}

declare function Modal(props: ModalProps): JSX.Element;
export default Modal;
