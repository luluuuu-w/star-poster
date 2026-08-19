/**
 * 端到端冒烟验证脚本。
 *
 * 用真实浏览器跑一遍「上传 -> 自动分析 -> 生成海报 -> 导出 PNG」，
 * 这是单元测试覆盖不到的部分：Konva 渲染、Web Worker、IndexedDB、字体测量。
 *
 * 用法：先起 dev server，再 node scripts/e2e.mjs [端口]
 */

import puppeteer from 'puppeteer-core'
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { PNG_FIXTURES } from './fixtures.mjs'

/**
 * 第一个参数可以是端口号，也可以是完整地址。
 *
 * 支持完整地址是为了能测「部署后的真实形态」—— GitHub Pages 把站点挂在
 * /star-poster/ 子路径下，只给端口号测不出子路径下的资源引用对不对。
 *   node scripts/e2e.mjs 5177
 *   node scripts/e2e.mjs http://localhost:4181/star-poster
 */
const ARG = process.argv[2] ?? '5177'
const BASE = /^https?:\/\//.test(ARG)
  ? ARG.replace(/\/$/, '')
  : `http://localhost:${ARG}`

/**
 * 首页地址。子路径部署时必须带结尾斜杠。
 *
 * GitHub Pages 会把 /star-poster 自动重定向到 /star-poster/，但 vite preview
 * 不会 —— 少一个斜杠就拿不到 index.html。统一补上，两种环境都能跑。
 */
const HOME = `${BASE}/`
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = 'e2e-out'

mkdirSync(OUT, { recursive: true })

const problems = []
const log = (...a) => console.log(...a)
const fail = (msg) => {
  problems.push(msg)
  console.log(`  ✗ ${msg}`)
}
const pass = (msg) => console.log(`  ✓ ${msg}`)

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 })

// 收集所有控制台报错和未捕获异常 —— 这是最容易漏掉的问题来源
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(`未捕获异常: ${e.message}`))

