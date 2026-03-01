import axios from "axios";

// Create an Axios instance
const api = axios.create({
  baseURL: "http://localhost:5000/api", // Connects to your Express Backend
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
