import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard";
import StockManagement from "./pages/StockManagement";
import MeltingProcess from "./pages/MeltingProcess";
import ProductionJobs from "./pages/ProductionJobs";
import FinishedGoods from "./pages/FinishedGoods";

// Placeholder pages for now (We will build these next)
const Placeholder = ({ title }) => (
  <div className="p-10 text-center text-gray-500">
    <h2 className="text-2xl font-bold mb-2">{title}</h2>
    <p>Module coming soon...</p>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          {/* Dashboard is the default home page */}
          <Route path="/" element={<Dashboard />} />

          {/* Routes for the pages we will build later */}
          <Route path="/stock" element={<StockManagement />} />
          <Route path="/melting" element={<MeltingProcess />} />
          <Route path="/production" element={<ProductionJobs />} />
          <Route path="/finished" element={<FinishedGoods />} />

          {/* Fallback for unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}

export default App;
