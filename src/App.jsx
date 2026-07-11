import { Routes, Route } from 'react-router-dom'
import Kiosk from './pages/Kiosk.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Kiosk />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  )
}
