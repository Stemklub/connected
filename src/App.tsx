import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './state'
import { Header } from './components/bits'
import { Icon } from './components/Icon'
import { Entry } from './screens/Entry'
import { Teams } from './screens/Teams'
import { Profile } from './screens/Profile'
import { Platno } from './screens/Platno'
import { Admin } from './screens/Admin'

function BottomNav() {
  return (
    <nav className="nav" aria-label="Glavni meni">
      <NavLink to="/" end data-testid="nav-foryou"><Icon name="spark" /> Za tebe</NavLink>
      <NavLink to="/timovi" data-testid="nav-teams"><Icon name="users" /> Moji timovi</NavLink>
      <NavLink to="/profil" data-testid="nav-profile"><Icon name="user" /> Profil</NavLink>
    </nav>
  )
}

function Shell() {
  const { me } = useApp()
  const loc = useLocation()
  if (loc.pathname === '/platno') return <Platno />
  if (loc.pathname === '/admin')
    return (
      <div className="app">
        <Header />
        <Admin />
      </div>
    )
  const ready = !!me && me.role === 'student' && !!me.nick && me.tags.length > 0
  return (
    <div className="app">
      {me && <Header />}
      <Routes>
        <Route path="/" element={<Entry />} />
        {ready && <Route path="/timovi" element={<Teams />} />}
        {ready && <Route path="/profil" element={<Profile />} />}
        <Route path="*" element={<Navigate to={{ pathname: '/', search: loc.search }} replace />} />
      </Routes>
      {ready && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
