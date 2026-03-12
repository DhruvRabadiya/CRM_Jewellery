import React from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Coins,
  Flame,
  Hammer,
  Package,
  LogOut,
  Users,
  Menu,
  ChevronLeft
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const MainLayout = () => {
  const location = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);

  // Menu Items Configuration (Conditionally rendered)
  const menuItems = [
    { path: "/", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    ...(isAdmin ? [{ path: "/stock", label: "Stock Management", icon: <Coins size={20} /> }] : []),
    { path: "/melting", label: "Melting Process", icon: <Flame size={20} /> },
    {
      path: "/production",
      label: "Production Jobs",
      icon: <Hammer size={20} />,
    },
    { path: "/finished", label: "Finished Goods", icon: <Package size={20} /> },
    ...(isAdmin ? [{ path: "/employees", label: "Employee Management", icon: <Users size={20} /> }] : []),
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className={`bg-white border-r border-gray-200 flex flex-col shadow-lg z-10 transition-all duration-300 ${isSidebarOpen ? "w-64" : "w-16"}`}>
        {/* Logo Area */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 py-2">
          {isSidebarOpen && (
            <h1 className="text-2xl font-bold text-blue-900 tracking-wider">
              JEWEL<span className="text-blue-500">CRM</span>
            </h1>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 rounded-md text-gray-500 hover:bg-gray-100 transition-colors mx-auto flex-shrink-0"
          >
            {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
          </button>
        </div>
        
        {isSidebarOpen && user && (
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex flex-col justify-center">
            <span className="text-xs text-gray-500 font-semibold bg-gray-100 px-2 py-1 inline-block rounded border border-gray-200/60 w-max">
              <span className="text-blue-600">{user.username}</span>
              <span className="text-[10px] uppercase text-gray-400 ml-2">({user.role})</span>
            </span>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 py-6 px-3 space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={!isSidebarOpen ? item.label : ""}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group
                                    ${
                                      isActive
                                        ? "bg-blue-50 text-blue-600 shadow-sm border-r-4 border-blue-600"
                                        : "text-gray-600 hover:bg-gray-50 hover:text-blue-500"
                                    } ${!isSidebarOpen ? "justify-center px-0" : ""}`}
              >
                <span
                  className={`${isActive ? "text-blue-600" : "text-gray-400 group-hover:text-blue-500"}`}
                >
                  {item.icon}
                </span>
                {isSidebarOpen && <span className="font-medium whitespace-nowrap">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer / Logout */}
        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={logout}
            title={!isSidebarOpen ? "Logout" : ""}
            className={`flex items-center gap-3 w-full py-3 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors ${isSidebarOpen ? "px-4" : "justify-center"}`}
          >
            <LogOut size={20} />
            {isSidebarOpen && <span className="font-medium">Logout</span>}
          </button>
          {isSidebarOpen && (
            <div className="mt-4 text-center">
              <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">v1.0.0 Production Build</p>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
