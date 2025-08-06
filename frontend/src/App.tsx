import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

// Providers
import { AuthProvider } from '@/contexts/AuthContext'
import { WebSocketProvider } from '@/contexts/WebSocketContext'

// Components
import ProtectedRoute from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'

// Pages
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import LeadsPage from '@/pages/LeadsPage'
import ConversationsPage from '@/pages/ConversationsPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import SettingsPage from '@/pages/SettingsPage'

function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <Router>
          <div className="min-h-screen bg-neutral-50">
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              
              {/* Protected routes */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<Navigate to="/leads" replace />} />
                        <Route path="/leads" element={<LeadsPage />} />
                        <Route path="/dashboard" element={<DashboardPage />} />
                        <Route path="/conversations" element={<ConversationsPage />} />
                        <Route path="/analytics" element={<AnalyticsPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                      </Routes>
                    </Layout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
          
          {/* Global toast notifications */}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              className: '',
              style: {
                background: '#ffffff',
                color: '#262626',
                border: '1px solid #e5e5e5',
                borderRadius: '0.75rem',
                padding: '16px',
                boxShadow: '0 10px 40px -15px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              },
              success: {
                iconTheme: {
                  primary: '#22c55e',
                  secondary: '#ffffff',
                },
                style: {
                  border: '1px solid #dcfce7',
                  background: '#f0fdf4',
                },
              },
              error: {
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#ffffff',
                },
                style: {
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                },
              },
              loading: {
                iconTheme: {
                  primary: '#3b82f6',
                  secondary: '#ffffff',
                },
              },
            }}
          />
        </Router>
      </WebSocketProvider>
    </AuthProvider>
  )
}

export default App