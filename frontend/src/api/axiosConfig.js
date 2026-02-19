import axios from "axios";

// Create an Axios instance
const api = axios.create({
  baseURL: "http://localhost:3000/api", // Connects to your Express Backend
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
