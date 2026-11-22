import { NextResponse } from "next/server";
import { badRequest, rateLimit } from "@/lib/rate-limit";
import type { ParseResumeResponse } from "@/types/job";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Vercel rejects request bodies over about 4.5 MB, so stay under that. */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_CHARS = 60_000;

function clean(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(bytes: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocx(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value;
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "parse-resume", 20);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Send the resume as multipart form data with a field named file.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("No file was attached.");
  if (file.size === 0) return badRequest("That file is empty.");
  if (file.size > MAX_BYTES) return badRequest("That file is over 4 MB. Export a smaller copy or paste the text instead.", 413);

  const name = file.name || "resume";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    let text: string;
    if (ext === "pdf") {
      if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return badRequest("That file is not a valid PDF.", 415);
      text = await extractPdf(bytes);
    } else if (ext === "docx") {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return badRequest("That file is not a valid .docx document.", 415);
      text = await extractDocx(bytes);
    } else if (ext === "txt" || ext === "md" || ext === "markdown") {
      text = bytes.toString("utf8");
    } else if (ext === "doc") {
      return badRequest("Old .doc files are not supported. Save the resume as .docx or PDF.", 415);
    } else {
      return badRequest("Upload a PDF, DOCX, TXT or MD file.", 415);
    }

    text = clean(text);
    if (text.length < 50) {
      return badRequest(
        ext === "pdf"
          ? "No text was found in this PDF. It may be a scan. Export a text-based PDF or paste the text instead."
          : "That file has almost no text in it.",
        422,
      );
    }
    const truncated = text.length > MAX_CHARS;
    const body: ParseResumeResponse = {
      text: truncated ? text.slice(0, MAX_CHARS) : text,
      fileName: name,
      warning: truncated ? "The resume was very long, so only the first 60,000 characters are used." : null,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("parse-resume failed:", err instanceof Error ? err.message : err);
    return badRequest("The file could not be read. Try another export or paste the text instead.", 422);
  }
}
