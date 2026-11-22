/**
 * Cloud features (sign-in, sync across devices, the daily run) switch on only when both public Supabase
 * values are set. Without them the app is the same browser-only app as before.
 * NEXT_PUBLIC values are fixed at build time, so they must be set before the build, not after.
 */
export const CLOUD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const CLOUD_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isCloudConfigured = (): boolean => /^https:\/\/.+/.test(CLOUD_URL) && CLOUD_ANON_KEY.length > 20;
