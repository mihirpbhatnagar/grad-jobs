// Small display helpers shared by role cards and role pages.

const gbpShort = (n: number) => (n >= 1000 ? `£${Math.round(n / 1000)}k` : `£${n}`);

export function salaryShort(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && max !== min) return `${gbpShort(min)}–${gbpShort(max)}`;
  return gbpShort((min ?? max)!);
}

export const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

export const dateLong = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
export const dateShort = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(`${iso.slice(0, 10)}T23:59:59`).getTime() - Date.now()) / 86_400_000) - 1;
}

export function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  return `Posted ${dateShort(iso)}`;
}

export function startLabel(role: { start_status: string | null; tags: { startText: string | null } }): string {
  if (role.start_status === "confirmed" && role.tags.startText) return `Starts ${role.tags.startText}`;
  if (role.start_status === "likely") return "2027 intake";
  return "Start not stated";
}

// Older listings were stored with some HTML codes (e.g. "&#163;" for £) still in the text.
export const decodeEntities = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&pound;/g, "£")
    .replace(/&amp;/g, "&");
