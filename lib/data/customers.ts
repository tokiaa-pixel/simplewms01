import type { Customer } from '@/lib/types'

export const initialCustomers: Customer[] = [
  {
    id: 'cus-001', code: 'C-0001', name: '大阪通商株式会社',
    contact: '大阪 太郎', phone: '06-1111-2222', address: '大阪府大阪市中央区本町1-1-1',
    isActive: true,
  },
  {
    id: 'cus-002', code: 'C-0002', name: '株式会社東京商会',
    contact: '東京 二郎', phone: '03-2222-3333', address: '東京都渋谷区渋谷2-2-2',
    isActive: true,
  },
  {
    id: 'cus-003', code: 'C-0003', name: '株式会社福岡商店',
    contact: '福岡 花子', phone: '092-3333-4444', address: '福岡県福岡市博多区博多駅前3-3-3',
    isActive: true,
  },
  {
    id: 'cus-004', code: 'C-0004', name: '名古屋物流株式会社',
    contact: '名古屋 三郎', phone: '052-4444-5555', address: '愛知県名古屋市中区栄4-4-4',
    isActive: true,
  },
  {
    id: 'cus-005', code: 'C-0005', name: '北海道商事株式会社',
    contact: '北海 道夫', phone: '011-5555-6666', address: '北海道札幌市中央区大通西5-5-5',
    isActive: true,
  },
]
