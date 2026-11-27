"use client";

import { useState } from "react";

// Company logo: the stored logo, else the company website's icon, else a coloured monogram.
// Flat, muted tiles (no gradients) so a monogram sits quietly beside real logos.
const PALETTE = ["#1f3a5f", "#0f5e63", "#1f5c43", "#7a4a12", "#8a2c3a", "#1f4fd8", "#3d4654", "#5a4632"];

function hash(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function CompanyLogo({ name, logoUrl, domain, size = 48 }: { name: string; logoUrl?: string | null; domain?: string | null; size?: number }) {
  // The stored logo, then the high-resolution icon most sites publish for phones, then the
  // site's ordinary icon (via Google), then initials.
  const sources = [
    logoUrl,
    domain ? `https://${domain}/apple-touch-icon.png` : null,
    domain ? `https://www.${domain.replace(/^www\./, "")}/apple-touch-icon.png` : null,
    domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null,
  ].filter((s): s is string => !!s);
  const [index, setIndex] = useState(0);
  const src = sources[index];
  const box = { width: size, height: size };
  const radius = size >= 64 ? "rounded-xl" : "rounded-lg";

  if (!src) {
    const fill = PALETTE[hash(name) % PALETTE.length];
    const letters = name.replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    return (
      <span
        aria-hidden
        style={{ ...box, background: fill, fontSize: size * 0.36 }}
        className={`flex shrink-0 items-center justify-center font-semibold tracking-tight text-white ${radius}`}
      >
        {letters || "?"}
      </span>
    );
  }
  return (
    <span style={box} className={`flex shrink-0 items-center justify-center overflow-hidden border border-border bg-white p-1.5 ${radius}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote logos from many hosts */}
      <img
        src={src}
        alt=""
        loading="lazy"
        className="h-full w-full object-contain"
        onError={() => setIndex((i) => i + 1)}
        // Google answers unknown sites with a tiny blank globe: treat that as no logo.
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth < 24) setIndex((i) => i + 1);
        }}
      />
    </span>
  );
}
