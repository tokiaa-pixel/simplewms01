'use client'

import { createContext, useContext, useState, useEffect } from 'react'

export type UserRole = 'admin' | 'manager' | 'operator'

export interface WmsUser {
  id: string
  name: string
  email: string
  role: UserRole
}

interface AuthContextType {
  user: WmsUser | null
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  isLoading: boolean
}

const DUMMY_USERS: Array<WmsUser & { password: string }> = [
  {
    id: '1',
    name: '管理者 太郎',
    email: 'admin@wms.local',
    password: 'password123',
    role: 'admin',
  },
  {
    id: '2',
    name: '担当者 花子',
    email: 'operator@wms.local',
    password: 'password123',
    role: 'operator',
  },
]

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<WmsUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('wms_user')
      if (stored) {
        setUser(JSON.parse(stored))
      }
    } catch {
      // ignore parse errors
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string): Promise<boolean> => {
    const found = DUMMY_USERS.find(
      (u) => u.email === email && u.password === password
    )
    if (found) {
      const userData: WmsUser = {
        id: found.id,
        name: found.name,
        email: found.email,
        role: found.role,
      }
      setUser(userData)
      localStorage.setItem('wms_user', JSON.stringify(userData))
      return true
    }
    return false
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('wms_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
