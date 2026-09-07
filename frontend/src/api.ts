import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const API_URL = `${BACKEND_URL}/api`;
export const TOKEN_KEY = "luth_auth_token";

let memoryToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  memoryToken = token;
}

export function getAuthToken() {
  return memoryToken;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function loadStoredToken(): Promise<string | null> {
  const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  memoryToken = token ?? null;
  return memoryToken;
}

export async function persistToken(token: string | null) {
  memoryToken = token;
  if (token) await storage.secureSet(TOKEN_KEY, token);
  else await storage.secureRemove(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: string; body?: unknown; formData?: FormData; skipAuthHandler?: boolean };

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (memoryToken) headers.Authorization = `Bearer ${memoryToken}`;
  let body: any;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API_URL}${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    if (res.status === 401 && !opts.skipAuthHandler && onUnauthorized) onUnauthorized();
    const detail = data?.detail;
    const message = Array.isArray(detail)
      ? detail.map((d: any) => d.msg ?? JSON.stringify(d)).join(", ")
      : typeof detail === "string"
        ? detail
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/** Resolve media URLs returned by the backend (relative `/api/files/...` paths) to absolute URLs. */
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/")) return `${BACKEND_URL}${url}`;
  return url;
}

/** Backend datetimes are UTC but may arrive without a timezone suffix. */
export function parseDate(value: string | null | undefined): Date {
  if (!value) return new Date();
  const hasTz = /[zZ]|[+-]\d{2}:\d{2}$/.test(value);
  return new Date(hasTz ? value : `${value}Z`);
}

export function timeAgo(value: string | null | undefined): string {
  const diff = Math.max(0, Date.now() - parseDate(value).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return parseDate(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export type UploadResult = { url: string; type: "image" | "video"; path: string; content_type: string };

export async function uploadFile(uri: string, name: string, type: string): Promise<UploadResult> {
  if (Platform.OS === "web") {
    const form = new FormData();
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
    return api<UploadResult>("/upload", { method: "POST", formData: form });
  }
  // Native: Expo's fetch polyfill rejects `{ uri, name, type }` form parts
  // ("Unsupported FormDataPart implementation"), so stream the file with the
  // native multipart uploader instead.
  const headers: Record<string, string> = {};
  if (memoryToken) headers.Authorization = `Bearer ${memoryToken}`;
  const res = await FileSystem.uploadAsync(`${API_URL}/upload`, uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType: type,
    parameters: { filename: name },
    headers,
  });
  let data: any = null;
  try {
    data = res.body ? JSON.parse(res.body) : null;
  } catch {
    data = { detail: res.body };
  }
  if (res.status < 200 || res.status >= 300) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    const detail = data?.detail;
    throw new ApiError(res.status, typeof detail === "string" ? detail : `Upload failed (${res.status})`);
  }
  return data as UploadResult;
}
