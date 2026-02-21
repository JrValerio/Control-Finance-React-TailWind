interface ImportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: () => Promise<void> | void;
}

declare function ImportCsvModal(props: ImportCsvModalProps): JSX.Element;
export default ImportCsvModal;
