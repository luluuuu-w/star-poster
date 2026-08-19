/**
 * 版型画廊：把同一张照片套进全部内置版型，各截一张图。
 *
 * 结构化断言只能保证模板「产出了图层、几何合法」，看不出排版是不是真的成立、
 * 有没有元素叠在一起。这个脚本把结果摊开，方便一眼扫过去发现问题。
 *
 * 用法：先起 dev server，再 node scripts/gallery.mjs [端口]
 */

import puppeteer from 'puppeteer-core'
import { writeFileSync, mkdirSync } from 'node:fs'
import { PNG_FIXTURES } from './fixtures.mjs'

/** 同 e2e.mjs：参数可以是端口号，也可以是完整地址（用于测子路径部署）。 */
const ARG = process.argv[2] ?? '5179'
const BASE = /^https?:\/\//.test(ARG)
  ? ARG.replace(/\/$/, '')
  : `http://localhost:${ARG}`
/** 首页地址。子路径部署时必须带结尾斜杠，详见 e2e.mjs 的说明。 */
const HOME = `${BASE}/`
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = 'e2e-out/gallery'

mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1100, deviceScaleFactor: 1 })

const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// 用暖调人像，最贴近真实使用场景
const fixture = PNG_FIXTURES[0]
const imgPath = `${OUT}/_source.png`
writeFileSync(imgPath, Buffer.from(fixture.base64, 'base64'))

await page.goto(HOME, { waitUntil: 'networkidle0' })

await page.evaluate(() => {
  const set = (sel, val) => {
    const el = document.querySelector(sel)
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, val)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  set('#t-title', '林素怀')
  set('#t-sub', 'LIN SUHUAI')
  set('#t-cap', '2026 春季特辑 · 上海')
})

const input = await page.$('input[type=file]')
await input.uploadFile(imgPath)
await page.waitForFunction(() => location.hash.startsWith('#/editor/'), { timeout: 25000 })
await page.waitForSelector('canvas', { timeout: 15000 })
await new Promise((r) => setTimeout(r, 1500))

// 打开版型面板，读出全部模板名
await page.evaluate(() => {
  ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '版型')?.click()
})
await new Promise((r) => setTimeout(r, 500))

const names = await page.evaluate(() =>
  [...document.querySelectorAll('[data-template-name]')].map((e) => e.dataset.templateName),
)

console.log(`发现 ${names.length} 套版型\n`)

/** 只截画布那一块，不含 UI。 */
async function shotCanvas(label) {
  const el = await page.$('canvas')
  const box = await el.boundingBox()
  await page.screenshot({
    path: `${OUT}/${label}.png`,
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  })
}

let index = 0
for (const name of names) {
  index++
  const safe = `${String(index).padStart(2, '0')}-${name}`

  const active = await page.evaluate(
    (n) =>
      document.querySelector(`[data-template-name="${n}"]`)?.dataset.templateActive === 'true',
    name,
  )

  if (!active) {
    const ok = await page.evaluate((n) => {
      const card = document.querySelector(`[data-template-name="${n}"]`)
      const apply = [...(card?.querySelectorAll('button') ?? [])].find(
        (b) => b.textContent.trim() === '套用',
      )
      if (!apply) return false
      apply.click()
      return true
    }, name)

    if (!ok) {
      console.log(`  ! ${name}：点不到套用按钮`)
      continue
    }

    await new Promise((r) => setTimeout(r, 250))
    await page.evaluate((n) => {
      const card = document.querySelector(`[data-template-name="${n}"]`)
      const confirm = [...(card?.querySelectorAll('button') ?? [])].find(
        (b) => b.textContent.trim() === '确认',
      )
      confirm?.click()
    }, name)
    await new Promise((r) => setTimeout(r, 1100))
  }

  // 统计画布颜色数和图层数：空白或元素太少一眼能看出来
  const stats = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    const seen = new Set()
    for (let i = 0; i < d.length; i += 4 * 17) {
      seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
    }
    const t = [...document.querySelectorAll('.panel-title')].find((e) =>
      e.textContent.startsWith('图层'),
    )
    return {
      colors: seen.size,
      layers: t ? parseInt(t.textContent.match(/\((\d+)\)/)?.[1] ?? '0', 10) : 0,
    }
  })

  await shotCanvas(safe)
  const warn = stats.colors < 40 ? '   ← 颜色太少，可能没渲染出来' : ''
  console.log(`  ${safe}：${stats.layers} 图层，${stats.colors} 色${warn}`)
}

if (errors.length > 0) {
  console.log(`\n页面异常 ${errors.length} 条：`)
  for (const e of [...new Set(errors)]) console.log(`  ! ${e}`)
} else {
  console.log('\n无页面异常')
}

console.log(`\n截图在 ${OUT}/`)
await browser.close()
