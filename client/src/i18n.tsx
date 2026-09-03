import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import ar from "./locales/ar.json";
import en from "./locales/en.json";
export type Locale = "ar" | "en";
const messages = { ar, en } as const;
type MessageKey = keyof typeof ar;
const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; t: (key: MessageKey) => string } | null>(null);
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => (localStorage.getItem("locale") as Locale) || "ar");
  useEffect(() => { document.documentElement.lang = locale; document.documentElement.dir = locale === "ar" ? "rtl" : "ltr"; localStorage.setItem("locale", locale); }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: (key: MessageKey) => messages[locale][key] }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale() { const value = useContext(LocaleContext); if (!value) throw new Error("useLocale must be used within LocaleProvider"); return value; }
export const localeMessages = messages;
export function localeDirection(locale: Locale) { return locale === "ar" ? "rtl" : "ltr" as const; }
