import { Suspense } from "react";
import { ListingSkeleton, RoleListing } from "@/components/RoleListing";
import { SidePanel } from "@/components/SidePanel";

export default function Home(props: PageProps<"/">) {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 pb-24 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <Suspense fallback={<ListingSkeleton />}>
          <RoleListing
            searchParams={props.searchParams}
            scope="main"
            path="/"
            title="Graduate roles starting 2027"
            lead={(total) =>
              `${total.toLocaleString("en-GB")} full-time UK roles starting June 2027 or later`
            }
          />
        </Suspense>
        <footer className="mt-16 text-xs text-muted">
          Listings from <a href="https://www.reed.co.uk" className="underline underline-offset-2">reed.co.uk</a>, Google Jobs and employers&apos; own
          careers pages. Company facts from Wikidata and Wikipedia (CC BY-SA). Sponsor status is from the Home Office register of licensed sponsors and is
          information only.
        </footer>
      </div>

      <aside className="hidden lg:block">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-chip" />}>
          <SidePanel />
        </Suspense>
      </aside>
    </div>
  );
}
