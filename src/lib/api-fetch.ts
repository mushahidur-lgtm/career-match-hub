import { isCloudConfigured } from "@/lib/cloud/config";

/** The signed-in session's token, or null. The sign-in library is loaded only where sign-in is set up. */
async function accessToken(): Promise<string | null> {
  if (!isCloudConfigured()) return null;
  try {
    const { getCloud } = await import("@/lib/cloud/client");
    const { data } = (await getCloud()?.auth.getSession()) ?? { data: null };
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Calls one of this app's own routes as the signed-in person. Only same-site paths, so the token cannot be sent elsewhere. */
export async function apiFetch(path: `/api/${string}`, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}
