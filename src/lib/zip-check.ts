/**
 * Checks a .docx (a ZIP archive) before it is handed to the reader. The sizes an archive declares are written by whoever
 * made it, so every entry is actually unpacked here, counted, and abandoned as soon as it passes a limit.
 */

export const ZIP_LIMITS = { entries: 500, entryBytes: 10 * 1024 * 1024, totalBytes: 20 * 1024 * 1024 };

const END = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export class UnsafeArchive extends Error {
  override name = "UnsafeArchive";
}

async function inflatedSize(data: Uint8Array, max: number): Promise<number> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return size;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      throw new UnsafeArchive("The document unpacks to far more data than a resume holds.");
    }
  }
}

export async function checkZip(bytes: Uint8Array, limits = ZIP_LIMITS): Promise<void> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  const damaged = () => new UnsafeArchive("That file is not a valid .docx document.");

  // The end record is found the way the reader finds it: the last one in the file.
  let end = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 0xffff; i--) {
    if (u32(i) === END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw damaged();
  const count = u16(end + 10);
  const dirSize = u32(end + 12);
  const dirAt = u32(end + 16);
  // Also refuses ZIP64 and data slipped in before the archive, neither of which a resume needs.
  if (count > limits.entries) throw new UnsafeArchive("The document has far more parts than a resume holds.");
  if (dirAt + dirSize !== end) throw damaged();

  const names = new Set<string>();
  let total = 0;
  let seen = 0;
  let at = dirAt;
  while (at + 46 <= end && u32(at) === CENTRAL) {
    if (++seen > limits.entries) throw new UnsafeArchive("The document has far more parts than a resume holds.");
    const encrypted = u16(at + 8) & 1;
    const method = u16(at + 10);
    const packed = u32(at + 20);
    const nameLength = u16(at + 28);
    const local = u32(at + 42);
    names.add(new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength)));
    if (encrypted || (method !== 0 && method !== 8)) throw damaged();
    if (local + 30 > bytes.length || u32(local) !== LOCAL) throw damaged();
    const start = local + 30 + u16(local + 26) + u16(local + 28);
    if (start + packed > bytes.length) throw damaged();
    const data = bytes.subarray(start, start + packed);
    const room = Math.min(limits.entryBytes, limits.totalBytes - total);
    if (method === 0) {
      if (data.length > room) throw new UnsafeArchive("The document unpacks to far more data than a resume holds.");
      total += data.length;
    } else {
      try {
        total += await inflatedSize(data, room);
      } catch (err) {
        throw err instanceof UnsafeArchive ? err : damaged();
      }
    }
    at += 46 + nameLength + u16(at + 30) + u16(at + 32);
  }
  if (seen !== count || !names.has("[Content_Types].xml")) throw damaged();
}
