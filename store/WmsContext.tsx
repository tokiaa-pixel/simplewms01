'use client'

import { createContext, useContext, useReducer } from 'react'
import type {
  ArrivalSchedule,
  ArrivalStatus,
  ShippingOrder,
  ShippingStatus,
  MasterProduct,
  Supplier,
  Customer,
  Location,
} from '@/lib/types'
import { initialArrivalSchedules } from '@/lib/data/arrivals'
import { initialShippingOrders } from '@/lib/data/shippings'
import { initialMasterProducts } from '@/lib/data/masterProducts'
import { initialSuppliers } from '@/lib/data/suppliers'
import { initialCustomers } from '@/lib/data/customers'
import { initialLocations } from '@/lib/data/locations'

// ─── アクション定義 ────────────────────────────────────────────

type WmsAction =
  // ── 入荷
  | { type: 'ADD_ARRIVAL'; payload: ArrivalSchedule }
  | {
      type: 'CONFIRM_RECEIVING'
      payload: { scheduleId: string; results: Array<{ itemId: string; qty: number }> }
    }
  // ── 出庫
  | { type: 'ADD_SHIPPING'; payload: ShippingOrder }
  | { type: 'START_PICKING'; payload: { orderId: string } }
  | {
      type: 'COMPLETE_INSPECTION'
      payload: { orderId: string; pickedItems: Array<{ itemId: string; pickedQuantity: number }> }
    }
  | { type: 'CONFIRM_SHIPPING'; payload: { orderId: string; shippedDate: string } }
  // ── マスタ
  | { type: 'ADD_PRODUCT';  payload: MasterProduct }
  | { type: 'ADD_SUPPLIER'; payload: Supplier }
  | { type: 'ADD_CUSTOMER'; payload: Customer }
  | { type: 'ADD_LOCATION'; payload: Location }
  | { type: 'TOGGLE_PRODUCT';  payload: { code: string } }
  | { type: 'TOGGLE_SUPPLIER'; payload: { id: string } }
  | { type: 'TOGGLE_CUSTOMER'; payload: { id: string } }
  | { type: 'TOGGLE_LOCATION'; payload: { id: string } }

// ─── ステート ────────────────────────────────────────────────

interface WmsState {
  arrivalSchedules: ArrivalSchedule[]
  shippingOrders: ShippingOrder[]
  masterProducts: MasterProduct[]
  suppliers: Supplier[]
  customers: Customer[]
  locations: Location[]
}

const initialState: WmsState = {
  arrivalSchedules: initialArrivalSchedules,
  shippingOrders: initialShippingOrders,
  masterProducts: initialMasterProducts,
  suppliers: initialSuppliers,
  customers: initialCustomers,
  locations: initialLocations,
}

// ─── Reducer ─────────────────────────────────────────────────

function wmsReducer(state: WmsState, action: WmsAction): WmsState {
  switch (action.type) {

    // ── 入荷 ────────────────────────────────────────────────

    case 'ADD_ARRIVAL':
      return { ...state, arrivalSchedules: [action.payload, ...state.arrivalSchedules] }

    case 'CONFIRM_RECEIVING': {
      const { scheduleId, results } = action.payload
      return {
        ...state,
        arrivalSchedules: state.arrivalSchedules.map((schedule) => {
          if (schedule.id !== scheduleId) return schedule
          const updatedItems = schedule.items.map((item) => {
            const result = results.find((r) => r.itemId === item.id)
            if (!result || result.qty <= 0) return item
            return {
              ...item,
              receivedQuantity: Math.min(item.receivedQuantity + result.qty, item.scheduledQuantity),
            }
          })
          const totalScheduled = updatedItems.reduce((s, i) => s + i.scheduledQuantity, 0)
          const totalReceived  = updatedItems.reduce((s, i) => s + i.receivedQuantity, 0)
          let newStatus: ArrivalStatus = schedule.status
          if (totalReceived >= totalScheduled) newStatus = 'completed'
          else if (totalReceived > 0)          newStatus = 'partial'
          return { ...schedule, items: updatedItems, status: newStatus }
        }),
      }
    }

    // ── 出庫 ────────────────────────────────────────────────

    case 'ADD_SHIPPING':
      return { ...state, shippingOrders: [action.payload, ...state.shippingOrders] }

    case 'START_PICKING':
      return {
        ...state,
        shippingOrders: state.shippingOrders.map((o) =>
          o.id === action.payload.orderId ? { ...o, status: 'picking' as ShippingStatus } : o
        ),
      }

    case 'COMPLETE_INSPECTION': {
      const { orderId, pickedItems } = action.payload
      return {
        ...state,
        shippingOrders: state.shippingOrders.map((order) => {
          if (order.id !== orderId) return order
          const updatedItems = order.items.map((item) => {
            const p = pickedItems.find((pi) => pi.itemId === item.id)
            return p != null ? { ...item, pickedQuantity: p.pickedQuantity } : item
          })
          return { ...order, items: updatedItems, status: 'inspected' as ShippingStatus }
        }),
      }
    }

    case 'CONFIRM_SHIPPING':
      return {
        ...state,
        shippingOrders: state.shippingOrders.map((o) =>
          o.id === action.payload.orderId
            ? { ...o, status: 'shipped' as ShippingStatus, shippedDate: action.payload.shippedDate }
            : o
        ),
      }

    // ── マスタ ───────────────────────────────────────────────

    case 'ADD_PRODUCT':
      return { ...state, masterProducts: [...state.masterProducts, action.payload] }

    case 'ADD_SUPPLIER':
      return { ...state, suppliers: [...state.suppliers, action.payload] }

    case 'ADD_CUSTOMER':
      return { ...state, customers: [...state.customers, action.payload] }

    case 'ADD_LOCATION':
      return { ...state, locations: [...state.locations, action.payload] }

    case 'TOGGLE_PRODUCT':
      return {
        ...state,
        masterProducts: state.masterProducts.map((p) =>
          p.code === action.payload.code ? { ...p, isActive: !p.isActive } : p
        ),
      }

    case 'TOGGLE_SUPPLIER':
      return {
        ...state,
        suppliers: state.suppliers.map((s) =>
          s.id === action.payload.id ? { ...s, isActive: !s.isActive } : s
        ),
      }

    case 'TOGGLE_CUSTOMER':
      return {
        ...state,
        customers: state.customers.map((c) =>
          c.id === action.payload.id ? { ...c, isActive: !c.isActive } : c
        ),
      }

    case 'TOGGLE_LOCATION':
      return {
        ...state,
        locations: state.locations.map((l) =>
          l.id === action.payload.id ? { ...l, isActive: !l.isActive } : l
        ),
      }

    default:
      return state
  }
}

