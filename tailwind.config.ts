import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './store/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy:       '#002B5C', // 郵船 ロジスティクス コーポレートネイビー
          'navy-mid': '#1A4070', // ホバー用（少し明るめ）
          blue:       '#005B99', // コーポレートブルー
          teal:       '#00A0C8', // アクセントティール
          'teal-dark':'#007A9B', // ティールホバー
          light:      '#E6F3F9', // 薄いブルー背景
          'light-2':  '#F0F7FB', // さらに薄いブルー
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 43, 92, 0.08), 0 1px 2px -1px rgba(0, 43, 92, 0.06)',
        'card-hover': '0 4px 12px 0 rgba(0, 43, 92, 0.12)',
      },
    },
  },
  plugins: [],
}

export default config
