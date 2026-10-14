/**
 * P0-03 FIX: Client hanya mengirim Bearer JWT yang valid.
 * Tidak mengirim header identitas palsu/manual karena backend hanya mempercayai klaim token JWT.
 */
export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem("fhtbs_jwt_token") : null;

  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `HTTP Error ${response.status}`);
  }
  return body as T;
}
