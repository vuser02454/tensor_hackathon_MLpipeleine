import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
});

export const m2api = axios.create({
  baseURL: "http://localhost:8001",
});

export default api;
