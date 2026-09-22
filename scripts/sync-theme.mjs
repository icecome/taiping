#!/usr/bin/env node
/**
 * 主题静态资源同步：themes/zhuosu/src/{scripts,styles} → apps/studio/public/theme/
 * 真源为 themes/zhuosu；public 为 Studio 预览用副本。
 * 用法：node scripts/sync-theme.mjs [--check]
 *   --check  仅比对不一致并退出码 1（供 CI）
 */
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = join(root, 'themes', 'zhuosu', 'src')
const destRoot = join(root, 'apps', 'studio', 'public', 'theme')
const checkOnly = process.argv.includes('--check')

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

async function main() {
  const sources = []
  for (const sub of ['scripts', 'styles']) {
    const dir = join(srcRoot, sub)
    sources.push(...(await walk(dir)))
  }

  const drifted = []
  for (const src of sources) {
    const rel = relative(srcRoot, src)
    const dest = join(destRoot, rel)
    try {
      const [a, b] = await Promise.all([sha256(src), sha256(dest)])
      if (a !== b) drifted.push(rel.split(sep).join('/'))
    } catch {
      drifted.push(rel.split(sep).join('/'))
    }
  }

  // 脏副本：public 中存在但真源没有的文件
  const orphans = []
  for (const sub of ['scripts', 'styles']) {
    const dir = join(destRoot, sub)
    try {
      await stat(dir)
    } catch {
      continue
    }
    for (const file of await walk(dir)) {
      const rel = relative(destRoot, file)
      const src = join(srcRoot, rel)
      try {
        await stat(src)
      } catch {
        orphans.push(rel.split(sep).join('/'))
      }
    }
  }

  if (checkOnly) {
    if (drifted.length || orphans.length) {
      if (drifted.length) console.error('theme drift:', drifted.join(', '))
      if (orphans.length) console.error('theme orphans:', orphans.join(', '))
      process.exit(1)
    }
    console.log('theme in sync')
    return
  }

  for (const rel of orphans) {
    await rm(join(destRoot, rel), { force: true })
    console.log('removed orphan', rel)
  }
  for (const sub of ['scripts', 'styles']) {
    await mkdir(join(destRoot, sub), { recursive: true })
    await cp(join(srcRoot, sub), join(destRoot, sub), { recursive: true })
  }
  console.log(`synced ${sources.length} files → apps/studio/public/theme`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
