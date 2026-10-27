import { Suspense } from "react";
import { ListingSkeleton, RoleListing } from "@/components/RoleListing";

export default function InternshipsPage(props: PageProps<"/internships">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <Suspense fallback={<ListingSkeleton />}>
        <RoleListing
          searchParams={props.searchParams}
          scope="internships"
          path="/internships"
          title="Internships and work experience"
          lead={(total) => `${total.toLocaleString("en-GB")} open: on-site around Loughborough, Leicester, Nottingham and Derby, remote from anywhere, plus events internships`}
        />
      </Suspense>
    </main>
  );
}
