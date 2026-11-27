import { describe, expect, it } from "vitest";
import { MAX_RESUME_BYTES, readResumeFile } from "@/lib/resume-file";
import { docxParts, zip } from "./fixtures/docx";

const RESUME = "Senior Data Engineer with 9 years of experience. Built ETL pipelines in Python and SQL on Azure Data Factory and Snowflake. Reported in Power BI.";
const file = (name: string, content: BlobPart) => new File([content], name);

/** A one-page PDF holding one line of text, with a correct cross-reference table. */
const pdf = (text: string) => pdfWith(`BT /F1 10 Tf 20 700 Td (${text}) Tj ET`);

function pdfWith(content: string): Uint8Array<ArrayBuffer> {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

describe("reading a resume file", () => {
  it("keeps the words and lines of a PDF apart", async () => {
    const lines = "BT /F1 10 Tf 20 700 Td (Jordan) Tj 60 0 Td (Lee) Tj -60 -16 Td (Data Engineer, Northwind, 2019 - 2023) Tj 0 -16 Td (Skills: Python, SQL, ) Tj (Azure Data Factory) Tj ET";
    const { text } = await readResumeFile(file("cv.pdf", pdfWith(lines)));
    expect(text.split("\n")).toEqual(["Jordan Lee", "Data Engineer, Northwind, 2019 - 2023", "Skills: Python, SQL, Azure Data Factory"]);
  }, 30_000);

  it("reads a text file, a .docx and a PDF", async () => {
    expect((await readResumeFile(file("cv.txt", RESUME))).text).toContain("Azure Data Factory");
    expect((await readResumeFile(file("cv.docx", zip(docxParts(RESUME))))).text).toContain("Azure Data Factory");
    expect((await readResumeFile(file("cv.pdf", pdf(RESUME)))).text).toContain("Azure Data Factory");
  }, 30_000);

  it.each([
    ["an unsupported type", "virus.exe", "MZ...", /Upload a PDF, DOCX/],
    ["an old .doc", "cv.doc", "x".repeat(100), /\.doc files are not supported/],
    ["a file that claims to be a PDF but is not", "cv.pdf", "this is plain text pretending to be a pdf file......", /not a valid PDF/],
    ["a file that claims to be a .docx but is not", "cv.docx", "this is plain text pretending to be a docx file......", /not a valid \.docx/],
    ["an empty file", "cv.txt", "", /empty/],
    ["a file with almost no text", "cv.txt", "hi there", /almost no text/],
    ["a damaged PDF", "cv.pdf", "%PDF-1.4\nnothing else here", /could not be read|No text was found/],
  ])("rejects %s", async (_what, name, content, message) => {
    await expect(readResumeFile(file(name, content))).rejects.toThrow(message);
  });

  it("rejects a file over the size limit", async () => {
    await expect(readResumeFile(file("cv.txt", new Uint8Array(MAX_RESUME_BYTES + 1)))).rejects.toThrow(/over 4 MB/);
  });

  it("rejects a decompression bomb, whatever size it declares", async () => {
    const bomb = Buffer.alloc(40 * 1024 * 1024);
    for (const declared of [undefined, 100]) {
      const archive = zip([...docxParts(RESUME), { name: "word/media/big.bin", data: bomb, declared }]);
      expect(archive.length).toBeLessThan(MAX_RESUME_BYTES);
      await expect(readResumeFile(file("cv.docx", archive))).rejects.toThrow(/unpacks to far more data/);
    }
  }, 30_000);

  it("rejects many medium parts that add up, and too many parts", async () => {
    const part = Buffer.alloc(6 * 1024 * 1024);
    await expect(readResumeFile(file("cv.docx", zip([...docxParts(RESUME), ...[1, 2, 3, 4].map((i) => ({ name: `p${i}`, data: part }))])))).rejects.toThrow(/unpacks to far more data/);
    await expect(readResumeFile(file("cv.docx", zip([...docxParts(RESUME), ...Array.from({ length: 600 }, (_, i) => ({ name: `p${i}`, data: Buffer.from("x") }))])))).rejects.toThrow(/far more parts/);
  }, 30_000);

  it("rejects data slipped in before the archive", async () => {
    const archive = Buffer.concat([Buffer.from("PKjunk"), Buffer.from(zip(docxParts(RESUME)))]);
    await expect(readResumeFile(file("cv.docx", new Uint8Array(archive)))).rejects.toThrow(/not a valid \.docx/);
  });

  it("cuts very long text and says so", async () => {
    const out = await readResumeFile(file("cv.txt", "Data engineer. ".repeat(6000)));
    expect(out.text.length).toBe(60_000);
    expect(out.warning).toMatch(/first 60,000/);
  });
});
