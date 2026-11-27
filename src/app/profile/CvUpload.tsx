"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { recordCv } from "./actions";

// Uploads straight from the browser to the user's private CV folder (signed-in session,
// so storage rules only allow their own folder).
export function CvUpload({ url, publishableKey, userId, current }: {
  url: string;
  publishableKey: string;
  userId: string;
  current: { name: string; uploadedAt: string } | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState("");

  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setStatus("error");
      setError("That file is over 5 MB.");
      return;
    }
    setStatus("uploading");
    const db = createBrowserClient(url, publishableKey);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const path = `${userId}/cv.${ext}`;
    const { error: upErr } = await db.storage.from("cvs").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setStatus("error");
      setError("Upload failed. Use a PDF or Word file under 5 MB.");
      return;
    }
    await recordCv(path, file.name);
    setStatus("idle");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="inline-flex cursor-pointer items-center rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:border-foreground/30">
        {status === "uploading" ? "Uploading…" : current ? "Replace CV" : "Upload CV"}
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          className="sr-only"
          disabled={status === "uploading"}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </label>
      {current && (
        <span className="text-sm text-muted">
          {current.name} · uploaded {new Date(current.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </span>
      )}
      {status === "error" && <span className="text-sm text-rose">{error}</span>}
    </div>
  );
}
