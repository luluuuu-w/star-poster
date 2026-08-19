import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/** GitHub Pages 的仓库名。网址会是 https://<用户名>.github.io/<这个名字>/ */
const REPO_NAME = 'star-poster'

export default defineConfig(({ command, isPreview }) => ({
  /**
   * GitHub Pages 把站点挂在 /<仓库名>/ 子路径下，构建产物里的资源引用必须
   * 带上这个前缀，否则线上全是 404。
   *
   * 构建和 preview 都要加，本地 dev 不加：
   * - dev 保持 http://localhost:5173/，不用记带子路径的地址
   * - preview 必须加，否则它按根路径伺服 dist，子路径请求会命中 SPA 回退
   *   拿到一份 HTML（Content-Type: text/html），浏览器当模块加载时直接失败，
   *   页面白屏 —— 那就完全测不出线上的真实形态了
   *
   * IndexedDB 按 origin 隔离、不看路径，所以本地数据不受 base 变化影响。
   */
  base: command === 'build' || isPreview ? `/${REPO_NAME}/` : '/',

  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    /**
     * 端口被占用时直接报错，不要自动换成 5174。
     *
     * 浏览器按 origin 隔离存储，localhost:5173 和 localhost:5174 是两个
     * 独立的 IndexedDB。悄悄换端口的话，用户打开会看到一个空的「我的库」，
     * 以为作品全丢了。宁可启动失败让人看见原因。
     */
    strictPort: true,
    watch: {
      // e2e 会把下载的图落在 e2e-out/ 里。Windows 上 chokidar 去 watch 一个
      // 正在写入的 .crdownload 会抛 EBUSY 并直接干掉 dev server
      ignored: ['**/e2e-out/**', '**/dist/**'],
    },
  },
}))
