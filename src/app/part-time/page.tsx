import { Suspense } from "react";
import { ListingSkeleton, RoleListing } from "@/components/RoleListing";

export default function PartTimePage(props: PageProps<"/part-time">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <Suspense fallback={<ListingSkeleton />}>
        <RoleListing
          searchParams={props.searchParams}
          scope="part_time"
          path="/part-time"
          title="Part-time roles"
          lead={(total) => `${total.toLocaleString("en-GB")} part-time graduate and entry-level roles, kept out of the main list`}
        />
      </Suspense>
    </main>
  );
}
