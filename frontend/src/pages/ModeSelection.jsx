import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Factory, Store, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const ModeSelection = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background visual flair */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-br from-blue-600 to-indigo-900 rounded-b-[100px] opacity-10 blur-3xl pointer-events-none"></div>
      
      <div className="absolute top-6 right-6 flex items-center gap-4 z-10">
        <div className="text-right">
          <p className="text-sm font-bold text-slate-800">{user?.username}</p>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{user?.role}</p>
        </div>
        <button
          onClick={handleLogout}
          className="p-2.5 bg-white text-slate-600 rounded-full hover:bg-red-50 hover:text-red-600 shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-red-500/10"
          title="Logout"
        >
          <LogOut size={20} />
        </button>
      </div>

      <div className="text-center mb-16 z-10">
        <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-4">
          Welcome to <span className="text-blue-600">JewelCRM</span>
        </h1>
        <p className="text-lg text-slate-500 font-medium max-w-lg mx-auto">
          Please select your workspace environment to continue.
        </p>
      </div>

      <div className="group grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl z-10">
        
        {/* Production Mode Card */}
        <Link 
          to="/dashboard"
          className="group/card bg-white rounded-[2rem] p-10 shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-200 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-2 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
          
          <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-3xl flex items-center justify-center mb-8 shadow-inner group-hover/card:scale-110 group-hover/card:rotate-3 transition-transform duration-500">
            <Factory size={48} strokeWidth={1.5} />
          </div>
          
          <h2 className="text-3xl font-extrabold text-slate-800 mb-4 group-hover/card:text-blue-600 transition-colors">
            Production Area
          </h2>
          <p className="text-slate-500 font-medium leading-relaxed px-4">
            Manage stock inventory, track melting processes, handle production job sheets, and inspect finished goods.
          </p>
          
          <div className="mt-8 px-8 py-3 bg-slate-50 text-slate-600 font-bold rounded-full group-hover/card:bg-blue-600 group-hover/card:text-white transition-colors duration-300">
            Enter Factory
          </div>
        </Link>

        {/* Selling / Estimate Card */}
        <Link 
          to="/selling"
          className="group/card bg-white rounded-[2rem] p-10 shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-indigo-400 hover:shadow-2xl hover:shadow-indigo-200 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-2 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
          
          <div className="w-24 h-24 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mb-8 shadow-inner group-hover/card:scale-110 group-hover/card:-rotate-3 transition-transform duration-500">
            <Store size={48} strokeWidth={1.5} />
          </div>
          
          <h2 className="text-3xl font-extrabold text-slate-800 mb-4 group-hover/card:text-indigo-600 transition-colors">
            Selling Counter
          </h2>
          <p className="text-slate-500 font-medium leading-relaxed px-4">
            Manage estimates, counter inventory, customer records, and selling-side workflow.
          </p>
          
          <div className="mt-8 px-8 py-3 bg-slate-50 text-slate-600 font-bold rounded-full group-hover/card:bg-indigo-600 group-hover/card:text-white transition-colors duration-300">
            Enter Store
          </div>
        </Link>
        
      </div>
      
      <div className="absolute bottom-8 text-center text-sm font-bold text-slate-400 uppercase tracking-widest z-10">
        JewelCRM V1.0.0
      </div>
    </div>
  );
};

export default ModeSelection;
