import type { Location } from '@/lib/types'

export const initialLocations: Location[] = [
  { id: 'loc-001', code: 'A-01-01', zone: 'A', row: '01', shelf: '01', description: '電子部品（ケーブル類）', isActive: true },
  { id: 'loc-002', code: 'A-01-02', zone: 'A', row: '01', shelf: '02', description: '電子部品（ケーブル類）', isActive: true },
  { id: 'loc-003', code: 'A-01-03', zone: 'A', row: '01', shelf: '03', isActive: true },
  { id: 'loc-004', code: 'A-02-01', zone: 'A', row: '02', shelf: '01', description: '周辺機器（入力デバイス）', isActive: true },
  { id: 'loc-005', code: 'A-02-02', zone: 'A', row: '02', shelf: '02', description: '周辺機器（入力デバイス）', isActive: true },
  { id: 'loc-006', code: 'A-02-03', zone: 'A', row: '02', shelf: '03', description: '周辺機器（USBハブ）', isActive: true },
  { id: 'loc-007', code: 'A-02-04', zone: 'A', row: '02', shelf: '04', description: '周辺機器（カメラ）', isActive: true },
  { id: 'loc-008', code: 'A-03-01', zone: 'A', row: '03', shelf: '01', description: '電子部品（電源・電源タップ）', isActive: true },
  { id: 'loc-009', code: 'A-03-02', zone: 'A', row: '03', shelf: '02', description: '電子部品（ネットワーク）', isActive: true },
  { id: 'loc-010', code: 'B-01-01', zone: 'B', row: '01', shelf: '01', description: '事務用品（紙類）', isActive: true },
  { id: 'loc-011', code: 'B-01-02', zone: 'B', row: '01', shelf: '02', description: '事務用品（筆記具）', isActive: true },
  { id: 'loc-012', code: 'B-02-01', zone: 'B', row: '02', shelf: '01', description: '事務用品（ファイル類）', isActive: true },
  { id: 'loc-013', code: 'B-02-02', zone: 'B', row: '02', shelf: '02', isActive: false },
  { id: 'loc-014', code: 'C-01-01', zone: 'C', row: '01', shelf: '01', description: 'PCアクセサリ（バッグ類）', isActive: true },
  { id: 'loc-015', code: 'C-02-01', zone: 'C', row: '02', shelf: '01', description: 'ストレージ（SSD・HDD）', isActive: true },
]
