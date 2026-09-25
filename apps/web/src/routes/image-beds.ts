import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { requireAuth } from '../middleware/auth'
import {
  createImageBed,
  deleteImageBed,
  listImageBeds,
  maskConfig,
  updateImageBed,
  uploadImage,
} from '../services/imagebed'
import type { ImageBedType } from '../services/imagebed-types'

export const imageBedRoutes = new Hono<AppEnv>()

const configSchema = z.record(z.string(), z.any())

const createSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(['s3', 'webdav', 'github', 'custom_http']),
  config: configSchema,
  isDefault: z.boolean().optional(),
})

imageBedRoutes.get('/image-beds', requireAuth, async (c) => {
  const list = await listImageBeds(c.env.DB)
  return c.json({
    items: list.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      is_default: item.is_default,
      enabled: item.enabled,
      created_at: item.created_at,
      updated_at: item.updated_at,
      config: maskConfig(item.type, item.config),
    })),
  })
})

imageBedRoutes.post('/image-beds', requireAuth, async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const id = await createImageBed(c.env.DB, {
    name: parsed.data.name,
    type: parsed.data.type as ImageBedType,
    config: parsed.data.config as never,
    isDefault: parsed.data.isDefault,
  })
  return c.json({ id }, 201)
})

imageBedRoutes.put('/image-beds/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema
    .partial()
    .safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  try {
    await updateImageBed(c.env.DB, id, {
      name: parsed.data.name,
      config: parsed.data.config as never,
      enabled: (body as { enabled?: boolean })?.enabled,
      isDefault: parsed.data.isDefault,
    })
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '更新失败' }, 400)
  }
})

imageBedRoutes.delete('/image-beds/:id', requireAuth, async (c) => {
  await deleteImageBed(c.env.DB, Number(c.req.param('id')))
  return c.json({ ok: true })
})

/** 上传图片：multipart form 字段 file，可选 bedId */
imageBedRoutes.post('/image-beds/upload', requireAuth, async (c) => {
  const form = await c.req.formData().catch(() => null)
  const file = form?.get('file') as Blob | string | null
  if (!file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') {
    return c.json({ error: '缺少 file 字段' }, 400)
  }
  const bedIdRaw = form?.get('bedId')
  const bedId = bedIdRaw ? Number(bedIdRaw) : undefined
  const maybeName = (file as unknown as { name?: string }).name
  const name = typeof maybeName === 'string' && maybeName ? maybeName : 'image.png'
  try {
    const result = await uploadImage(c.env.DB, bedId, file as Blob, name)
    return c.json({ result })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '上传失败' }, 502)
  }
})
