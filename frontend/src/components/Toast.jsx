import React, { useEffect } from "react";
import { CheckCircle, AlertCircle, X } from "lucide-react";

const Toast = ({ message, type = "success", onClose }) => {
  useEffect(() => {
    // Auto-close after 3 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    success: "bg-green-100 border-green-500 text-green-700",
    error: "bg-red-100 border-red-500 text-red-700",
  };

  const Icons = {
    success: <CheckCircle size={20} />,
    error: <AlertCircle size={20} />,
  };

  return (
    <div
      className={`fixed top-5 right-5 z-9999 flex items-center gap-3 px-4 py-3 rounded-lg border-l-4 shadow-lg transition-all transform translate-y-0 ${bgColors[type]}`}
    >
      {Icons[type]}
      <p className="font-medium">{message}</p>
      <button onClick={onClose} className="ml-2 hover:opacity-70">
        <X size={16} />
      </button>
    </div>
  );
};

export default Toast;
