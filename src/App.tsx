import { Route, Routes } from 'react-router-dom'
import LoginPage from './features/auth/pages/LoginPage'
import TrackingPage from './features/tracking/pages/TrackingPage'
import StaffPage from './features/dashboard/pages/StaffPage'
import AdminPage from './features/dashboard/pages/AdminPage'
import NotFoundPage from './app/NotFoundPage'
import ProtectedRoute from './features/auth/components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/track/:token" element={<TrackingPage />} />
      <Route
        path="/staff"
        element={
          <ProtectedRoute>
            <StaffPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}