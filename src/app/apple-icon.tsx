import { ImageResponse } from "next/og";
import { logoDataUri } from "@/lib/logo";

// iPhone home-screen icon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // eslint-disable-next-line @next/next/no-img-element
  return new ImageResponse(<img src={logoDataUri(0)} width={180} height={180} alt="" />, size);
}
