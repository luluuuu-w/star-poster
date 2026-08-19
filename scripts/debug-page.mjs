/** 一次性调试脚本：打印失败请求、控制台消息和渲染后的 DOM 概要。 */
import puppeteer from 'puppeteer-core'

const URL_ = process.argv[2]
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox'],
})
const page = await browser.newPage()

page.on('requestfailed', (r) =>
  console.log(`  [请求失败] ${r.url()}  ${r.failure()?.errorText ?? ''}`),
)
page.on('response', (r) => {
  if (r.status() >= 400) console.log(`  [HTTP ${r.status()}] ${r.url()}`)
})
page.on('console', (m) => console.log(`  [console.${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => console.log(`  [未捕获异常] ${e.message}\n${e.stack ?? ''}`))

console.log(`打开 ${URL_}`)
await page.goto(URL_, { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 2500))

const info = await page.evaluate(() => ({
  url: location.href,
  hash: location.hash,
  rootChildren: document.getElementById('root')?.children.length ?? -1,
  h1: [...document.querySelectorAll('h1')].map((e) => e.textContent),
  bodyText: document.body.innerText.slice(0, 400),
}))

console.log('\n渲染结果：')
console.log(JSON.stringify(info, null, 2))

await browser.close()
