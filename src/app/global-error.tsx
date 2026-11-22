"use client";

/** Last-resort boundary for errors in the root layout. It cannot use the app's styles or fonts. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "4rem 1.5rem", maxWidth: "36rem" }}>
        <h1>Something went wrong</h1>
        <p>The app failed to load. Your saved data in this browser has not been deleted.</p>
        <button type="button" onClick={() => retry()} style={{ padding: "0.5rem 1rem", fontSize: "1rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
