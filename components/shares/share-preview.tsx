"use client";

import { FileTextIcon } from "lucide-react";
import { useMemo } from "react";
import { fileKind } from "@/lib/shares/rules";

/** Thumbnails of what was shared (images), file names (PDFs), text preview. */
export function SharePreview({ files, text }: { files: File[]; text: string }) {
  // Object URLs for local files. Not revoked: they're freed when the page
  // goes away, and revoking in an effect breaks under React's dev remount.
  const urls = useMemo(
    () =>
      files.map((f) =>
        fileKind(f) === "image" ? URL.createObjectURL(f) : null,
      ),
    [files],
  );

  if (!files.length && !text) return null;
  return (
    <div className="grid gap-3" data-testid="share-preview">
      {files.length ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {urls[i] ? (
                // Local object URL from the device; next/image can't optimise it.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[i]!}
                  alt={`Shared image ${i + 1}`}
                  className="h-28 w-auto max-w-40 rounded-lg border object-cover object-top"
                />
              ) : (
                <span className="flex h-28 w-32 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center text-xs text-muted-foreground">
                  <FileTextIcon aria-hidden className="size-6" />
                  <span className="line-clamp-2 break-all">
                    {f.name || "File"}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {text ? (
        <p className="line-clamp-3 rounded-lg bg-muted px-3 py-2 text-sm break-words text-muted-foreground">
          {text}
        </p>
      ) : null}
    </div>
  );
}
