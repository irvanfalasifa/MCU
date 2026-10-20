import { Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './features/home/HomePage'
import LoginPage from './features/auth/pages/LoginPage'
import TrackingPage from './features/tracking/pages/TrackingPage'
import StaffPage from './features/dashboard/pages/StaffPage'
import AdminPage from './features/dashboard/pages/AdminPage'
import NotFoundPage from './app/NotFoundPage'
import ProtectedRoute from './features/auth/components/ProtectedRoute'
import SummaryPage from './features/dashboard/pages/SummaryPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/track/:token" element={<TrackingPage />} />
      <Route
        path="/staff"
        element={
          <ProtectedRoute allowedRoles={['admin', 'coordinator', 'staff']}>
            <StaffPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin', 'coordinator']}>
            <AdminPage />
          </ProtectedRoute>
        }
      />
        <Route
        path="/admin/summary"
        element={
          <ProtectedRoute allowedRoles={['admin', 'coordinator']}>
            <SummaryPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}