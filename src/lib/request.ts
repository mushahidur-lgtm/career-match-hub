import "server-only";

export type JsonBody = { ok: true; value: unknown } | { ok: false; tooLarge: boolean };

/** Reads a JSON body, giving up as soon as it passes the limit rather than after holding all of it. */
export async function readJson(req: Request, maxBytes: number): Promise<JsonBody> {
  if (Number(req.headers.get("content-length")) > maxBytes) return { ok: false, tooLarge: true };
  const reader = req.body?.getReader();
  if (!reader) return { ok: false, tooLarge: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, tooLarge: false };
  }
}
