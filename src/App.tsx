import { NavLink, Outlet, useLocation } from 'react-router'

const NAV = [
  { to: '/', label: '新建海报', end: true },
  { to: '/studio', label: '创作工作室', end: false },
  { to: '/library', label: '我的库', end: false },
]

export function App() {
  const location = useLocation()
  // 编辑器要占满全屏，不显示顶栏
  const isEditor = location.pathname.startsWith('/editor/')

  if (isEditor) return <Outlet />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '0 20px',
          height: 52,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 600, letterSpacing: '0.02em' }}>
          明星海报生成器
        </div>
        <nav style={{ display: 'flex', gap: 4 }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                fontSize: 14,
                color: isActive ? 'var(--text)' : 'var(--text-dim)',
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="scroll" style={{ flex: 1, minHeight: 0 }}>
        <Outlet />
      </main>
    </div>
  )
}
