import { useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/endpoints'
import { getActiveMediaConfig } from '@taiping/content-model/settings'
import {
  blobToBase64,
  compressImage,
  resolveRenameTemplate,
  MAX_FILE_SIZE,
  type MediaFile,
} from '../../lib/mediaUtils'
import type { PictureItem } from './composeState'
import { MAX_PICTURES } from './composeState'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/** 超过 1MB 才压缩，避免小图浪费 CPU */
const COMPRESS_THRESHOLD = 1024 * 1024

export interface UploadOutcome {
  rejected: Array<{ name: string; reason: string }>
  uploaded: PictureItem[]
  failed: Array<{ name: string; reason: string }>
}

interface Options {
  onPictureUpdate: (uid: string, patch: Partial<PictureItem>) => void
  /** 读取当前图片数（用 getter 避免闭包捕获旧值） */
  currentCount: () => number
}

/**
 * 图片上传：校验 → 压缩 → 上传至图床 → 回报进度。
 * 串行上传以保持用户选择顺序，避免插入顺序错乱。
 */
export function useMediaUpload({ onPictureUpdate, currentCount }: Options) {
  const abortRef = useRef<AbortController | null>(null)

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  })

  const listQuery = useQuery({
    queryKey: ['media-github'],
    queryFn: () => api.media.githubList(),
  })

  const configured = listQuery.data?.configured ?? false
  const missingHint = listQuery.data?.missingHint

  /** 上传单个文件；uid 由调用方传入，用于进度回报 */
  const uploadOne = useCallback(
    async (uid: string, file: File): Promise<Omit<PictureItem, 'uid'>> => {
      const quality = settings.data ? (getActiveMediaConfig(settings.data)?.quality ?? 80) : 80
      const rename =
        (settings.data && getActiveMediaConfig(settings.data)?.renameTemplate) ||
        '{Y}{m}{d}-{str-6}'

      const needsCompress = file.size > COMPRESS_THRESHOLD
      const blob = needsCompress ? await compressImage(file, quality) : file
      const base64 = await blobToBase64(blob)
      const ext = needsCompress ? 'webp' : (file.name.split('.').pop() ?? 'jpg')
      const filename = `${resolveRenameTemplate(rename, file.name)}.${ext}`

      const controller = new AbortController()
      abortRef.current = controller

      const result = await api.media.githubUploadWithProgress(
        { base64Content: base64, filename, message: `[skip ci] upload: ${filename}` },
        (percent) => onPictureUpdate(uid, { percent, status: 'uploading' }),
        { signal: controller.signal, timeoutMs: 60_000 },
      )

      return {
        url: result.url,
        alt: file.name,
        status: 'done' as const,
        percent: 100,
        path: result.path,
        sha: result.sha,
      }
    },
    [settings.data, onPictureUpdate],
  )

  const uploadFiles = useCallback(
    async (
      files: File[],
      onAdd: (items: PictureItem[]) => void,
    ): Promise<UploadOutcome> => {
      const outcome: UploadOutcome = { rejected: [], uploaded: [], failed: [] }

      const room = MAX_PICTURES - currentCount()
      if (room <= 0) {
        outcome.rejected.push({
          name: `${files.length} 个文件`,
          reason: `最多 ${MAX_PICTURES} 张`,
        })
        return outcome
      }

      const accepted: File[] = []
      for (const file of files) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          outcome.rejected.push({ name: file.name, reason: '格式不支持' })
          continue
        }
        if (file.size > MAX_FILE_SIZE) {
          outcome.rejected.push({ name: file.name, reason: '超过 20MB' })
          continue
        }
        if (accepted.length >= room) {
          outcome.rejected.push({ name: file.name, reason: `最多 ${MAX_PICTURES} 张` })
          continue
        }
        accepted.push(file)
      }

      if (!accepted.length) return outcome

      // 以 pending 态入列，保持选择顺序与九宫格位置
      const stamp = Date.now()
      const placeholders: PictureItem[] = accepted.map((file, i) => ({
        uid: `u_${stamp}_${i}`,
        url: URL.createObjectURL(file),
        alt: file.name,
        status: 'pending',
        percent: 0,
      }))
      onAdd(placeholders)

      // 串行上传以保证顺序
      for (let i = 0; i < accepted.length; i += 1) {
        const file = accepted[i]
        const placeholder = placeholders[i]
        if (!file || !placeholder) continue
        onPictureUpdate(placeholder.uid, { status: 'uploading', percent: 0 })
        try {
          const done = await uploadOne(placeholder.uid, file)
          onPictureUpdate(placeholder.uid, done)
          outcome.uploaded.push({ ...done, uid: placeholder.uid })
        } catch (e) {
          const reason = e instanceof Error ? e.message : '上传失败'
          onPictureUpdate(placeholder.uid, { status: 'error', errorMessage: reason })
          outcome.failed.push({ name: file.name, reason })
        }
      }

      return outcome
    },
    [currentCount, onPictureUpdate, uploadOne],
  )

  /** 重试失败的单张 */
  const uploadSingle = useCallback(
    async (uid: string, file: File): Promise<boolean> => {
      onPictureUpdate(uid, { status: 'uploading', percent: 0, errorMessage: undefined })
      try {
        const done = await uploadOne(uid, file)
        onPictureUpdate(uid, done)
        return true
      } catch (e) {
        onPictureUpdate(uid, {
          status: 'error',
          errorMessage: e instanceof Error ? e.message : '上传失败',
        })
        return false
      }
    },
    [onPictureUpdate, uploadOne],
  )

  /** 从图床选择器插入已存在的图片 */
  const insertFromLibrary = useCallback((files: MediaFile[]): PictureItem[] => {
    const stamp = Date.now()
    return files.map((f, i) => ({
      uid: `lib_${stamp}_${i}`,
      url: f.url,
      alt: f.name,
      status: 'done' as const,
      percent: 100,
      path: f.path,
      sha: f.sha,
    }))
  }, [])

  return { configured, missingHint, uploadFiles, uploadSingle, insertFromLibrary }
}
