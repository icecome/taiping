import { useCallback, useMemo, useReducer } from 'react'
import type { Moment } from '@taiping/content-model/moment'

/** 图片项：覆盖 待上传 / 上传中 / 成功 / 失败 四态 */
export interface PictureItem {
  /** 前端唯一 id，用于拖拽排序与状态追踪 */
  uid: string
  /** 上传完成后的可访问 URL */
  url: string
  alt?: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  /** 上传进度 0-100 */
  percent: number
  /** 图床返回的路径与 sha，用于删除 */
  path?: string
  sha?: string
  errorMessage?: string
}

/** 编辑内容草案：images 用 PictureItem 承载上传态 */
export interface MomentDraft {
  contentMd: string
  pictures: PictureItem[]
  tagNames: string[]
  videoUrl: string
  linkUrl: string
  linkText: string
}

export type ComposeMode = 'idle' | 'creating' | 'editing'

export interface ComposeState {
  mode: ComposeMode
  /** 编辑目标的唯一标识；新建时为 null */
  editingId: string | null
  /** 当前编辑内容 */
  draft: MomentDraft
}

export const MAX_PICTURES = 9
export const MAX_CONTENT_LENGTH = 2000

export const emptyDraft: MomentDraft = {
  contentMd: '',
  pictures: [],
  tagNames: [],
  videoUrl: '',
  linkUrl: '',
  linkText: '',
}

const initialState: ComposeState = {
  mode: 'idle',
  editingId: null,
  draft: emptyDraft,
}

export type ComposeAction =
  | { type: 'ENTER_CREATE' }
  | { type: 'ENTER_EDIT'; moment: Moment }
  | { type: 'PATCH_DRAFT'; patch: Partial<MomentDraft> }
  | { type: 'ADD_PICTURES'; pictures: PictureItem[] }
  | { type: 'UPDATE_PICTURE'; uid: string; patch: Partial<PictureItem> }
  | { type: 'REMOVE_PICTURE'; uid: string }
  | { type: 'REORDER_PICTURES'; from: number; to: number }
  | { type: 'RESET' }

/** 把已发布的 MOMENT 转为编辑草案 */
function draftFromMoment(m: Moment): MomentDraft {
  return {
    contentMd: m.contentMd,
    pictures: (m.pictures ?? []).map((p, i) => ({
      uid: `m_${m.id}_${i}`,
      url: p.url,
      alt: p.alt,
      status: 'done' as const,
      percent: 100,
    })),
    tagNames: m.tagNames ?? [],
    videoUrl: m.videoUrl ?? '',
    linkUrl: m.linkUrl ?? '',
    linkText: m.linkText ?? '',
  }
}

/**
 * 编辑状态机。
 *
 * 核心约束：mode 变为 'idle' 时 draft 必然复位 —— 这是修复
 * 「编辑成功后内容残留、再次点击发布创建新说说」缺陷的关键。
 * 所有退出编辑的路径（提交成功 / 取消 / 关闭面板）都经此收口。
 */
export function composeReducer(state: ComposeState, action: ComposeAction): ComposeState {
  switch (action.type) {
    case 'ENTER_CREATE':
      return { mode: 'creating', editingId: null, draft: emptyDraft }

    case 'ENTER_EDIT':
      return {
        mode: 'editing',
        editingId: action.moment.id,
        draft: draftFromMoment(action.moment),
      }

    case 'PATCH_DRAFT':
      if (state.mode === 'idle') return state
      return { ...state, draft: { ...state.draft, ...action.patch } }

    case 'ADD_PICTURES': {
      if (state.mode === 'idle') return state
      const room = MAX_PICTURES - state.draft.pictures.length
      if (room <= 0) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          pictures: [...state.draft.pictures, ...action.pictures.slice(0, room)],
        },
      }
    }

    case 'UPDATE_PICTURE':
      if (state.mode === 'idle') return state
      return {
        ...state,
        draft: {
          ...state.draft,
          pictures: state.draft.pictures.map((p) =>
            p.uid === action.uid ? { ...p, ...action.patch } : p,
          ),
        },
      }

    case 'REMOVE_PICTURE':
      if (state.mode === 'idle') return state
      return {
        ...state,
        draft: {
          ...state.draft,
          pictures: state.draft.pictures.filter((p) => p.uid !== action.uid),
        },
      }

    case 'REORDER_PICTURES': {
      if (state.mode === 'idle') return state
      const list = [...state.draft.pictures]
      const { from, to } = action
      if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) {
        return state
      }
      const [moved] = list.splice(from, 1)
      if (!moved) return state
      list.splice(to, 0, moved)
      return { ...state, draft: { ...state.draft, pictures: list } }
    }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

export function useComposeState() {
  const [state, dispatch] = useReducer(composeReducer, initialState)

  const actions = useMemo(
    () => ({
      enterCreate: () => dispatch({ type: 'ENTER_CREATE' }),
      enterEdit: (moment: Moment) => dispatch({ type: 'ENTER_EDIT', moment }),
      patchDraft: (patch: Partial<MomentDraft>) => dispatch({ type: 'PATCH_DRAFT', patch }),
      addPictures: (pictures: PictureItem[]) => dispatch({ type: 'ADD_PICTURES', pictures }),
      updatePicture: (uid: string, patch: Partial<PictureItem>) =>
        dispatch({ type: 'UPDATE_PICTURE', uid, patch }),
      removePicture: (uid: string) => dispatch({ type: 'REMOVE_PICTURE', uid }),
      reorderPictures: (from: number, to: number) =>
        dispatch({ type: 'REORDER_PICTURES', from, to }),
      reset: () => dispatch({ type: 'RESET' }),
    }),
    [],
  )

  /** 是否有图片正在上传 —— 用于阻断发布 */
  const hasUploading = useMemo(
    () => state.draft.pictures.some((p) => p.status === 'pending' || p.status === 'uploading'),
    [state.draft.pictures],
  )

  /** 是否有图片上传失败 */
  const hasFailed = useMemo(
    () => state.draft.pictures.some((p) => p.status === 'error'),
    [state.draft.pictures],
  )

  /** 是否可提交 */
  const canSubmit = useMemo(() => {
    if (state.mode === 'idle') return false
    if (!state.draft.contentMd.trim()) return false
    if (hasUploading || hasFailed) return false
    return true
  }, [state.mode, state.draft.contentMd, hasUploading, hasFailed])

  /** 转为 API 载荷。author 由调用方注入（无多用户体系，取站点设置作者）。 */
  const toPayload = useCallback(
    (author?: string): {
      contentMd: string
      pictures: Array<{ url: string; alt?: string }>
      tagNames: string[]
      videoUrl?: string
      linkUrl?: string
      linkText?: string
      author?: string
      status: 'published'
    } => ({
      contentMd: state.draft.contentMd.trim(),
      pictures: state.draft.pictures
        .filter((p) => p.status === 'done')
        .map((p) => ({ url: p.url, alt: p.alt })),
      tagNames: state.draft.tagNames,
      videoUrl: state.draft.videoUrl || undefined,
      linkUrl: state.draft.linkUrl || undefined,
      linkText: state.draft.linkText || undefined,
      author: author?.trim() || undefined,
      status: 'published',
    }),
    [state.draft],
  )

  return { state, ...actions, hasUploading, hasFailed, canSubmit, toPayload }
}
