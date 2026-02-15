import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { useScrollRestoration } from './hooks/useScrollRestoration';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/ToastContainer';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import JobLeads from './pages/JobLeads';
import Applications from './pages/Applications';
import ApplicationDetail from './pages/ApplicationDetail';
import JobLeadDetail from './pages/JobLeadDetail';
import Analytics from './pages/Analytics';
import Admin from './pages/Admin';
import SettingsLayout from './components/settings/SettingsLayout';
import SettingsTheme from './components/settings/SettingsTheme';
import SettingsFeatures from './components/settings/SettingsFeatures';
import SettingsStatuses from './components/settings/SettingsStatuses';
import SettingsRoundTypes from './components/settings/SettingsRoundTypes';
import SettingsExport from './components/settings/SettingsExport';
import SettingsImport from './components/settings/SettingsImport';
import SettingsAPIKey from './components/settings/SettingsAPIKey';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">
        Loading...
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  useScrollRestoration();

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/job-leads" element={<ProtectedRoute><JobLeads /></ProtectedRoute>} />
      <Route path="/job-leads/:id" element={<ProtectedRoute><JobLeadDetail /></ProtectedRoute>} />
      <Route path="/applications" element={<ProtectedRoute><Applications /></ProtectedRoute>} />
      <Route path="/applications/:id" element={<ProtectedRoute><ApplicationDetail /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsLayout /></ProtectedRoute>}>
        <Route path="theme" element={<SettingsTheme />} />
        <Route path="features" element={<SettingsFeatures />} />
        <Route path="api-key" element={<SettingsAPIKey />} />
        <Route path="statuses" element={<SettingsStatuses />} />
        <Route path="round-types" element={<SettingsRoundTypes />} />
        <Route path="export" element={<SettingsExport />} />
        <Route path="import" element={<SettingsImport />} />
      </Route>
      <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <AppRoutes />
              <ToastContainer />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
