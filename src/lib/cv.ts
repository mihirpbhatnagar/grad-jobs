import { FIELDS } from "./profile";

// Reads plain text from a CV (PDF or Word) without any AI.
export async function cvToText(file: ArrayBuffer, name: string): Promise<string> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(file));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(file) });
    return value;
  }
  return ""; // old .doc files can't be read without extra tools; the file is still stored
}

// Role types the CV points towards: fields whose keywords appear at least twice.
export function suggestFields(text: string): string[] {
  const body = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  return FIELDS.map((f) => ({ id: f.id, hits: f.keywords.reduce((n, k) => n + (body.split(k).length - 1), 0) }))
    .filter((f) => f.hits >= 2)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5)
    .map((f) => f.id);
}
