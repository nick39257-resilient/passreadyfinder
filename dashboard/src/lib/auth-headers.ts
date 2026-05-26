export function authHeaders(secret?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret?.trim()) {
    headers.Authorization = `Bearer ${secret.trim()}`;
  }
  return headers;
}
