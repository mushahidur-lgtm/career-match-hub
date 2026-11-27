import { checkZip, UnsafeArchive } from "@/lib/zip-check";

/**
 * Reads the text out of a resume file in the browser. The file itself is never uploaded or stored: only the text that
 * comes out of it is kept, on this device.
 */

export const MAX_RESUME_BYTES = 4 * 1024 * 1024;
export const MAX_RESUME_CHARS = 60_000;
export const MAX_PDF_PAGES = 20;
const PDF_TIMEOUT_MS = 20_000;

export class ResumeFileError extends Error {
  override name = "ResumeFileError";
}

export interface ResumeText {
  text: string;
  fileName: string;
  warning: string | null;
}

const clean = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    // Trailing spaces, line by line: a single expression for this is quadratic on a long run of spaces.
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined") pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  // A copy, because the library takes ownership of the bytes it is given. Nothing in the file is run or fetched.
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = async () => {
    const doc = await task.promise;
    const parts: string[] = [];
    let length = 0;
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES) && length <= MAX_RESUME_CHARS; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const page = content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : "")).join("");
      parts.push(page);
      length += page.length;
    }
    return { text: parts.join("\n\n"), pages: doc.numPages };
  };
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ResumeFileError("This PDF took too long to read. Export a simpler copy or paste the text instead.")), PDF_TIMEOUT_MS);
  });
  try {
    return await Promise.race([read(), timeout]);
  } finally {
    clearTimeout(timer);
    await task.destroy().catch(() => undefined);
  }
}

async function docxText(bytes: Uint8Array): Promise<string> {
  await checkZip(bytes);
  const mammoth = (await import("mammoth")).default;
  // The browser build takes arrayBuffer; the Node build, used by the tests, takes buffer.
  const input = typeof window === "undefined" ? { buffer: Buffer.from(bytes) } : { arrayBuffer: bytes.slice().buffer };
  return (await mammoth.extractRawText(input)).value;
}

export async function readResumeFile(file: File): Promise<ResumeText> {
  if (file.size === 0) throw new ResumeFileError("That file is empty.");
  if (file.size > MAX_RESUME_BYTES) throw new ResumeFileError("That file is over 4 MB. Export a smaller copy or paste the text instead.");

  const name = (file.name || "resume").slice(0, 200);
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "doc") throw new ResumeFileError("Old .doc files are not supported. Save the resume as .docx or PDF.");
  if (!["pdf", "docx", "txt", "md", "markdown"].includes(ext)) throw new ResumeFileError("Upload a PDF, DOCX, TXT or MD file.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  let pages = 0;
  try {
    if (ext === "pdf") {
      if (new TextDecoder("latin1").decode(bytes.subarray(0, 5)) !== "%PDF-") throw new ResumeFileError("That file is not a valid PDF.");
      ({ text, pages } = await pdfText(bytes));
    } else if (ext === "docx") {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new ResumeFileError("That file is not a valid .docx document.");
      text = await docxText(bytes);
    } else {
      text = new TextDecoder().decode(bytes);
    }
  } catch (err) {
    if (err instanceof ResumeFileError) throw err;
    if (err instanceof UnsafeArchive) throw new ResumeFileError(err.message);
    throw new ResumeFileError("The file could not be read. Try another export or paste the text instead.");
  }

  text = clean(text);
  if (text.length < 50) {
    throw new ResumeFileError(ext === "pdf" ? "No text was found in this PDF. It may be a scan. Export a text-based PDF or paste the text instead." : "That file has almost no text in it.");
  }
  const notes = [
    text.length > MAX_RESUME_CHARS ? "The resume was very long, so only the first 60,000 characters are used." : null,
    pages > MAX_PDF_PAGES ? `Only the first ${MAX_PDF_PAGES} pages of the PDF were read.` : null,
  ].filter(Boolean);
  return { text: text.slice(0, MAX_RESUME_CHARS), fileName: name, warning: notes.join(" ") || null };
}
