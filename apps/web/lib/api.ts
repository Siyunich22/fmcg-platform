import axios from "axios";
import type { ApiError } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token from session to every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = sessionStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  // Let browser/axios set Content-Type automatically for FormData (includes boundary)
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

// Normalize error messages
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const message: string =
      (error.response?.data as ApiError)?.detail ||
      error.message ||
      "Unknown error";
    return Promise.reject(new Error(message));
  }
);

// ─── Upload helper (multipart) ────────────────────────────────────────────
export async function uploadFile(endpoint: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const token = sessionStorage.getItem("access_token");
  const res = await api.post(endpoint, form, {
    headers: {
      "Content-Type": "multipart/form-data",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return res.data;
}

// ─── Format helpers ───────────────────────────────────────────────────────
export function formatMoney(value: number, decimals = 0): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} млрд`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} тыс`;
  return value.toLocaleString("ru-KZ", { maximumFractionDigits: decimals });
}

export function formatQty(value: number): string {
  return value.toLocaleString("ru-KZ", { maximumFractionDigits: 0 });
}

export function stockFlagColor(flag: string): string {
  return { ok: "text-green-600", warning: "text-amber-600", critical: "text-red-600" }[flag] ?? "";
}

export function stockFlagBg(flag: string): string {
  return {
    ok: "bg-green-50 text-green-700 border-green-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    critical: "bg-red-50 text-red-700 border-red-200",
  }[flag] ?? "";
}

export function debtStatusBg(status: string): string {
  return {
    ok: "bg-green-50 text-green-700",
    warning: "bg-amber-50 text-amber-700",
    risk: "bg-orange-50 text-orange-700",
    critical: "bg-red-50 text-red-700",
  }[status] ?? "";
}

export function orderStatusLabel(status: string): string {
  return {
    pending: "Ожидает",
    confirmed: "Подтверждена",
    shipped: "Отгружена",
    delivered: "Доставлена",
    cancelled: "Отменена",
  }[status] ?? status;
}
