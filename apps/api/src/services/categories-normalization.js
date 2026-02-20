const MULTIPLE_SPACES_REGEX = /\s+/g;
const DIACRITIC_MARKS_REGEX = /[\u0300-\u036f]/g;

export const normalizeCategoryNameValue = (value) =>
  String(value || "")
    .trim()
    .replace(MULTIPLE_SPACES_REGEX, " ");

export const normalizeCategoryNameKey = (value) =>
  normalizeCategoryNameValue(value)
    .normalize("NFD")
    .replace(DIACRITIC_MARKS_REGEX, "")
    .toLowerCase();
