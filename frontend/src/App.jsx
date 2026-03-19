import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard";
import StockManagement from "./pages/StockManagement";
import MeltingProcess from "./pages/MeltingProcess";
import ProductionJobs from "./pages/ProductionJobs";
import FinishedGoods from "./pages/FinishedGoods";
import JobHistory from "./pages/JobHistory";
import Login from "./pages/Login";
import EmployeeManagement from "./pages/EmployeeManagement";
import { AuthProvider, useAuth } from "./context/AuthContext";

// Guard wrapper to ensure user is logged in
const ProtectedRoute = ({ children, requireAdmin }) => {
  const { user, loading, isAdmin } = useAuth();
  
  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />; // Lock out employees from admin pages

  return children;
};

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Routes inside MainLayout */}
          <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            
            {/* Standard Employee/Admin Routes */}
            <Route index element={<Dashboard />} />
            <Route path="stock" element={<StockManagement />} />
            <Route path="melting" element={<MeltingProcess />} />
            <Route path="production" element={<ProductionJobs />} />
            <Route path="finished" element={<FinishedGoods />} />
            <Route path="job-history/:jobNumber" element={<JobHistory />} />

            {/* Admin-Only Routes */}
            <Route path="employees" element={<ProtectedRoute requireAdmin={true}><EmployeeManagement /></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
