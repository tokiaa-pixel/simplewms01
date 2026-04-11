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
      suppliers: {
        Row: {
          id:         string
          created_at: string
          updated_at: string
          [key: string]: unknown
        }
        Insert: Omit<Database['public']['Tables']['suppliers']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['suppliers']['Insert']>
      }

      // ─── 得意先マスタ ─────────────────────────────────────────
      customers: {
        Row: {
          id:         string
          created_at: string
          updated_at: string
          [key: string]: unknown
        }
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }

      // ─── 入荷予定 ─────────────────────────────────────────────
      arrivals: {
        Row: {
          id:         string
          created_at: string
          updated_at: string
          [key: string]: unknown
        }
        Insert: Omit<Database['public']['Tables']['arrivals']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['arrivals']['Insert']>
      }

      // ─── 出庫指示 ─────────────────────────────────────────────
      shippings: {
        Row: {
          id:         string
          created_at: string
          updated_at: string
          [key: string]: unknown
        }
        Insert: Omit<Database['public']['Tables']['shippings']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['shippings']['Insert']>
      }
    }
  }
}
