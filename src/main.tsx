import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './routes'
import { requestPersistentStorage } from './core/store/persistence'
import './styles.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('找不到 #root 挂载点')

// 尽早申请持久化存储，免得浏览器在磁盘紧张时把用户的作品清掉。
// 申请结果不影响启动，所以不 await
void requestPersistentStorage()

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
