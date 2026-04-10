'use client'

import { Search, X } from 'lucide-react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function SearchInput({
  value,
  onChange,
  placeholder = '検索',
  className = '',
}: SearchInputProps) {
  return (
    <div className={`relative flex-1 min-w-48 max-w-xs ${className}`}>
      <Search
        size={13}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-7 py-1.5 text-sm border border-slate-300 rounded-md
                   focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent
                   placeholder-slate-400 bg-white"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label="クリア"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
