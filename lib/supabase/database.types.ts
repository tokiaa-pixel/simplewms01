// Supabase テーブル定義の TypeScript 型
// Insert / Update は自己参照 Omit を避けて具体型で定義する
// （自己参照 Omit は TypeScript が循環解決に失敗し never を返す場合がある）
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
        Insert: {
          product_code:     string
          product_name_ja:  string
          product_name_en?: string | null
          unit:             string
          category:         string
          status:           string
        }
        Update: {
          product_code?:     string
          product_name_ja?:  string
          product_name_en?:  string | null
          unit?:             string
          category?:         string
          status?:           string
        }
      }

      // ─── 保管場所マスタ ───────────────────────────────────────
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
        Insert: {
          location_code: string
          location_name: string
          zone:          string
          status:        string
        }
        Update: {
          location_code?: string
          location_name?: string
          zone?:          string
          status?:        string
        }
      }

      // ─── 在庫台帳 ─────────────────────────────────────────────
      inventory: {
        Row: {
          id:            string
          qty:           number
          product_id:    string
          location_id:   string
          status:        string
          received_date: string | null   // DATE (YYYY-MM-DD)。FIFO 引当の基準日
          updated_by:    string | null
          created_at:    string
          updated_at:    string
        }
        Insert: {
          qty:             number
          product_id:      string
          location_id:     string
          status:          string
          received_date?:  string | null
          updated_by?:     string | null
        }
        Update: {
          qty?:            number
          product_id?:     string
          location_id?:    string
          status?:         string
          received_date?:  string | null
          updated_by?:     string | null
        }
      }

      // ─── 仕入先マスタ ─────────────────────────────────────────
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
        Insert: {
          supplier_code:     string
          supplier_name_ja:  string
          supplier_name_en?: string | null
          contact_name?:     string | null
          phone?:            string | null
          email?:            string | null
          address?:          string | null
          status:            string
        }
        Update: {
          supplier_code?:     string
          supplier_name_ja?:  string
          supplier_name_en?:  string | null
          contact_name?:      string | null
          phone?:             string | null
          email?:             string | null
          address?:           string | null
          status?:            string
        }
      }

      // ─── 得意先マスタ ─────────────────────────────────────────
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
        Insert: {
          customer_code:     string
          customer_name_ja:  string
          customer_name_en?: string | null
          contact_name?:     string | null
          phone?:            string | null
          email?:            string | null
          address?:          string | null
          status:            string
        }
        Update: {
          customer_code?:     string
          customer_name_ja?:  string
          customer_name_en?:  string | null
          contact_name?:      string | null
          phone?:             string | null
          email?:             string | null
          address?:           string | null
          status?:            string
        }
      }

      // ─── 入荷予定ヘッダー ─────────────────────────────────────
      arrival_headers: {
        Row: {
          id:           string
          arrival_no:   string
          supplier_id:  string
          arrival_date: string
          status:       string
          memo:         string | null
          created_by:   string | null
          created_at:   string
          updated_at:   string
        }
        Insert: {
          arrival_no:   string
          supplier_id:  string
          arrival_date: string
          status?:      string
          memo?:        string | null
          created_by?:  string | null
        }
        Update: {
          arrival_no?:   string
          supplier_id?:  string
          arrival_date?: string
          status?:       string
          memo?:         string | null
          created_by?:   string | null
        }
      }

      // ─── 入荷予定明細 ─────────────────────────────────────────
      arrival_lines: {
        Row: {
          id:                  string
          header_id:           string
          line_no:             number
          product_id:          string
          planned_qty:         number
          received_qty:        number
          planned_location_id: string | null
          actual_location_id:  string | null
          status:              string
          memo:                string | null
          created_at:          string
          updated_at:          string
        }
        Insert: {
          header_id:            string
          line_no:              number
          product_id:           string
          planned_qty:          number
          received_qty?:        number
          planned_location_id?: string | null
          actual_location_id?:  string | null
          status?:              string
          memo?:                string | null
        }
        Update: {
          header_id?:           string
          line_no?:             number
          product_id?:          string
          planned_qty?:         number
          received_qty?:        number
          planned_location_id?: string | null
          actual_location_id?:  string | null
          status?:              string
          memo?:                string | null
        }
      }

      // ─── 出庫指示 ─────────────────────────────────────────────
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
        Insert: {
          shipping_no:       string
          shipping_date:     string
          customer_id:       string
          product_id:        string
          requested_qty:     number
          shipped_qty?:      number
          from_location_id?: string | null
          status?:           string
          memo?:             string | null
          created_by?:       string | null
        }
        Update: {
          shipping_no?:       string
          shipping_date?:     string
          customer_id?:       string
          product_id?:        string
          requested_qty?:     number
          shipped_qty?:       number
          from_location_id?:  string | null
          status?:            string
          memo?:              string | null
          created_by?:        string | null
        }
      }

    }
  }
}
