"use client"; // Error boundaries must be Client Components

/** Root-layout failures. Renders its own document (no app styles load here). */
export default function GlobalError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 480,
          margin: "15vh auto",
          padding: "0 20px",
          lineHeight: 1.5,
        }}
      >
        <title>Something went wrong · KeepTrack</title>
        <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
        <p>
          KeepTrack couldn&apos;t load. Your data is safe — please try again.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
