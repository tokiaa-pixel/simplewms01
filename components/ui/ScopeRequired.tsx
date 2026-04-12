'use client'

import { Building2, Warehouse } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

/**
 * 荷主・倉庫が未選択の場合にページコンテンツの代わりに表示するプレースホルダー。
 * `useTenant().scope === null` のときに各ページで return する。
 */
export default function ScopeRequired() {
  const { t } = useTranslation('header')
  return (
    <div className="max-w-screen-xl flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-3 text-slate-300">
          <Building2 size={36} />
          <Warehouse size={36} />
        </div>
        <p className="text-base font-semibold text-slate-600">{t('noScopeTitle')}</p>
        <p className="text-sm text-slate-400">{t('noScopeDesc')}</p>
      </div>
    </div>
  )
}
