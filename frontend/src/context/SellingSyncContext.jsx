/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo, useState } from "react";

const SellingSyncContext = createContext(null);

export const SellingSyncProvider = ({ children }) => {
  const [versions, setVersions] = useState({
    inventory: 0,
    ledger: 0,
    estimates: 0,
    customers: 0,
    dashboard: 0,
  });

  const markDirty = (scopes = []) => {
    const uniqueScopes = Array.from(new Set(scopes));
    if (!uniqueScopes.length) return;

    setVersions((current) => {
      const next = { ...current };
      uniqueScopes.forEach((scope) => {
        if (Object.prototype.hasOwnProperty.call(next, scope)) {
          next[scope] += 1;
        }
      });
      return next;
    });
  };

  const value = useMemo(() => ({ versions, markDirty }), [versions]);

  return <SellingSyncContext.Provider value={value}>{children}</SellingSyncContext.Provider>;
};

export const useSellingSync = () => {
  const context = useContext(SellingSyncContext);
  if (!context) {
    throw new Error("useSellingSync must be used within SellingSyncProvider");
  }
  return context;
};
