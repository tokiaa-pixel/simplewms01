import { useLanguage } from '@/store/LanguageContext'
import { ja } from './ja'
import { en } from './en'
import type { Translations, Locale } from './types'

const translations: Record<Locale, Translations> = { ja, en }

/**
 * 指定した名前空間の翻訳関数 t() を返すカスタムフック。
 *
 * 使用例:
 *   const { t } = useTranslation('arrival')
 *   t('title')  // → "入荷予定登録" or "Arrival Schedule"
 */
export function useTranslation<K extends keyof Translations>(namespace: K) {
  const { locale } = useLanguage()

  function t(key: keyof Translations[K]): string {
    const dict = translations[locale][namespace] as Record<string, string>
    const val = dict[key as string]
    return val !== undefined ? val : String(key)
  }

  return { t, locale }
}

/** 翻訳辞書を直接取得する（React外での利用など） */
export function getTranslations(locale: Locale): Translations {
  return translations[locale]
}
