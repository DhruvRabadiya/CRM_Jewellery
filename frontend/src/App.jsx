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
import SellingLedger from "./pages/SellingLedger";
import SellingAdmin from "./pages/SellingAdmin";
import OrderBills from "./pages/OrderBills";
import SellingDashboard from "./pages/SellingDashboard";
import RojMed from "./pages/RojMed";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SellingSyncProvider } from "./context/SellingSyncContext";

const ProtectedRoute = ({ children, requireAdmin }) => {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;

  return children;
};

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <SellingSyncProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><ModeSelection /></ProtectedRoute>} />

            <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/stock" element={<StockManagement />} />
              <Route path="/melting" element={<MeltingProcess />} />
              <Route path="/production" element={<ProductionJobs />} />
              <Route path="/finished" element={<FinishedGoods />} />
              <Route path="/job-history/:jobNumber" element={<JobHistory />} />
              <Route path="/employees" element={<ProtectedRoute requireAdmin={true}><EmployeeManagement /></ProtectedRoute>} />
            </Route>

            <Route path="/selling" element={<ProtectedRoute><SellingLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<SellingDashboard />} />
              <Route path="stocks" element={<SellingCounter />} />
              <Route path="svg" element={<SvgCounter />} />
              <Route path="customers" element={<Customers />} />
              <Route path="ledger" element={<SellingLedger />} />
              <Route path="estimate" element={<OrderBills />} />
              <Route path="order-bills" element={<Navigate to="/selling/estimate" replace />} />
              <Route path="billing" element={<Navigate to="/selling/estimate" replace />} />
              <Route path="roj-med" element={<RojMed />} />
              <Route path="admin" element={<ProtectedRoute requireAdmin={true}><SellingAdmin /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SellingSyncProvider>
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
