import { useRef, useState } from 'react'
import { Plus, X, AlertCircle, RotateCw } from 'lucide-react'
import type { PictureItem } from '../../features/moment/composeState'
import { MAX_PICTURES } from '../../features/moment/composeState'

interface Props {
  pictures: PictureItem[]
  /** 直接唤起本地文件选择器（图床路径走工具栏「图片」菜单） */
  onAddLocal: () => void
  onRemove: (uid: string) => void
  onRetry: (uid: string) => void
  onReorder: (from: number, to: number) => void
  /** 已达上限或图床未配置时禁用添加入口 */
  addDisabled?: boolean
  addDisabledHint?: string
}

/**
 * 编辑态图片九宫格。
 * - 固定 3 列（窄屏由 CSS 降为 2 列），格子 1:1，不随数量变形
 * - 空位显示「+」添加入口
 * - 支持拖拽排序（HTML5 DnD，桌面端）
 */
export function ImageGridEditor({
  pictures,
  onAddLocal,
  onRemove,
  onRetry,
  onReorder,
  addDisabled = false,
  addDisabledHint,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const dragCounter = useRef(0)

  // 空态不显示「+」——此时添加入口由工具栏「图片」菜单承担；
  // 有图后才显示，用于快速追加本地图片。
  const showAdd = pictures.length > 0 && pictures.length < MAX_PICTURES

  return (
    <div className="mt-3">
      <div className="img-grid-editor">
        {pictures.map((pic, index) => (
          <div
            key={pic.uid}
            className={`img-cell-editor ${dragIndex === index ? 'dragging' : ''} ${
              overIndex === index ? 'drag-over' : ''
            }`}
            draggable={pic.status === 'done'}
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => {
              setDragIndex(null)
              setOverIndex(null)
              dragCounter.current = 0
            }}
            onDragEnter={(e) => {
              e.preventDefault()
              dragCounter.current += 1
              setOverIndex(index)
            }}
            onDragLeave={() => {
              dragCounter.current -= 1
              if (dragCounter.current <= 0) {
                dragCounter.current = 0
                setOverIndex(null)
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (dragIndex !== null && dragIndex !== index) {
                onReorder(dragIndex, index)
              }
              setDragIndex(null)
              setOverIndex(null)
              dragCounter.current = 0
            }}
          >
            <img src={pic.url} alt={pic.alt ?? ''} />

            {pic.status === 'uploading' || pic.status === 'pending' ? (
              <div className="img-cell-overlay">
                <div className="img-progress-track">
                  <div
                    className="img-progress-fill"
                    style={{ width: `${pic.status === 'pending' ? 0 : pic.percent}%` }}
                  />
                </div>
                <span className="img-progress-num">
                  {pic.status === 'pending' ? '等待中' : `${pic.percent}%`}
                </span>
              </div>
            ) : null}

            {pic.status === 'error' ? (
              <div className="img-cell-error">
                <AlertCircle size={16} />
                <span>上传失败</span>
                <button
                  type="button"
                  className="img-retry-btn"
                  onClick={() => onRetry(pic.uid)}
                >
                  <RotateCw size={11} />
                  重试
                </button>
              </div>
            ) : null}

            {pic.status === 'done' ? (
              <>
                <span className="img-cell-index">{index + 1}</span>
                <button
                  type="button"
                  className="img-cell-remove"
                  onClick={() => onRemove(pic.uid)}
                  aria-label={`移除第 ${index + 1} 张图片`}
                >
                  <X size={12} />
                </button>
              </>
            ) : null}
          </div>
        ))}

        {showAdd ? (
          <button
            type="button"
            className="img-cell-add"
            onClick={onAddLocal}
            disabled={addDisabled}
            title={addDisabled ? addDisabledHint : '添加本地图片'}
            aria-label="添加本地图片"
          >
            <Plus size={20} />
          </button>
        ) : null}
      </div>

      <div className="img-grid-meta">
        <span>
          {pictures.length}/{MAX_PICTURES} 张
          {pictures.length >= MAX_PICTURES ? ' · 已达上限' : ''}
        </span>
        {pictures.some((p) => p.status === 'uploading') ? (
          <span>正在上传 {pictures.filter((p) => p.status === 'uploading').length} 张</span>
        ) : null}
      </div>
    </div>
  )
}
