'use client'

import Link from 'next/link'
import {
  PackageCheck,
  PackageMinus,
  AlertTriangle,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
} from 'lucide-react'

// ─── KPI データ ────────────────────────────────────────────────

const kpiStats = [
  {
    label: '本日の入庫件数',
    value: 12,
    unit: '件',
    trend: '+3',
    trendDir: 'up' as const,
    trendLabel: '前日比',
    icon: PackageCheck,
    accentColor: '#005B99',
    bgColor:     '#E6F3F9',
    iconColor:   '#005B99',
  },
  {
    label: '本日の出庫件数',
    value: 8,
    unit: '件',
    trend: '-2',
    trendDir: 'down' as const,
    trendLabel: '前日比',
    icon: PackageMinus,
    accentColor: '#00A0C8',
    bgColor:     '#E6F8FB',
    iconColor:   '#00A0C8',
  },
  {
    label: '在庫アラート品目',
    value: 3,
    unit: '品目',
    trend: '±0',
    trendDir: 'flat' as const,
    trendLabel: '最小在庫を下回る',
    icon: AlertTriangle,
    accentColor: '#D97706',
    bgColor:     '#FEF3C7',
    iconColor:   '#D97706',
  },
  {
    label: '未処理の出庫指示',
    value: 5,
    unit: '件',
    trend: '+2',
    trendDir: 'up' as const,
    trendLabel: '対応が必要',
    icon: ClipboardList,
    accentColor: '#DC2626',
    bgColor:     '#FEE2E2',
    iconColor:   '#DC2626',
  },
]

// ─── テーブルデータ ────────────────────────────────────────────

const recentReceivings = [
  { code: 'RCV-2024-0047', supplier: '田中商事株式会社',     date: '2024/01/15', items: 5, status: '確定済' },
  { code: 'RCV-2024-0046', supplier: '山田物産株式会社',     date: '2024/01/15', items: 3, status: '確定済' },
  { code: 'RCV-2024-0045', supplier: '鈴木製造株式会社',     date: '2024/01/14', items: 8, status: '確定済' },
  { code: 'RCV-2024-0044', supplier: '東京部品工業株式会社', date: '2024/01/14', items: 2, status: '確定済' },
  { code: 'RCV-2024-0043', supplier: '関西サプライ株式会社', date: '2024/01/13', items: 6, status: '確定済' },
]

const pendingShippings = [
  { code: 'SHP-2024-0022', customer: '大阪通商株式会社',   date: '2024/01/16', items: 7, status: 'ピッキング中' },
  { code: 'SHP-2024-0021', customer: '株式会社東京商会',   date: '2024/01/16', items: 4, status: '未処理' },
  { code: 'SHP-2024-0020', customer: '株式会社福岡商店',   date: '2024/01/15', items: 3, status: '検品済み' },
  { code: 'SHP-2024-0023', customer: '名古屋物流株式会社', date: '2024/01/17', items: 2, status: '未処理' },
  { code: 'SHP-2024-0019', customer: '北海道商事株式会社', date: '2024/01/15', items: 5, status: '検品済み' },
]

// ─── ステータスバッジ ──────────────────────────────────────────

const receivingStatusStyle: Record<string, { bg: string; color: string }> = {
  確定済: { bg: '#DCFCE7', color: '#166534' },
  下書き: { bg: '#F1F5F9', color: '#475569' },
}

const shippingStatusStyle: Record<string, { bg: string; color: string }> = {
  未処理:      { bg: '#F1F5F9', color: '#475569' },
  'ピッキング中': { bg: '#DBEAFE', color: '#1D4ED8' },
  検品済み:    { bg: '#EDE9FE', color: '#6D28D9' },
  出荷済:      { bg: '#DCFCE7', color: '#166534' },
  キャンセル:  { bg: '#FEE2E2', color: '#991B1B' },
}

function Badge({
  label,
  styleMap,
}: {
  label: string
  styleMap: Record<string, { bg: string; color: string }>
}) {
  const s = styleMap[label] ?? { bg: '#F1F5F9', color: '#475569' }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {label}
    </span>
  )
}

// ─── KPIカード ────────────────────────────────────────────────

