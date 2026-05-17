import React, { createContext, useState, useEffect, useContext } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import { ALL_PERMISSION_KEYS } from '../utils/permissions';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user,    setUser]    = useState(null);
    const [token,   setToken]   = useState(localStorage.getItem('token') || null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (token) {
            try {
                const decoded = jwtDecode(token);
                if (decoded.exp * 1000 < Date.now()) {
                    logout();
                } else {
                    // Permissions are embedded in the JWT.
                    // ADMIN always gets the full set (defensive: in case an old token lacks them).
                    const permissions =
                        decoded.role === 'ADMIN'
                            ? ALL_PERMISSION_KEYS
                            : (Array.isArray(decoded.permissions) ? decoded.permissions : []);

                    setUser({
                        id:          decoded.id,
                        username:    decoded.username,
                        role:        decoded.role,
                        permissions,
                    });
                }
            } catch (err) {
                console.error('Invalid token format', err);
                logout();
            }
        } else {
            setUser(null);
        }
        setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const login = (newToken) => {
        localStorage.setItem('token', newToken);
        setToken(newToken);
        navigate('/');
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        navigate('/login');
    };

    const isAdmin = user?.role === 'ADMIN';

    /**
     * Returns true when the current user holds `permissionKey`.
     * ADMIN accounts always return true regardless of the key.
     *
     * @param {string} permissionKey  — one of the values from utils/permissions.js
     */
    const hasPermission = (permissionKey) => {
        if (!user) return false;
        if (user.role === 'ADMIN') return true;
        return Array.isArray(user.permissions) && user.permissions.includes(permissionKey);
    };

    return (
        <AuthContext.Provider value={{ user, token, isAdmin, permissions: user?.permissions ?? [], hasPermission, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
