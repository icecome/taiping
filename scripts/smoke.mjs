import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const edgeDir = path.resolve(__dirname, '../apps/edge')
const port = 8788
const base = `http://127.0.0.1:${port}`

const USER = process.env.TAIPING_USER || 'admin'
const PASS = process.env.TAIPING_PASS
if (!PASS) {
  console.error('缺少 TAIPING_PASS 环境变量。示例：')
  console.error('  $env:TAIPING_PASS = "<管理口令>"; node scripts/smoke.mjs')
  process.exit(1)
}

// 通过 wrangler 自己的 JS 入口启动，避免硬编码 pnpm 存储哈希路径
const wranglerCli = path.resolve(edgeDir, 'node_modules/wrangler/bin/wrangler.js')
const nodeBin = process.execPath
const wrangler = spawn(nodeBin, [wranglerCli, 'dev', '--port', String(port)], {
  cwd: edgeDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
})

let logs = ''
wrangler.stdout.on('data', (b) => {
  logs += String(b)
  process.stdout.write(String(b))
})
wrangler.stderr.on('data', (b) => {
  logs += String(b)
  process.stderr.write(String(b))
})

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/api/health`)
      if (res.ok) return true
    } catch {
      // retry
    }
    await sleep(500)
  }
  return false
}

try {
  const ready = await waitForServer()
  if (!ready) {
    console.error('SERVER_NOT_READY')
    console.error(logs.slice(-2000))
    process.exitCode = 1
  } else {
    const home = await fetch(`${base}/`)
    const homeText = await home.text()
    console.log(
      'HOME',
      home.status,
      'paper-texture=',
      homeText.includes('paper-texture'),
      'title=',
      homeText.includes('三无亦拾吾'),
      'len=',
      homeText.length,
    )

    const loginRes = await fetch(`${base}/api/admin/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        username: USER,
        password: PASS,
        trusted: true,
      }),
    })
    const loginJson = await loginRes.json()
    console.log('LOGIN', loginRes.status, JSON.stringify(loginJson))
    const setCookie = loginRes.headers.get('set-cookie') || ''
    const cookie = setCookie.split(';')[0]
    console.log('COOKIE', cookie)

    const ov = await fetch(`${base}/api/admin/overview`, {
      headers: { Cookie: cookie },
    })
    console.log('OVERVIEW', ov.status, await ov.text())

    const unauth = await fetch(`${base}/api/admin/overview`)
    console.log('UNAUTH', unauth.status, await unauth.text())
  }
} finally {
  wrangler.kill()
}
