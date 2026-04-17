import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Store, LogOut, ArrowLeft, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const SellingLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    {
      to: "/selling/stocks",
      icon: <Store size={20} />,
      label: "Stocks",
      match: (path) => path.includes("/selling/stocks") || path === "/selling",
    },
    {
      to: "/selling/svg",
      icon: <ShieldCheck size={20} />,
      label: "SVG Vault",
      match: (path) => path.includes("/selling/svg"),
    },
    {
      to: "/selling/customers",
      icon: <Users size={20} />,
      label: "Customers",
      match: (path) => path.includes("/selling/customers"),
    },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-gray-200 shadow-sm flex-none z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* Left side: Back to Modes & Logo */}
            <div className="flex items-center gap-5">
              <Link
                to="/"
                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all border border-slate-200 hover:border-indigo-200 active:scale-95"
              >
                <ArrowLeft size={16} /> Modes
              </Link>
              <div className="flex items-center gap-2.5 border-l border-slate-200 pl-5">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
                  <Store className="text-white" size={16} />
                </div>
                <h1 className="text-xl font-black text-slate-800 tracking-tight">
                  JEWEL<span className="text-indigo-500">POS</span>
                </h1>
              </div>
            </div>

            {/* Right side: User & Logout */}
            <div className="flex items-center gap-5">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-800">{user?.username || "Employee"}</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{user?.role || "Sales"}</p>
              </div>
              <button
                onClick={logout}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors active:scale-95"
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
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10 hidden md:flex">
          <nav className="flex-1 py-6 px-3 space-y-1.5">
            {navItems.map((item) => {
              const isActive = item.match(location.pathname);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100"
                      : "text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
                  }`}
                >
                  <span className={isActive ? "text-indigo-600" : "text-slate-400"}>{item.icon}</span>
                  {item.label}
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar footer – quick help */}
          <div className="p-3 border-t border-slate-100">
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Flow</p>
              <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                Finished Goods → Counter ↔ Vault
              </p>
            </div>
          </div>
        </aside>

        {/* Mobile bottom nav */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex md:hidden z-20 shadow-lg">
          {navItems.map((item) => {
            const isActive = item.match(location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                  isActive ? "text-indigo-600" : "text-slate-400"
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-black uppercase tracking-wider">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto bg-slate-50 flex justify-center py-6 pb-20 md:pb-6">
          <div className="w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default SellingLayout;
