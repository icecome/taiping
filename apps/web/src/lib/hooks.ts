export type HookName =
  | 'app.begin'
  | 'app.end'
  | 'content.beforeSave'
  | 'content.filter'
  | 'comment.beforeCreate'
  | 'comment.filter'
  | 'theme.context'
  | 'response.beforeSend'

type AnyFn = (...args: unknown[]) => unknown

const hooks = new Map<HookName, Array<{ weight: number; fn: AnyFn }>>()

export function on(name: HookName, fn: AnyFn, weight = 10): void {
  const list = hooks.get(name) ?? []
  list.push({ weight, fn })
  list.sort((a, b) => a.weight - b.weight)
  hooks.set(name, list)
}

export function call(name: HookName, ...args: unknown[]): void {
  for (const { fn } of hooks.get(name) ?? []) {
    fn(...args)
  }
}

export function filter<T>(name: HookName, value: T, ...rest: unknown[]): T {
  let current = value
  for (const { fn } of hooks.get(name) ?? []) {
    const next = fn(current, ...rest)
    if (next !== undefined && next !== null) {
      current = next as T
    }
  }
  return current
}
