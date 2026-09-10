const API_URL = import.meta.env.VITE_API_URL || '';

export type User = {
  id: number;
  email: string;
  name: string;
  role: 'employee' | 'approver';
};

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  const t = localStorage.getItem('token');
  if (t) headers.Authorization = `Bearer ${t}`;

  let body = options.body;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, body });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (!path.includes('/auth/login')) window.location.href = '/login';
  }

  const text = await res.text();
  let data: { error?: string } = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 200) };
    }
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}

export function money(cents: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(cents / 100);
}

export const CATEGORIES = ['travel', 'meals', 'supplies', 'lodging', 'other'] as const;