try {
  // ============================================================ 1. 首页
  log('\n[1] 打开首页')
  await page.goto(HOME, { waitUntil: 'networkidle0' })

  const title = await page.$eval('h1', (el) => el.textContent)
  if (title?.includes('上传')) pass(`首页渲染：${title}`)
  else fail(`首页标题异常：${title}`)

  // ============================================================ 2. 上传三张风格不同的图
  for (const fixture of PNG_FIXTURES) {
    log(`\n[2] 上传测试图：${fixture.name}`)

    await page.goto(HOME, { waitUntil: 'networkidle0' })

    // 填标题，顺便验证中文输入
    await page.evaluate(() => {
      const el = document.querySelector('#t-title')
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      ).set
      setter.call(el, '测试艺人')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const input = await page.$('input[type=file]')
    const path = `${OUT}/${fixture.name}.png`
    writeFileSync(path, Buffer.from(fixture.base64, 'base64'))
    await input.uploadFile(path)

    // 等跳转到编辑器
    try {
      await page.waitForFunction(() => location.hash.startsWith('#/editor/'), {
        timeout: 20000,
      })
      pass('分析完成并跳转到编辑器')
    } catch {
      const err = await page.$eval('body', (b) => b.innerText).catch(() => '')
      fail(`没有跳转到编辑器。页面文字：${err.slice(0, 300)}`)
      continue
    }

    // 等 Konva 画布出现
    await page.waitForSelector('canvas', { timeout: 10000 })
    await new Promise((r) => setTimeout(r, 1200)) // 等图片解码 + 首帧

    // --- 画布真的画了东西吗？
    const canvasInfo = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas')]
      if (canvases.length === 0) return null
      const c = canvases[0]
      const ctx = c.getContext('2d')
      const { data } = ctx.getImageData(0, 0, c.width, c.height)

      // 统计不同颜色数，全空白画布只有 1 种颜色
      const seen = new Set()
      let opaque = 0
      for (let i = 0; i < data.length; i += 4 * 37) {
        if (data[i + 3] > 10) opaque++
        seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
      }
      return { w: c.width, h: c.height, colors: seen.size, opaque, count: canvases.length }
    })

    if (!canvasInfo) {
      fail('页面上没有 canvas')
    } else if (canvasInfo.colors < 8) {
      fail(`画布几乎是空白的（只有 ${canvasInfo.colors} 种颜色）`)
    } else {
      pass(`画布有内容：${canvasInfo.w}×${canvasInfo.h}，${canvasInfo.colors} 种颜色`)
    }

    // --- 配色是否真的从照片提取出来了？
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('button')]
      tabs.find((b) => b.textContent.trim() === '配色')?.click()
    })
    await new Promise((r) => setTimeout(r, 300))

    const paletteInfo = await page.evaluate(() => {
      const codes = [...document.querySelectorAll('code')].map((c) => c.textContent)
      const ratios = [...document.querySelectorAll('span')]
        .map((s) => s.textContent)
        .filter((t) => /^\d+\.\d:1$/.test(t))
      return { roles: codes, ratios }
    })

    if (paletteInfo.roles.length >= 6) {
      pass(`提取出 ${paletteInfo.roles.length} 个角色色：${paletteInfo.roles.slice(0, 3).join(' ')}…`)
    } else {
      fail(`角色色数量不对：${paletteInfo.roles.length}`)
    }

    // --- 配色的调性和色相是否和照片相符？
    // 这是「自动配色好不好用」的实质检验，不只是「有没有出颜色」
    const bgHex = paletteInfo.roles[0]
    if (bgHex && /^#[0-9a-f]{6}$/i.test(bgHex)) {
      const r = parseInt(bgHex.slice(1, 3), 16)
      const g = parseInt(bgHex.slice(3, 5), 16)
      const b = parseInt(bgHex.slice(5, 7), 16)
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

      const toneOK = fixture.expect.bgTone === 'dark' ? lum < 0.4 : lum > 0.6
      if (toneOK) pass(`背景调性正确（${fixture.expect.bgTone}，亮度 ${lum.toFixed(2)}）`)
      else fail(`背景调性不对：期望 ${fixture.expect.bgTone}，实际亮度 ${lum.toFixed(2)}（${bgHex}）`)

      const warmth = r - b
      const hueOK = fixture.expect.bgHue === 'warm' ? warmth > -6 : warmth < 6
      if (hueOK) pass(`背景色相正确（${fixture.expect.bgHue}，R-B=${warmth}）`)
      else fail(`背景色相不对：期望 ${fixture.expect.bgHue}，实际 ${bgHex}（R-B=${warmth}）`)
    }

    // 对比度必须达标，这是自动出稿的底线
    const badRatios = paletteInfo.ratios.filter((r) => parseFloat(r) < 4.5)
    if (paletteInfo.ratios.length === 0) fail('没有显示对比度')
    else if (badRatios.length > 0) fail(`有文字对比度不达标：${badRatios.join(', ')}`)
    else pass(`文字对比度全部达标：${paletteInfo.ratios.join(', ')}`)

    // --- 截图存证
    await page.screenshot({ path: `${OUT}/editor-${fixture.name}.png` })
  }

  // ============================================================ 3. 编辑操作 + 撤销
  log('\n[3] 编辑与撤销')

  // 切到配色页，换一个变体
  const beforeSwap = await readRoleColors(page)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.textContent.trim() === '高对比',
    )
    b?.click()
  })
  await new Promise((r) => setTimeout(r, 400))
  const afterSwap = await readRoleColors(page)

  if (JSON.stringify(beforeSwap) !== JSON.stringify(afterSwap)) {
    pass(`切换配色生效：bg ${beforeSwap[0]} -> ${afterSwap[0]}`)
  } else {
    fail('切换到高对比后配色没有变化')
  }

  // 撤销
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyZ')
  await page.keyboard.up('Control')
  await new Promise((r) => setTimeout(r, 400))

  const afterUndo = await readRoleColors(page)
  if (JSON.stringify(afterUndo) === JSON.stringify(beforeSwap)) {
    pass('撤销把配色恢复回去了')
  } else {
    fail(`撤销没生效：期望 ${beforeSwap[0]}，实际 ${afterUndo[0]}`)
  }

  // 重做
  await page.keyboard.down('Control')
  await page.keyboard.down('Shift')
  await page.keyboard.press('KeyZ')
  await page.keyboard.up('Shift')
  await page.keyboard.up('Control')
  await new Promise((r) => setTimeout(r, 400))

  if (JSON.stringify(await readRoleColors(page)) === JSON.stringify(afterSwap)) {
    pass('重做正常')
  } else {
    fail('重做没生效')
  }

  // ============================================================ 4. 图层操作
  log('\n[4] 图层面板')

  const layerCount = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.panel-title')].find((e) =>
      e.textContent.startsWith('图层'),
    )
    return t ? parseInt(t.textContent.match(/\((\d+)\)/)?.[1] ?? '0', 10) : -1
  })

  if (layerCount > 2) pass(`模板生成了 ${layerCount} 个图层`)
  else fail(`图层数量异常：${layerCount}`)

  // ============================================================ 5. 版型切换
  log('\n[5] 切换版型')

  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '版型')?.click()
  })
  await new Promise((r) => setTimeout(r, 300))

  const templates = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '套用').length,
  )

  if (templates > 0) {
    pass(`有 ${templates} 个可切换的版型`)

    // 套用第一个（要点两次，第二次是确认）
    await page.evaluate(() => {
      ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '套用')?.click()
    })
    await new Promise((r) => setTimeout(r, 200))
    await page.evaluate(() => {
      ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '确认')?.click()
    })
    await new Promise((r) => setTimeout(r, 900))

    const stillHasContent = await page.evaluate(() => {
      const c = document.querySelector('canvas')
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      const seen = new Set()
      for (let i = 0; i < d.length; i += 4 * 37) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
      return seen.size
    })

    if (stillHasContent > 8) pass(`换版型后画布仍有内容（${stillHasContent} 种颜色）`)
    else fail(`换版型后画布空了（${stillHasContent} 种颜色）`)

    await page.screenshot({ path: `${OUT}/after-template-swap.png` })
  } else {
    fail('版型面板里没有可套用的模板')
  }

  // ============================================================ 5.5 直接操作画布
  log('\n[5.5] 画布上直接拖拽 / 缩放 / 插入')

  // --- 插入文字
  const layersBefore = await readLayerCount(page)
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === '+ 文字')
      ?.click()
  })
  await new Promise((r) => setTimeout(r, 500))

  const layersAfterText = await readLayerCount(page)
  if (layersAfterText === layersBefore + 1) pass(`插入文字：图层 ${layersBefore} -> ${layersAfterText}`)
  else fail(`插入文字后图层数没变对：${layersBefore} -> ${layersAfterText}`)

  // --- 插入装饰
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '装饰')?.click()
  })
  await new Promise((r) => setTimeout(r, 400))

  const decorCount = await page.evaluate(() => document.querySelectorAll('svg[viewBox="0 0 100 100"]').length)
  if (decorCount > 5) pass(`装饰面板里有 ${decorCount} 个可选装饰`)
  else fail(`装饰面板里装饰太少：${decorCount}`)

  // 点第一个装饰插入
  await page.evaluate(() => {
    const svg = document.querySelector('svg[viewBox="0 0 100 100"]')
    svg?.closest('button')?.click()
  })
  await new Promise((r) => setTimeout(r, 500))

  const layersAfterDecor = await readLayerCount(page)
  if (layersAfterDecor === layersAfterText + 1) {
    pass(`插入装饰：图层 ${layersAfterText} -> ${layersAfterDecor}`)
  } else {
    fail(`插入装饰后图层数没变对：${layersAfterText} -> ${layersAfterDecor}`)
  }

  // --- 选中刚插入的装饰（它在最上层，也就是图层列表第一个）并拖动
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '属性')?.click()
  })
  await new Promise((r) => setTimeout(r, 300))

  // 通过图层面板选中最上层
  await page.evaluate(() => {
    const rows = document.querySelectorAll('.section > div > div')
    rows[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await new Promise((r) => setTimeout(r, 400))

  const posBefore = await readXY(page)
  if (posBefore) {
    pass(`选中成功，当前位置 X=${posBefore.x} Y=${posBefore.y}`)

    // 用方向键微调 —— 比模拟画布拖拽更可靠，同样走 applyTransform 之外的路径
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight')
      await new Promise((r) => setTimeout(r, 60))
    }
    await new Promise((r) => setTimeout(r, 400))

    const posAfter = await readXY(page)
    if (posAfter && posAfter.x > posBefore.x) {
      pass(`方向键微调生效：X ${posBefore.x} -> ${posAfter.x}`)
    } else {
      fail(`方向键微调没生效：X ${posBefore.x} -> ${posAfter?.x}`)
    }

    // --- 真正的画布拖拽
    const canvasBox = await page.evaluate(() => {
      const c = document.querySelector('canvas')
      const r = c.getBoundingClientRect()
      return { left: r.left, top: r.top, w: r.width, h: r.height }
    })

    const from = { x: canvasBox.left + canvasBox.w * 0.5, y: canvasBox.top + canvasBox.h * 0.5 }

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    // 按下即选中。必须在这里读基准值，而不是沿用上面那个图层的 ——
    // 鼠标落在哪个图层上是由命中检测决定的，未必是先前选中的那个
    // （比如细线方框只有描边可命中，中心是空的，会穿透到下面的照片）
    await new Promise((r) => setTimeout(r, 250))
    const posAtGrab = await readXY(page)

    await page.mouse.move(from.x - 60, from.y + 40, { steps: 10 })
    await page.mouse.up()
    await new Promise((r) => setTimeout(r, 500))

    const posDragged = await readXY(page)

    if (!posAtGrab || !posDragged) {
      fail('拖拽过程中读不到位置属性')
    } else if (posDragged.x === posAtGrab.x && posDragged.y === posAtGrab.y) {
      fail(`画布拖拽没改变位置：仍是 (${posDragged.x}, ${posDragged.y})`)
    } else {
      pass(
        `画布拖拽生效：(${posAtGrab.x}, ${posAtGrab.y}) -> (${posDragged.x}, ${posDragged.y})`,
      )

      // 一次拖拽只应产生一步撤销 —— 拖拽是连续动作，如果每帧都入栈，
      // 用户要按几十次撤销才能退回原位
      await page.keyboard.down('Control')
      await page.keyboard.press('KeyZ')
      await page.keyboard.up('Control')
      await new Promise((r) => setTimeout(r, 400))

      const posUndone = await readXY(page)
      if (
        posUndone &&
        Math.abs(posUndone.x - posAtGrab.x) < 0.2 &&
        Math.abs(posUndone.y - posAtGrab.y) < 0.2
      ) {
        pass('一次撤销就回到拖拽前的位置')
      } else {
        fail(
          `撤销后位置不对：期望 ≈(${posAtGrab.x}, ${posAtGrab.y})，实际 (${posUndone?.x}, ${posUndone?.y})`,
        )
      }
    }
  } else {
    fail('选中图层后读不到位置属性')
  }

  await page.screenshot({ path: `${OUT}/after-edit.png` })

  // ============================================================ 6. 导出
  log('\n[6] 导出 PNG（走真实的 UI 下载路径）')

  const downloadDir = `${process.cwd()}\\${OUT}\\downloads`
  mkdirSync(downloadDir, { recursive: true })

  const cdp = await page.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  })

  // 点「导出」打开菜单
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '导出')?.click()
  })
  await new Promise((r) => setTimeout(r, 400))

  const menuOpen = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '下载'),
  )

  if (!menuOpen) {
    fail('导出菜单没有打开')
  } else {
    pass('导出菜单打开')

    await page.evaluate(() => {
      ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '下载')?.click()
    })

    // 等文件落盘
    let file = null
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const files = readdirSync(downloadDir).filter((f) => f.endsWith('.png'))
      if (files.length > 0) {
        file = `${downloadDir}\\${files[0]}`
        break
      }
    }

    if (!file) {
      fail('等了 30 秒没等到下载的 PNG')
    } else {
      const buf = readFileSync(file)
      // 解析 PNG 的 IHDR 拿真实宽高，不能只信文件存在
      const isPNG = buf.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
      if (!isPNG) {
        fail('下载的文件不是合法 PNG')
      } else {
        const w = buf.readUInt32BE(16)
        const h = buf.readUInt32BE(20)
        pass(`下载成功：${w}×${h}，${(buf.length / 1024).toFixed(0)} KB`)

        // 默认 2x，画布 1080×1350
        if (w === 2160 && h === 2700) pass('导出尺寸正确（2x 于 1080×1350）')
        else fail(`导出尺寸不对：期望 2160×2700，实际 ${w}×${h}`)

        if (buf.length < 20_000) fail(`导出文件太小（${buf.length} 字节），可能是张空白图`)
      }
    }
  }

  // ============================================================ 7. 持久化
  log('\n[7] 刷新后数据还在')

  const urlBefore = page.url()
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('canvas', { timeout: 10000 })
  await new Promise((r) => setTimeout(r, 1200))

  const afterReload = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return { colors: 0 }
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    const seen = new Set()
    for (let i = 0; i < d.length; i += 4 * 37) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
    return { colors: seen.size }
  })

  if (afterReload.colors > 8) pass(`刷新后作品完整重建（${afterReload.colors} 种颜色）`)
  else fail(`刷新后画布是空的（${afterReload.colors} 种颜色）`)

  // ============================================================ 8. 我的库
  log('\n[8] 我的库')

  await page.goto(`${BASE}/#/library`, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 800))

  const libInfo = await page.evaluate(() => ({
    thumbs: document.querySelectorAll('img').length,
    text: document.body.innerText.slice(0, 200),
  }))

  if (libInfo.thumbs > 0) pass(`我的库里有 ${libInfo.thumbs} 个带缩略图的作品`)
  else fail(`我的库里没有作品缩略图。页面：${libInfo.text}`)

  await page.screenshot({ path: `${OUT}/library.png` })

  // ============================================================ 9. 创作工作室：画装饰
  log('\n[9] 创作工作室 · 画装饰')

  await page.goto(`${BASE}/#/studio`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('canvas', { timeout: 10000 })
  await new Promise((r) => setTimeout(r, 500))

  const drawBox = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    return { left: r.left, top: r.top, w: r.width, h: r.height }
  })

  const strokeCount = () =>
    page.evaluate(() => {
      const m = document.body.innerText.match(/(\d+)\s*个笔画/)
      return m ? parseInt(m[1], 10) : -1
    })

  if ((await strokeCount()) !== 0) {
    fail(`画布初始不是空的：${await strokeCount()}`)
  } else {
    pass('画布初始为空')
  }

  // --- 用画笔画一笔
  await page.mouse.move(drawBox.left + drawBox.w * 0.25, drawBox.top + drawBox.h * 0.3)
  await page.mouse.down()
  for (const [fx, fy] of [
    [0.4, 0.2], [0.55, 0.45], [0.7, 0.28], [0.8, 0.6],
  ]) {
    await page.mouse.move(drawBox.left + drawBox.w * fx, drawBox.top + drawBox.h * fy, {
      steps: 6,
    })
  }
  await page.mouse.up()
  await new Promise((r) => setTimeout(r, 400))

  if ((await strokeCount()) === 1) pass('画笔画出了一笔')
  else fail(`画笔没生效，笔画数：${await strokeCount()}`)

  // --- 换椭圆工具再画一个
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '椭圆')?.click()
  })
  await new Promise((r) => setTimeout(r, 200))

  await page.mouse.move(drawBox.left + drawBox.w * 0.5, drawBox.top + drawBox.h * 0.5)
  await page.mouse.down()
  await page.mouse.move(drawBox.left + drawBox.w * 0.72, drawBox.top + drawBox.h * 0.72, {
    steps: 8,
  })
  await page.mouse.up()
  await new Promise((r) => setTimeout(r, 400))

  const afterEllipse = await strokeCount()
  if (afterEllipse === 2) pass('椭圆工具画出了第二个图形')
  else fail(`椭圆工具没生效，笔画数：${afterEllipse}`)

  // --- 撤销
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')]
      .find((b) => b.textContent.includes('撤销'))
      ?.click()
  })
  await new Promise((r) => setTimeout(r, 400))

  if ((await strokeCount()) === 1) pass('工作室撤销生效')
  else fail(`工作室撤销没生效，笔画数：${await strokeCount()}`)

  // 重做回来
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')]
      .find((b) => b.textContent.includes('重做'))
      ?.click()
  })
  await new Promise((r) => setTimeout(r, 400))

  if ((await strokeCount()) === 2) pass('工作室重做生效')
  else fail(`工作室重做没生效，笔画数：${await strokeCount()}`)

  await page.screenshot({ path: `${OUT}/studio-draw.png` })

  // --- 命名并保存
  const DECOR_NAME = '测试手绘装饰'
  await page.evaluate((name) => {
    const input = [...document.querySelectorAll('input.input')].find(
      (i) => i.placeholder && i.placeholder.includes('手绘星星'),
    )
    if (!input) return
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    ).set
    setter.call(input, name)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, DECOR_NAME)
  await new Promise((r) => setTimeout(r, 200))

  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === '保存装饰')
      ?.click()
  })
  await new Promise((r) => setTimeout(r, 1200))

  const savedMsg = await page.evaluate(() => document.body.innerText)
  if (savedMsg.includes('已保存') && savedMsg.includes(DECOR_NAME)) {
    pass(`装饰已保存：${DECOR_NAME}`)
  } else {
    fail(`保存装饰没成功。页面提示：${savedMsg.slice(0, 200)}`)
  }

  // ============================================================ 10. 工作室：设计版型
  log('\n[10] 创作工作室 · 设计版型')

  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '设计版型')?.click()
  })
  await new Promise((r) => setTimeout(r, 700))

  const slotCount = () =>
    page.evaluate(() => {
      const t = [...document.querySelectorAll('.panel-title')].find((e) =>
        e.textContent.startsWith('槽位'),
      )
      return t ? parseInt(t.textContent.match(/\((\d+)\)/)?.[1] ?? '-1', 10) : -1
    })

  const initialSlots = await slotCount()
  if (initialSlots >= 2) pass(`版型设计器预置了 ${initialSlots} 个槽位`)
  else fail(`版型设计器槽位异常：${initialSlots}`)

  // 加一个装饰槽
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '+ 装饰')?.click()
  })
  await new Promise((r) => setTimeout(r, 400))

  if ((await slotCount()) === initialSlots + 1) pass('添加装饰槽成功')
  else fail(`添加装饰槽失败：${initialSlots} -> ${await slotCount()}`)

  // 命名并保存模板
  const TPL_NAME = '测试自建版型'
  await page.evaluate((name) => {
    const input = [...document.querySelectorAll('input.input')].find(
      (i) => i.placeholder && i.placeholder.includes('对角线'),
    )
    if (!input) return
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    ).set
    setter.call(input, name)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, TPL_NAME)
  await new Promise((r) => setTimeout(r, 200))

  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === '保存模板')
      ?.click()
  })
  await new Promise((r) => setTimeout(r, 1200))

  const tplMsg = await page.evaluate(() => document.body.innerText)
  if (tplMsg.includes('已保存') && tplMsg.includes(TPL_NAME)) {
    pass(`模板已保存：${TPL_NAME}`)
  } else {
    fail(`保存模板没成功。页面提示：${tplMsg.slice(0, 200)}`)
  }

  await page.screenshot({ path: `${OUT}/studio-template.png` })

  // ============================================================ 11. 自建内容能在别处用上
  log('\n[11] 自建装饰和模板确实可用')

  // --- 我的库里能看到
  await page.goto(`${BASE}/#/library`, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 700))

  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((b) => b.textContent.includes('我的模板'))?.click()
  })
  await new Promise((r) => setTimeout(r, 500))
  const libTpl = await page.evaluate(() => document.body.innerText)
  if (libTpl.includes(TPL_NAME)) pass('我的库 · 模板页能看到自建模板')
  else fail('我的库 · 模板页看不到自建模板')

  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((b) => b.textContent.includes('我的装饰'))?.click()
  })
  await new Promise((r) => setTimeout(r, 500))
  const libDec = await page.evaluate(() => document.body.innerText)
  if (libDec.includes(DECOR_NAME)) pass('我的库 · 装饰页能看到自建装饰')
  else fail('我的库 · 装饰页看不到自建装饰')

  await page.screenshot({ path: `${OUT}/library-custom.png` })

  // --- 编辑器里能插入自建装饰、能套用自建模板
  // 先切回作品页，否则读不到 /editor/ 链接（当前停在装饰页）
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((b) => b.textContent.includes('我的作品'))?.click()
  })
  await new Promise((r) => setTimeout(r, 500))

  // hash 路由下链接是 /<base>/#/editor/xxx，只取 # 之后的部分自己拼，
  // 免得把 base 前缀拼进去两次
  const docList = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="#/editor/"]')].map(
      (a) => '#' + (a.getAttribute('href') ?? '').split('#')[1],
    ),
  )

  if (docList.length === 0) {
    fail('没有可打开的作品，无法验证自建内容在编辑器里可用')
  } else {
    await page.goto(`${HOME}${docList[0]}`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('canvas', { timeout: 10000 })
    await new Promise((r) => setTimeout(r, 1000))

    // 装饰面板里应该出现「我的装饰」分类
    await page.evaluate(() => {
      ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '装饰')?.click()
    })
    await new Promise((r) => setTimeout(r, 500))

    const hasMyDecorCat = await page.evaluate(() =>
      [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '我的装饰'),
    )
    if (hasMyDecorCat) pass('编辑器装饰面板出现「我的装饰」分类')
    else fail('编辑器装饰面板没有「我的装饰」分类')

    // 切到「我的装饰」并插入
    const layersBeforeCustom = await readLayerCount(page)
    await page.evaluate(() => {
      ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '我的装饰')?.click()
    })
    await new Promise((r) => setTimeout(r, 400))
    await page.evaluate(() => {
      const svg = document.querySelector('svg[viewBox="0 0 100 100"]')
      svg?.closest('button')?.click()
    })
    await new Promise((r) => setTimeout(r, 600))

    const layersAfterCustom = await readLayerCount(page)
    if (layersAfterCustom === layersBeforeCustom + 1) {
      pass(`自建装饰插入成功：图层 ${layersBeforeCustom} -> ${layersAfterCustom}`)
    } else {
      fail(`自建装饰插入失败：${layersBeforeCustom} -> ${layersAfterCustom}`)
    }

    // 检查插进去的装饰是不是「找不到定义」的红框状态
    const decorBroken = await page.evaluate(() => {
      ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '属性')?.click()
      return document.body.innerText.includes('找不到这个装饰的定义')
    })
    if (decorBroken) fail('插入的自建装饰显示为「找不到定义」')
    else pass('自建装饰定义正常解析')

    // 版型面板里应该有自建模板，且标了「自建」
    await page.evaluate(() => {
      ;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '版型')?.click()
    })
    await new Promise((r) => setTimeout(r, 500))

    const tplPanel = await page.evaluate(() => document.body.innerText)
    if (tplPanel.includes(TPL_NAME)) pass('版型面板里出现自建模板')
    else fail('版型面板里没有自建模板')

    if (tplPanel.includes('自建')) pass('自建模板有「自建」标记')
    else fail('自建模板没有「自建」标记')

    // 套用自建模板。用 data 属性精确定位卡片 —— 按文字内容找会点到外层容器
    const clicked = await page.evaluate((name) => {
      const card = document.querySelector(`[data-template-name="${name}"]`)
      if (!card) return 'no-card'
      const btn = [...card.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === '套用',
      )
      if (!btn) return 'no-button'
      btn.click()
      return 'ok'
    }, TPL_NAME)

    if (clicked !== 'ok') {
      fail(`点不到自建模板的「套用」按钮：${clicked}`)
    } else {
      await new Promise((r) => setTimeout(r, 300))
      const confirmed = await page.evaluate((name) => {
        const card = document.querySelector(`[data-template-name="${name}"]`)
        const btn = [...(card?.querySelectorAll('button') ?? [])].find(
          (b) => b.textContent.trim() === '确认',
        )
        if (!btn) return false
        btn.click()
        return true
      }, TPL_NAME)

      if (!confirmed) {
        fail('自建模板的「确认」按钮没出现')
      } else {
        await new Promise((r) => setTimeout(r, 1200))

        // 真正的验证：这张卡片现在应该标为「当前使用中」
        const nowActive = await page.evaluate(
          (name) =>
            document.querySelector(`[data-template-name="${name}"]`)?.dataset
              .templateActive === 'true',
          TPL_NAME,
        )

        if (nowActive) pass('自建模板已成为当前使用的版型')
        else fail('点了确认，但自建模板没有变成当前使用中')

        const afterCustomTpl = await page.evaluate(() => {
          const c = document.querySelector('canvas')
          if (!c) return { colors: 0 }
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
          const seen = new Set()
          for (let i = 0; i < d.length; i += 4 * 37) {
            seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
          }
          return { colors: seen.size }
        })

        if (afterCustomTpl.colors > 8) {
          pass(`套用自建模板后画布正常渲染（${afterCustomTpl.colors} 种颜色）`)
        } else {
          fail(`套用自建模板后画布是空的（${afterCustomTpl.colors} 种颜色）`)
        }

        // 自建模板里有照片槽和标题槽，套用后这两样都得在
        const layerNames = await page.evaluate(() =>
          [...document.querySelectorAll('[title]')]
            .map((e) => e.getAttribute('title'))
            .filter(Boolean),
        )
        if (layerNames.some((n) => n.includes('照片'))) pass('自建模板生成了照片图层')
        else fail(`自建模板没生成照片图层。图层名：${layerNames.slice(0, 10).join(', ')}`)
      }
    }

    await page.screenshot({ path: `${OUT}/custom-template-applied.png` })
  }

  void urlBefore
} catch (err) {
  // 没有这个 catch 的话，任何一步抛异常都会被 finally 里的 process.exit 吞掉，
  // 只剩一段静默的空白输出，根本看不出哪里坏了
  fail(`脚本异常中断：${err?.message ?? err}`)
  console.log(err?.stack ?? '')
  try {
    await page.screenshot({ path: `${OUT}/crash.png` })
    console.log(`  当前页面：${page.url()}`)
  } catch {
    /* 页面可能已经不可用了 */
  }
} finally {
  // ============================================================ 汇总
  log('\n' + '='.repeat(56))

  const realErrors = consoleErrors.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('DevTools') &&
      !e.toLowerCase().includes('download the react devtools'),
  )

  if (realErrors.length > 0) {
    log(`\n浏览器控制台报错 ${realErrors.length} 条：`)
    for (const e of [...new Set(realErrors)].slice(0, 10)) log(`  ! ${e}`)
    problems.push(`控制台有 ${realErrors.length} 条报错`)
  } else {
    log('\n控制台无报错')
  }

  if (problems.length === 0) {
    log('\n全部通过 ✓')
  } else {
    log(`\n${problems.length} 个问题：`)
    problems.forEach((p) => log(`  - ${p}`))
  }
  log(`\n截图在 ${OUT}/`)

  await browser.close()
  process.exit(problems.length === 0 ? 0 : 1)
}

async function readRoleColors(page) {
  return page.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === '配色',
    )
    tab?.click()
    return [...document.querySelectorAll('code')].map((c) => c.textContent)
  })
}

/** 读图层面板标题里的图层数。 */
async function readLayerCount(page) {
  return page.evaluate(() => {
    const t = [...document.querySelectorAll('.panel-title')].find((e) =>
      e.textContent.startsWith('图层'),
    )
    return t ? parseInt(t.textContent.match(/\((\d+)\)/)?.[1] ?? '-1', 10) : -1
  })
}

/** 读属性面板里的 X / Y 数字输入框。 */
async function readXY(page) {
  return page.evaluate(() => {
    const labels = [...document.querySelectorAll('.field-label')]
    const find = (name) => {
      const l = labels.find((e) => e.textContent.trim() === name)
      const input = l?.parentElement?.querySelector('input[type=number]')
      return input ? parseFloat(input.value) : null
    }
    const x = find('X')
    const y = find('Y')
    return x === null || y === null ? null : { x, y }
  })
}
