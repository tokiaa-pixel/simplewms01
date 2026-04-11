'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import type { Locale } from '@/lib/i18n/types'

// ─── 定数 ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'simplewms_locale'

// ─── Context ────────────────────────────────────────────────────────────────

interface LanguageContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'ja',
  setLocale: () => {},
})

// ─── Provider ───────────────────────────────────────────────────────────────

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // SSR と hydration mismatch を防ぐため、初期値は常に 'ja' で固定
  const [locale, setLocaleState] = useState<Locale>('ja')

  useEffect(() => {
    // クライアントサイドのみで localStorage / navigator を参照する
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (saved === 'ja' || saved === 'en') {
      setLocaleState(saved)
    } else {
      // ブラウザ言語を参考にデフォルトを決定（en 以外はすべて日本語）
      const browserLang = navigator.language ?? ''
      setLocaleState(browserLang.startsWith('en') ? 'en' : 'ja')
    }
  }, [])

  const setLocale = (l: Locale) => {
    setLocaleState(l)
    localStorage.setItem(STORAGE_KEY, l)
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  )
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext)
}
