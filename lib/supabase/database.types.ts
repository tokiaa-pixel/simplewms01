// Supabase テーブル定義の TypeScript 型
// 実際の Supabase テーブルのカラム構成に合わせて定義
// （将来的には `supabase gen types typescript` で自動生成可能）

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

export interface Database {
  public: {
    Tables: {
      // ─── 商品マスタ ───────────────────────────────────────────
      // 確認済みカラム: id, product_code, category, unit, status, created_at, updated_at
      products: {
        Row: {
          id:               string
          product_code:     string
          product_name_ja:  string
          product_name_en:  string | null
          unit:             string
          category:         string
          status:           string
          created_at:       string
          updated_at:       string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }

      // ─── 保管場所マスタ ───────────────────────────────────────
      // 確認済みカラム: id, location_code, zone, status, created_at, updated_at
      locations: {
        Row: {
          id:            string
          location_code: string
          location_name: string
          zone:          string
          status:        string
          created_at:    string
          updated_at:    string
        }
        Insert: Omit<Database['public']['Tables']['locations']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['locations']['Insert']>
      }

      // ─── 在庫台帳 ─────────────────────────────────────────────
      // 確認済みカラム: id, qty, product_id, location_id, status, updated_by, created_at, updated_at
      inventory: {
        Row: {
          id:          string
          qty:         number
          product_id:  string
          location_id: string
          status:      string
          updated_by:  string | null
          created_at:  string
          updated_at:  string
        }
        Insert: Omit<Database['public']['Tables']['inventory']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['inventory']['Insert']>
      }

      // ─── 仕入先マスタ ─────────────────────────────────────────
      // 確認済みカラム: supplier_code, supplier_name_ja, supplier_name_en,
      //                contact_name, phone, email, address, status
      suppliers: {
        Row: {
          id:               string
          supplier_code:    string
          supplier_name_ja: string
          supplier_name_en: string | null
          contact_name:     string | null
          phone:            string | null
          email:            string | null
          address:          string | null
          status:           string
          created_at:       string
          updated_at:       string
        }
        Insert: Omit<Database['public']['Tables']['suppliers']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['suppliers']['Insert']>
      }

      // ─── 得意先マスタ ─────────────────────────────────────────
      // 確認済みカラム: customer_code, customer_name_ja, customer_name_en,
      //                contact_name, phone, email, address, status
      customers: {
        Row: {
          id:               string
          customer_code:    string
          customer_name_ja: string
          customer_name_en: string | null
          contact_name:     string | null
          phone:            string | null
          email:            string | null
          address:          string | null
          status:           string
          created_at:       string
          updated_at:       string
        }
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }

      // ─── 入荷予定 ─────────────────────────────────────────────
      // 確認済みカラム: arrival_no, supplier_id, arrival_date, product_id,
      //                planned_qty, received_qty, planned_location_id,
      //                actual_location_id, status, memo, created_by
      arrivals: {
        Row: {
          id:                  string
          arrival_no:          string
          supplier_id:         string
          arrival_date:        string
          product_id:          string
          planned_qty:         number
          received_qty:        number
          planned_location_id: string | null
          actual_location_id:  string | null
          status:              string
          memo:                string | null
          created_by:          string | null
          created_at:          string
          updated_at:          string
        }
        Insert: Omit<Database['public']['Tables']['arrivals']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['arrivals']['Insert']>
      }

      // ─── 出庫指示 ─────────────────────────────────────────────
      // 確認済みカラム: shipping_no, shipping_date, customer_id, product_id,
      //                requested_qty, shipped_qty, from_location_id,
      //                status, memo, created_by
      shippings: {
        Row: {
          id:               string
          shipping_no:      string
          shipping_date:    string
          customer_id:      string
          product_id:       string
          requested_qty:    number
          shipped_qty:      number
          from_location_id: string | null
          status:           string
          memo:             string | null
          created_by:       string | null
          created_at:       string
          updated_at:       string
        }
        Insert: Omit<Database['public']['Tables']['shippings']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['shippings']['Insert']>
      }
    }
  }
}
