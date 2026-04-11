'use client'

import { useLanguage } from '@/store/LanguageContext'
import type { Locale } from '@/lib/i18n/types'

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
]

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage()

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {LOCALES.map((l) => (
        <button
          key={l.value}
          onClick={() => setLocale(l.value)}
          className={`
            px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap
            ${locale === l.value
              ? 'bg-brand-teal/15 text-brand-teal border border-brand-teal/40'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 border border-transparent'
            }
          `}
          aria-pressed={locale === l.value}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
