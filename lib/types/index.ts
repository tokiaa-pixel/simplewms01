// ─── 在庫ステータス ───────────────────────────────────────────

export type InventoryStatus = 'normal' | 'low' | 'out_of_stock' | 'excess'

export const INVENTORY_STATUS_CONFIG: Record<
  InventoryStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  normal: {
    label: '適正',
    badgeClass: 'bg-green-50 text-green-700 ring-1 ring-green-200',
    dotClass: 'bg-green-500',
  },
  low: {
    label: '残少',
    badgeClass: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    dotClass: 'bg-amber-500',
  },
  out_of_stock: {
    label: '在庫なし',
    badgeClass: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    dotClass: 'bg-red-500',
  },
  excess: {
    label: '過剰',
    badgeClass: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    dotClass: 'bg-blue-500',
  },
}

export interface InventoryItem {
  id: string
  productCode: string
  productName: string
  category: string
  quantity: number
  unit: string
  locationCode: string
  status: InventoryStatus
  minStock: number
  maxStock: number
  updatedAt: string
  lotNumber?: string
  supplierName?: string
  note?: string
}

// ─── 入荷予定ステータス ────────────────────────────────────────

export type ArrivalStatus = 'pending' | 'partial' | 'completed' | 'cancelled'

export const ARRIVAL_STATUS_CONFIG: Record<
  ArrivalStatus,
  { label: string; badgeClass: string }
> = {
  pending: {
    label: '未着荷',
    badgeClass: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  },
  partial: {
    label: '一部入庫',
    badgeClass: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  },
  completed: {
    label: '入庫完了',
    badgeClass: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  },
  cancelled: {
    label: 'キャンセル',
    badgeClass: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  },
}

// ─── 入荷予定 ────────────────────────────────────────────────

/** 入荷予定の明細1行 */
export interface ArrivalScheduleItem {
  id: string
  productCode: string
  productName: string
  scheduledQuantity: number   // 予定数量
  receivedQuantity: number    // 入庫済み数量
  locationCode: string        // 保管予定場所（棚番）
}

/** 入荷予定ヘッダー */
export interface ArrivalSchedule {
  id: string
  code: string            // 入荷予定番号 e.g. "ARR-2024-0001"
  supplierId: string
  supplierName: string
  scheduledDate: string   // 入荷予定日 (YYYY/MM/DD)
  status: ArrivalStatus
  items: ArrivalScheduleItem[]
  createdAt: string       // 登録日 (YYYY/MM/DD)
  note?: string
}

// ─── マスタ ──────────────────────────────────────────────────

export interface Supplier {
  id: string
  code: string
  name: string
  contact?: string      // 担当者名
  phone?: string
  email?: string
  leadTimeDays?: number // 発注リードタイム（日）
  isActive: boolean
}

export interface Customer {
  id: string
  code: string
  name: string
  contact?: string
  phone?: string
  address?: string
  isActive: boolean
}

export interface MasterProduct {
  code: string          // P-0001（id 兼用）
  name: string
  unit: string
  category: string
  unitPrice?: number
  minStock?: number
  maxStock?: number
  isActive: boolean
}

export interface Location {
  id: string
  code: string          // e.g. "A-01-03"
  zone: string          // e.g. "A"
  row: string           // e.g. "01"
  shelf: string         // e.g. "03"
  description?: string
  isActive: boolean
}

// ─── 出庫ステータス ────────────────────────────────────────────

/**
 * pending   → 未処理（出庫指示登録済み）
 * picking   → ピッキング中
 * inspected → 検品済み（梱包済み）
 * shipped   → 出庫完了
 * cancelled → キャンセル
 */
export type ShippingStatus =
  | 'pending'
  | 'picking'
  | 'inspected'
  | 'shipped'
  | 'cancelled'

export const SHIPPING_STATUS_CONFIG: Record<
  ShippingStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  pending: {
    label: '未処理',
    badgeClass: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    dotClass: 'bg-slate-400',
  },
  picking: {
    label: 'ピッキング中',
    badgeClass: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    dotClass: 'bg-blue-500',
  },
  inspected: {
    label: '検品済み',
    badgeClass: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
    dotClass: 'bg-purple-500',
  },
  shipped: {
    label: '出庫完了',
    badgeClass: 'bg-green-50 text-green-700 ring-1 ring-green-200',
    dotClass: 'bg-green-500',
  },
  cancelled: {
    label: 'キャンセル',
    badgeClass: 'bg-red-50 text-red-600 ring-1 ring-red-200',
    dotClass: 'bg-red-400',
  },
}

// ─── 出庫指示 ────────────────────────────────────────────────

export interface ShippingOrderItem {
  id: string
  productCode: string
  productName: string
  unit: string
  orderedQuantity: number   // 指示数量
  pickedQuantity: number    // 検品時に確定する実績数量
  locationCode: string      // 出庫元ロケーション
}

export interface ShippingOrder {
  id: string
  code: string              // SHP-2024-0001
  customerId: string
  customerName: string
  requestedDate: string     // 出庫予定日
  shippedDate?: string      // 実際の出荷日（出庫確定時に設定）
  status: ShippingStatus
  items: ShippingOrderItem[]
  createdAt: string
  note?: string
}
