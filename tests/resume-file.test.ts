import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MAX_RESUME_BYTES, readResumeFile } from "@/lib/resume-file";

const RESUME = "Senior Data Engineer with 9 years of experience. Built ETL pipelines in Python and SQL on Azure Data Factory and Snowflake. Reported in Power BI.";
const file = (name: string, content: BlobPart) => new File([content], name);

/** A minimal ZIP writer, so hostile archives can be made. `declared` lies about an entry's unpacked size. */
function zip(entries: { name: string; data: Buffer; declared?: number }[]): Uint8Array<ArrayBuffer> {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let at = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const packed = deflateRawSync(e.data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(8, 8);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(e.declared ?? e.data.length, 22);
    head.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(e.declared ?? e.data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(at, 42);
    local.push(head, name, packed);
    central.push(dir, name);
    at += head.length + name.length + packed.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(at, 16);
  return new Uint8Array(Buffer.concat([...local, dirBytes, end]));
}

const xml = (s: string) => Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const docxParts = (text: string) => [
  { name: "[Content_Types].xml", data: xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
  { name: "_rels/.rels", data: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
  { name: "word/document.xml", data: xml(`<w:document ${W}><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`) },
];

/** A one-page PDF holding one line of text, with a correct cross-reference table. */
function pdf(text: string): Uint8Array<ArrayBuffer> {
  const content = `BT /F1 10 Tf 20 700 Td (${text}) Tj ET`;
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
