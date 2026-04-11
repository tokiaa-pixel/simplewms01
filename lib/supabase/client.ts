import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[Supabase] 環境変数が設定されていません。\n' +
    '.env.local.example を .env.local にコピーして\n' +
    'NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。'
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)
