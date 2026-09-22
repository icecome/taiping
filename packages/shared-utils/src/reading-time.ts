/**
 * 中文阅读时长分级（对齐拙素站点文案）。
 * 阈值按常见中文阅读速度估算，后续可对照现站校准。
 */
const LEVELS: Array<{ maxMinutes: number; label: string }> = [
  { maxMinutes: 2, label: '弹指可览' },
  { maxMinutes: 5, label: '片刻即毕' },
  { maxMinutes: 10, label: '阅需一刻' },
  { maxMinutes: 20, label: '半炷香时' },
  { maxMinutes: 40, label: '一炷香时' },
  { maxMinutes: Number.POSITIVE_INFINITY, label: '细品慢读' },
]

export function countWords(text: string): number {
  if (!text) return 0
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#>*_\-~\[\]()!]/g, ' ')
  const cjk = cleaned.match(/[一-鿿㐀-䶿]/g)?.length ?? 0
  const latin = cleaned.match(/[A-Za-z0-9]+/g)?.length ?? 0
  return cjk + latin
}

export function readingMinutes(text: string, charsPerMinute = 400): number {
  const words = countWords(text)
  return Math.max(1, Math.ceil(words / Math.max(60, charsPerMinute)))
}

export function readingTimeLabel(text: string): string {
  const minutes = readingMinutes(text)
  const hit = LEVELS.find((item) => minutes <= item.maxMinutes)
  return hit?.label ?? LEVELS[LEVELS.length - 1]!.label
}
