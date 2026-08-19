import { lazy, Suspense } from 'react'
import { createHashRouter } from 'react-router'
import { App } from './App'
import { Home } from './routes/Home'

/**
 * 编辑器、工作室、我的库都按需加载。
 *
 * 这三个页面加起来把 Konva 拖进了首包，而首页只是个上传框，完全用不到画布。
 * 拆开后首屏体积明显下降 —— 用户传图的那几秒正好用来加载编辑器。
 */
const Editor = lazy(() => import('./routes/Editor').then((m) => ({ default: m.Editor })))
const Studio = lazy(() => import('./routes/Studio').then((m) => ({ default: m.Studio })))
const Library = lazy(() => import('./routes/Library').then((m) => ({ default: m.Library })))

function Loading() {
  return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>
      正在加载…
    </div>
  )
}

/** 包一层 Suspense，避免每个路由各写一遍。 */
function lazyRoute(element: React.ReactNode) {
  return <Suspense fallback={<Loading />}>{element}</Suspense>
}

/**
 * 用 hash 路由（地址形如 /#/editor/xxx）。
 *
 * GitHub Pages 是纯静态托管，没有重写规则：直接访问或刷新 /editor/xxx
 * 时服务器上并没有这个文件，只会返回 404。hash 后面的部分不会发给服务器，
 * 所以服务器永远只看到首页，刷新和分享链接都不会出问题。
 *
 * 代价是网址里多一个 #。换到支持重写的托管（Cloudflare Pages、Netlify、
 * Vercel）时，把这里换回 createBrowserRouter 即可，_redirects 和
 * vercel.json 都已经配好了。
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'editor/:docId', element: lazyRoute(<Editor />) },
      { path: 'studio', element: lazyRoute(<Studio />) },
      { path: 'library', element: lazyRoute(<Library />) },
    ],
  },
])
