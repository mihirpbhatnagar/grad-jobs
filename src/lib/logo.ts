// The Grad Jobs logo: a white graduation cap with a gold tassel on a purple tile with a pink glow.
// `radius` 0 gives a full-bleed square for home-screen icons (the phone rounds the corners itself).
export function logoSvg(radius = 24): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
<defs><clipPath id="t"><rect width="96" height="96" rx="${radius}"/></clipPath></defs>
<g clip-path="url(#t)">
<rect width="96" height="96" fill="#534AB7"/>
<circle cx="76" cy="18" r="30" fill="#D4537E"/>
<path d="M48 24 L80 39 L48 54 L16 39 Z" fill="#ffffff"/>
<path d="M30 47 V60 C30 68 66 68 66 60 V47 L48 56 Z" fill="#CECBF6"/>
<path d="M74 42 V61" stroke="#EF9F27" stroke-width="3" stroke-linecap="round"/>
<circle cx="74" cy="64" r="4.5" fill="#EF9F27"/>
</g></svg>`;
}

export const logoDataUri = (radius = 24) => `data:image/svg+xml,${encodeURIComponent(logoSvg(radius))}`;
