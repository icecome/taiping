import type { AdminRoute } from './types'

type Mod = {
  routeModule?: AdminRoute
  routeModules?: AdminRoute[]
}

const modules = import.meta.glob<Mod>('./*/route.tsx', { eager: true })

function collect(mod: Mod | undefined): AdminRoute[] {
  if (!mod) return []
  const list: AdminRoute[] = []
  if (mod.routeModule) list.push(mod.routeModule)
  if (mod.routeModules) list.push(...mod.routeModules)
  return list
}

export const adminRoutes: AdminRoute[] = Object.values(modules)
  .flatMap((mod) => collect(mod as Mod))
  .filter((r) => Boolean(r && r.path))
  .sort((a, b) => (a.menu?.priority ?? 99) - (b.menu?.priority ?? 99))

export const menuItems = adminRoutes
  .filter((r) => r.menu && !r.hidden)
  .map((r) => ({
    to: r.path,
    label: r.menu!.label,
    group: r.menu!.group ?? 'system',
    priority: r.menu!.priority ?? 99,
  }))
