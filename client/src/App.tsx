import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MyReportsPage } from './pages/MyReportsPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { QueuePage } from './pages/QueuePage';
import { FindPage } from './pages/FindPage';
import { AlertsPage } from './pages/AlertsPage';

function Private({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function ApproverOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'approver') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <Private>
                <Layout />
              </Private>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="reports" element={<MyReportsPage />} />
            <Route path="reports/:id" element={<ReportDetailPage />} />
            <Route
              path="queue"
              element={
                <ApproverOnly>
                  <QueuePage />
                </ApproverOnly>
              }
            />
            <Route
              path="find"
              element={
                <ApproverOnly>
                  <FindPage />
                </ApproverOnly>
              }
            />
            <Route
              path="alerts"
              element={
                <ApproverOnly>
                  <AlertsPage />
                </ApproverOnly>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
