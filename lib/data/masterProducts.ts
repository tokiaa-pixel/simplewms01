import type { MasterProduct } from '@/lib/types'

export const initialMasterProducts: MasterProduct[] = [
  { code: 'P-0001', name: 'USBケーブル Type-C 1m',     unit: '本',    category: '電子部品',    unitPrice: 480,   minStock: 50,  maxStock: 200, isActive: true },
  { code: 'P-0002', name: 'HDMIケーブル 2m',            unit: '本',    category: '電子部品',    unitPrice: 980,   minStock: 30,  maxStock: 150, isActive: true },
  { code: 'P-0003', name: 'マウス（ワイヤレス）',        unit: '個',    category: '周辺機器',    unitPrice: 2980,  minStock: 10,  maxStock: 50,  isActive: true },
  { code: 'P-0004', name: 'キーボード（JIS配列）',       unit: '個',    category: '周辺機器',    unitPrice: 4980,  minStock: 20,  maxStock: 100, isActive: true },
  { code: 'P-0005', name: 'A4コピー用紙 500枚/箱',      unit: '箱',    category: '事務用品',    unitPrice: 650,   minStock: 30,  maxStock: 200, isActive: true },
  { code: 'P-0006', name: 'ボールペン（黒）10本セット', unit: 'セット', category: '事務用品',    unitPrice: 330,   minStock: 20,  maxStock: 100, isActive: true },
  { code: 'P-0007', name: 'クリアファイル A4 10枚入',   unit: 'パック', category: '事務用品',    unitPrice: 220,   minStock: 15,  maxStock: 60,  isActive: true },
  { code: 'P-0008', name: 'ノートPCバッグ 15インチ',    unit: '個',    category: 'PCアクセサリ', unitPrice: 3480,  minStock: 10,  maxStock: 40,  isActive: true },
  { code: 'P-0009', name: '電源タップ 4口 2m',          unit: '個',    category: '電子部品',    unitPrice: 1580,  minStock: 15,  maxStock: 60,  isActive: true },
  { code: 'P-0010', name: 'LANケーブル CAT6 5m',        unit: '本',    category: '電子部品',    unitPrice: 780,   minStock: 30,  maxStock: 100, isActive: true },
  { code: 'P-0011', name: 'USBハブ 7ポート',            unit: '個',    category: '周辺機器',    unitPrice: 2480,  minStock: 20,  maxStock: 100, isActive: true },
  { code: 'P-0012', name: 'ポータブルSSD 1TB',          unit: '個',    category: 'ストレージ',  unitPrice: 12800, minStock: 15,  maxStock: 50,  isActive: true },
  { code: 'P-0013', name: 'Webカメラ FHD 1080p',        unit: '個',    category: '周辺機器',    unitPrice: 5980,  minStock: 20,  maxStock: 60,  isActive: true },
]
