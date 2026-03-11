import ru from "./ru.js";

const dictionaries = {
  ru
};

function getByPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function interpolate(template, params) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(params[key] ?? ""));
}

export function createTranslator(locale = "ru") {
  const dictionary = dictionaries[locale] ?? dictionaries.ru;

  return function t(key, params = {}) {
    const value = getByPath(dictionary, key);

    if (typeof value === "function") {
      return value(params);
    }

    if (typeof value === "string") {
      return interpolate(value, params);
    }

    return key;
  };
}

export const t = createTranslator("ru");
