import { ImageResponse } from "next/og";

// App icons for the home screen (served at /icon/192 and /icon/512).
export function generateImageMetadata() {
  return [192, 512].map((n) => ({ id: String(n), contentType: "image/png", size: { width: n, height: n } }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1f6f5c",
          color: "#ffffff",
          fontSize: size * 0.55,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        G
      </div>
    ),
    { width: size, height: size },
  );
}
