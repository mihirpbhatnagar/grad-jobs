"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoDataUri } from "@/lib/logo";

// Desktop and iPad: three sections across the top. Phone: five tabs along the bottom,
// because the combined My jobs view is too dense for a small screen.
const DESKTOP = [
  { href: "/my-jobs", label: "My jobs" },
  { href: "/", label: "All roles" },
  { href: "/loughborough", label: "Loughborough" },
];

const PHONE = [
  { href: "/my-jobs", label: "For you", icon: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" },
  { href: "/", label: "All roles", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/apply", label: "Apply", icon: "M4 12l16-8-6 16-2-6-8-2z" },
  { href: "/employability", label: "Careers", icon: "M4 8h16v11H4zM9 8V5h6v3" },
  { href: "/loughborough", label: "Lboro", icon: "M3 9l9-5 9 5-9 5-9-5zM7 11v5c3 2 7 2 10 0v-5" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/roles");
  return pathname.startsWith(href);
}

export function Nav() {
  return <NavView pathname={usePathname()} />;
}

// Rendered without a pathname (nothing highlighted) while the page address is still loading.
export function NavView({ pathname }: { pathname: string }) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoDataUri()} alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-semibold tracking-tight">Grad Jobs</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {DESKTOP.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  isActive(pathname, item.href) ? "bg-chip font-medium text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/profile"
            aria-label="Your profile"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-muted hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {PHONE.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${active ? "text-foreground" : "text-muted"}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
                  <path d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
