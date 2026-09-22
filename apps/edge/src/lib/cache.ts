import { createId } from '@taiping/shared-utils'

export function newId(prefix: string): string {
  return createId(prefix)
}
