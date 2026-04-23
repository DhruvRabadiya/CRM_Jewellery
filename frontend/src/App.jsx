import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard";
import StockManagement from "./pages/StockManagement";
import ProductionJobs from "./pages/ProductionJobs";
import FinishedGoods from "./pages/FinishedGoods";
import JobHistory from "./pages/JobHistory";
import MeltingProcess from "./pages/MeltingProcess";
import Login from "./pages/Login";
import EmployeeManagement from "./pages/EmployeeManagement";
import ModeSelection from "./pages/ModeSelection";
import SellingLayout from "./layouts/SellingLayout";
import SellingCounter from "./pages/SellingCounter";
import SvgCounter from "./pages/SvgCounter";
import Customers from "./pages/Customers";
import SellingAdmin from "./pages/SellingAdmin";
import OrderBills from "./pages/OrderBills";
import SellingBilling from "./pages/SellingBilling";
import SellingDashboard from "./pages/SellingDashboard";
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

          {/* Mode Selection */}
          <Route path="/" element={<ProtectedRoute><ModeSelection /></ProtectedRoute>} />

          {/* Protected Routes inside MainLayout (Production Mode) */}
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>

            {/* Standard Employee/Admin Routes */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/stock" element={<StockManagement />} />
            <Route path="/melting" element={<MeltingProcess />} />
            <Route path="/production" element={<ProductionJobs />} />
            <Route path="/finished" element={<FinishedGoods />} />
            <Route path="/job-history/:jobNumber" element={<JobHistory />} />

            {/* Admin-Only Routes */}
            <Route path="/employees" element={<ProtectedRoute requireAdmin={true}><EmployeeManagement /></ProtectedRoute>} />
          </Route>

          {/* Protected Routes inside SellingLayout (Selling Mode) */}
          <Route path="/selling" element={<ProtectedRoute><SellingLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<SellingDashboard />} />
            <Route path="stocks" element={<SellingCounter />} />
            <Route path="svg" element={<SvgCounter />} />
            <Route path="customers" element={<Customers />} />
            <Route path="order-bills" element={<OrderBills />} />
            <Route path="billing" element={<SellingBilling />} />
            <Route path="admin" element={<ProtectedRoute requireAdmin={true}><SellingAdmin /></ProtectedRoute>} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
