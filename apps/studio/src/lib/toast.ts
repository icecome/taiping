import { create } from 'zustand'

export interface ToastItem {
  id: string
  message: string
  type: 'ok' | 'error'
}

interface ToastState {
  items: ToastItem[]
  push: (message: string, type?: ToastItem['type']) => void
  remove: (id: string) => void
}

let seq = 0

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (message, type = 'ok') => {
    const id = `t${++seq}`
    set((s) => ({ items: [...s.items, { id, message, type }] }))
    window.setTimeout(() => {
      set((s) => ({ items: s.items.filter((t) => t.id !== id) }))
    }, 2800)
  },
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}))

export function toast(message: string, type: ToastItem['type'] = 'ok') {
  useToastStore.getState().push(message, type)
}