// ─── Context ─────────────────────────────────────────────────

interface WmsContextType {
  state: WmsState
  addArrival: (s: ArrivalSchedule) => void
  confirmReceiving: (scheduleId: string, results: Array<{ itemId: string; qty: number }>) => void
  addShipping: (o: ShippingOrder) => void
  startPicking: (orderId: string) => void
  completeInspection: (orderId: string, pickedItems: Array<{ itemId: string; pickedQuantity: number }>) => void
  confirmShipping: (orderId: string, shippedDate: string) => void
  addProduct:  (p: MasterProduct) => void
  addSupplier: (s: Supplier) => void
  addCustomer: (c: Customer) => void
  addLocation: (l: Location) => void
  toggleProduct:  (code: string) => void
  toggleSupplier: (id: string) => void
  toggleCustomer: (id: string) => void
  toggleLocation: (id: string) => void
}

const WmsContext = createContext<WmsContextType | null>(null)

export function WmsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(wmsReducer, initialState)

  return (
    <WmsContext.Provider value={{
      state,
      addArrival:          (s) => dispatch({ type: 'ADD_ARRIVAL', payload: s }),
      confirmReceiving:    (id, r) => dispatch({ type: 'CONFIRM_RECEIVING', payload: { scheduleId: id, results: r } }),
      addShipping:         (o) => dispatch({ type: 'ADD_SHIPPING', payload: o }),
      startPicking:        (id) => dispatch({ type: 'START_PICKING', payload: { orderId: id } }),
      completeInspection:  (id, p) => dispatch({ type: 'COMPLETE_INSPECTION', payload: { orderId: id, pickedItems: p } }),
      confirmShipping:     (id, d) => dispatch({ type: 'CONFIRM_SHIPPING', payload: { orderId: id, shippedDate: d } }),
      addProduct:          (p) => dispatch({ type: 'ADD_PRODUCT', payload: p }),
      addSupplier:         (s) => dispatch({ type: 'ADD_SUPPLIER', payload: s }),
      addCustomer:         (c) => dispatch({ type: 'ADD_CUSTOMER', payload: c }),
      addLocation:         (l) => dispatch({ type: 'ADD_LOCATION', payload: l }),
      toggleProduct:       (code) => dispatch({ type: 'TOGGLE_PRODUCT', payload: { code } }),
      toggleSupplier:      (id) => dispatch({ type: 'TOGGLE_SUPPLIER', payload: { id } }),
      toggleCustomer:      (id) => dispatch({ type: 'TOGGLE_CUSTOMER', payload: { id } }),
      toggleLocation:      (id) => dispatch({ type: 'TOGGLE_LOCATION', payload: { id } }),
    }}>
      {children}
    </WmsContext.Provider>
  )
}

export function useWms() {
  const ctx = useContext(WmsContext)
  if (!ctx) throw new Error('useWms must be used within WmsProvider')
  return ctx
}
