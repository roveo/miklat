const SUPPORTED_LANGUAGES = ["en", "he", "ru", "fr", "ar"];
const RTL_LANGUAGES = new Set(["he", "ar"]);
const CACHE = new Map();

let currentLanguage = "en";
let dictionary = {};

function normalizeLanguage(language) {
  if (!language) {
    return "en";
  }

  const short = language.toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(short) ? short : "en";
}

export function detectLanguage() {
  const stored = localStorage.getItem("miklat:lang");
  if (stored) {
    return normalizeLanguage(stored);
  }

  if (Array.isArray(navigator.languages)) {
    for (const language of navigator.languages) {
      const normalized = normalizeLanguage(language);
      if (SUPPORTED_LANGUAGES.includes(normalized)) {
        return normalized;
      }
    }
  }

  return normalizeLanguage(navigator.language);
}

async function loadDictionary(language) {
  if (CACHE.has(language)) {
    return CACHE.get(language);
  }

  const response = await fetch(`./i18n/${language}.json`);
  if (!response.ok) {
    throw new Error(`Failed to load translations for ${language}`);
  }

  const messages = await response.json();
  CACHE.set(language, messages);
  return messages;
}

export async function setLanguage(language) {
  const normalized = normalizeLanguage(language);
  dictionary = await loadDictionary(normalized);
  currentLanguage = normalized;

  localStorage.setItem("miklat:lang", normalized);
  document.documentElement.lang = normalized;
  document.documentElement.dir = RTL_LANGUAGES.has(normalized) ? "rtl" : "ltr";

  updateI18nElements();
}

export function t(key) {
  return dictionary[key] ?? key;
}

export function updateI18nElements() {
  const nodes = document.querySelectorAll("[data-i18n]");
  for (const node of nodes) {
    const key = node.getAttribute("data-i18n");
    if (!key) {
      continue;
    }
    node.textContent = t(key);
  }
}

export function getCurrentLanguage() {
  return currentLanguage;
}
