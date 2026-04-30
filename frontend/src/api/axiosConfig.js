import axios from "axios";

// Create an Axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Intercept all outgoing requests and inject the JWT
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Intercept responses to handle unauthorized (expired/invalid token)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response &&
      (error.response.status === 401 || error.response.status === 403)
    ) {
      // Only force logout if it's explicitly a dead token and not just a failed login attempt
      if (error.config.url !== "/auth/login") {
        localStorage.removeItem("token");
        // Use hash navigation — required because the production build runs on
        // file:// URLs where BrowserRouter-style /login paths don't exist.
        window.location.hash = "#/login";
      }
    }

    const serverMessage =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Request failed";
    error.message = serverMessage;

    return Promise.reject(error);
  }
);

export default api;
