import React from "react";
import { Link, Outlet } from "react-router-dom";
import { Store, LogOut, ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const SellingLayout = () => {
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Top Navigation Bar for Selling Counter */}
      <header className="bg-white border-b border-gray-200 shadow-sm flex-none z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            
            {/* Left side: Back to Modes & Logo */}
            <div className="flex items-center gap-6">
              <Link 
                to="/" 
                className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-gray-200 hover:border-indigo-200"
              >
                <ArrowLeft size={16} /> Modes
              </Link>
              <div className="flex items-center gap-2 border-l border-gray-200 pl-6">
                <Store className="text-indigo-600" size={24} />
                <h1 className="text-xl font-black text-slate-800 tracking-tight">
                  JEWEL<span className="text-indigo-500">POS</span>
                </h1>
              </div>
            </div>

            {/* Right side: User & Logout */}
            <div className="flex items-center gap-6">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-800">{user?.username || "Employee"}</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{user?.role || "Sales"}</p>
              </div>
              <button 
                onClick={logout}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-10 hidden md:flex">
          <nav className="flex-1 py-6 px-3 space-y-2">
            <Link
              to="/selling/stocks"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold ${
                window.location.hash.includes("/selling/stocks") || window.location.hash === "#/selling"
                  ? "bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100"
                  : "text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
              }`}
            >
              <Store size={20} /> Stocks
            </Link>
            <Link
              to="/selling/svg"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold ${
                window.location.hash.includes("/selling/svg")
                  ? "bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100"
                  : "text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
              }`}
            >
              <div className="w-5 h-5 rounded border-2 border-current flex items-center justify-center font-black text-[10px]">
                SVG
              </div>
              SVG Vault
            </Link>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto bg-slate-50 flex justify-center py-6">
          <div className="w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default SellingLayout;
