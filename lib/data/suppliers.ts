import type { Supplier } from '@/lib/types'

export const initialSuppliers: Supplier[] = [
  {
    id: 'sup-001', code: 'S-0001', name: '田中商事株式会社',
    contact: '田中 一郎', phone: '03-1234-5678', email: 'tanaka@tanaka-shoji.co.jp',
    leadTimeDays: 5, isActive: true,
  },
  {
    id: 'sup-002', code: 'S-0002', name: '山田電機株式会社',
    contact: '山田 花子', phone: '06-2345-6789', email: 'yamada@yamada-denki.co.jp',
    leadTimeDays: 7, isActive: true,
  },
  {
    id: 'sup-003', code: 'S-0003', name: '鈴木文具株式会社',
    contact: '鈴木 次郎', phone: '045-3456-7890', email: 'suzuki@suzuki-bungu.co.jp',
    leadTimeDays: 3, isActive: true,
  },
  {
    id: 'sup-004', code: 'S-0004', name: '東京PC商事株式会社',
    contact: '佐藤 三郎', phone: '03-4567-8901', email: 'sato@tokyo-pc.co.jp',
    leadTimeDays: 10, isActive: true,
  },
]
