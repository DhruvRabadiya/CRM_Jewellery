import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Coins,
  Flame,
  Hammer,
  Package,
  LogOut,
} from "lucide-react";

const MainLayout = ({ children }) => {
  const location = useLocation();

  // Menu Items Configuration
  const menuItems = [
    { path: "/", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { path: "/stock", label: "Stock Management", icon: <Coins size={20} /> },
    { path: "/melting", label: "Melting Process", icon: <Flame size={20} /> },
    {
      path: "/production",
      label: "Production Jobs",
      icon: <Hammer size={20} />,
    },
    { path: "/finished", label: "Finished Goods", icon: <Package size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-lg z-10">
        {/* Logo Area */}
        <div className="h-16 flex items-center justify-center border-b border-gray-100">
          <h1 className="text-2xl font-bold text-blue-900 tracking-wider">
            JEWEL<span className="text-blue-500">CRM</span>
          </h1>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-6 px-3 space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group
                                    ${
                                      isActive
                                        ? "bg-blue-50 text-blue-600 shadow-sm border-r-4 border-blue-600"
                                        : "text-gray-600 hover:bg-gray-50 hover:text-blue-500"
                                    }`}
              >
                <span
                  className={`${isActive ? "text-blue-600" : "text-gray-400 group-hover:text-blue-500"}`}
                >
                  {item.icon}
                </span>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer / Logout */}
        <div className="p-4 border-t border-gray-100">
          <button className="flex items-center gap-3 w-full px-4 py-3 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-400">v1.0.0 Production Build</p>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
        {children}
      </main>
    </div>
  );
};

export default MainLayout;
