import { ImageResponse } from "next/og";
import { logoDataUri } from "@/lib/logo";

// App icons for the browser tab and home screen (served at /icon/192 and /icon/512).
export function generateImageMetadata() {
  return [192, 512].map((n) => ({ id: String(n), contentType: "image/png", size: { width: n, height: n } }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);
  // eslint-disable-next-line @next/next/no-img-element
  return new ImageResponse(<img src={logoDataUri(0)} width={size} height={size} alt="" />, { width: size, height: size });
}