function KpiCard(stat: typeof kpiStats[number]) {
  const TrendIcon =
    stat.trendDir === 'up' ? TrendingUp :
    stat.trendDir === 'down' ? TrendingDown : Minus

  const trendColor =
    stat.trendDir === 'up'   ? '#16A34A' :
    stat.trendDir === 'down' ? '#DC2626' : '#64748B'

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-card overflow-hidden">
      {/* 上部アクセントライン */}
      <div className="h-1" style={{ backgroundColor: stat.accentColor }} />

      <div className="p-4 sm:p-5">
        {/* モバイル: アイコンと数値を横並び */}
        <div className="flex items-center gap-3 sm:block">
          <div
            className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 sm:mb-3"
            style={{ backgroundColor: stat.bgColor }}
          >
            <stat.icon size={18} style={{ color: stat.iconColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-500 leading-snug mb-1 sm:mb-4 truncate">{stat.label}</p>
            <p className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: '#0F172A' }}>
              {stat.value}
              <span className="text-xs sm:text-sm font-normal text-slate-400 ml-1">{stat.unit}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 mt-2 sm:mt-3">
          <TrendIcon size={12} style={{ color: trendColor }} />
          <span className="text-xs font-medium" style={{ color: trendColor }}>
            {stat.trend}
          </span>
          <span className="text-xs text-slate-400 truncate">{stat.trendLabel}</span>
        </div>
      </div>
    </div>
  )
}

// ─── テーブルカード共通ラッパー ────────────────────────────────

function TableCard({
  title,
  href,
  children,
}: {
  title: string
  href: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-card overflow-hidden flex flex-col">
      {/* カードヘッダー */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <Link
          href={href}
          className="flex items-center gap-1 text-xs font-medium transition-colors"
          style={{ color: '#005B99' }}
        >
          一覧を見る <ArrowRight size={12} />
        </Link>
      </div>
      <div className="overflow-x-auto flex-1">{children}</div>
    </div>
  )
}

// ─── ページ ──────────────────────────────────────────────────

export default function DashboardPage() {
  const today = new Date()
  const dateStr = today.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  return (
    <div className="space-y-6 max-w-screen-xl">

      {/* 日付バー */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800">ダッシュボード</h2>
          <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{dateStr}</p>
        </div>
        <div
          className="px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap"
          style={{ backgroundColor: '#E6F3F9', color: '#005B99' }}
        >
          本日の業務状況
        </div>
      </div>

      {/* KPI カード 4枚 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {kpiStats.map((stat) => (
          <KpiCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* テーブル 2カラム */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* 最近の入庫 */}
        <TableCard title="最近の入庫" href="/receiving">
          {/* モバイル：カード表示 */}
          <div className="sm:hidden divide-y divide-slate-100">
            {recentReceivings.map((r) => (
              <div key={r.code} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs font-semibold" style={{ color: '#005B99' }}>{r.code}</span>
                  <Badge label={r.status} styleMap={receivingStatusStyle} />
                </div>
                <p className="text-sm font-medium text-slate-700 truncate mb-0.5">{r.supplier}</p>
                <p className="text-xs text-slate-500">{r.date}</p>
              </div>
            ))}
          </div>
          {/* デスクトップ：テーブル表示 */}
          <table className="w-full hidden sm:table">
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">入庫番号</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">仕入先</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">日付</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">状態</th>
              </tr>
            </thead>
            <tbody>
              {recentReceivings.map((r, i) => (
                <tr
                  key={r.code}
                  className="transition-colors"
                  style={{
                    borderBottom: i < recentReceivings.length - 1 ? '1px solid #F1F5F9' : 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F0F7FB')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                >
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold" style={{ color: '#005B99' }}>
                      {r.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 max-w-[160px] truncate">{r.supplier}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{r.date}</td>
                  <td className="px-4 py-3">
                    <Badge label={r.status} styleMap={receivingStatusStyle} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>

        {/* 未処理の出庫指示 */}
        <TableCard title="未処理の出庫指示" href="/shipping">
          {/* モバイル：カード表示 */}
          <div className="sm:hidden divide-y divide-slate-100">
            {pendingShippings.map((s) => (
              <div key={s.code} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs font-semibold" style={{ color: '#005B99' }}>{s.code}</span>
                  <Badge label={s.status} styleMap={shippingStatusStyle} />
                </div>
                <p className="text-sm font-medium text-slate-700 truncate mb-0.5">{s.customer}</p>
                <p className="text-xs text-slate-500">{s.date}</p>
              </div>
            ))}
          </div>
          {/* デスクトップ：テーブル表示 */}
          <table className="w-full hidden sm:table">
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">出庫番号</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">得意先</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">出荷予定</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">状態</th>
              </tr>
            </thead>
            <tbody>
              {pendingShippings.map((s, i) => (
                <tr
                  key={s.code}
                  className="transition-colors"
                  style={{
                    borderBottom: i < pendingShippings.length - 1 ? '1px solid #F1F5F9' : 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F0F7FB')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                >
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold" style={{ color: '#005B99' }}>
                      {s.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 max-w-[160px] truncate">{s.customer}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{s.date}</td>
                  <td className="px-4 py-3">
                    <Badge label={s.status} styleMap={shippingStatusStyle} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>

      </div>
    </div>
  )
}
