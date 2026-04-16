import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "https://extractify-29j4.onrender.com",
});

export default api;
