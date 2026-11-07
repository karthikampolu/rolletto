"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#070a10",
          color: "#e8edf5",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Rolletto hit an unexpected error</h1>
          <p style={{ color: "#a3afc3" }}>Please reload the page.</p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: 16,
              padding: "10px 18px",
              borderRadius: 8,
              border: 0,
              background: "#6a96ff",
              color: "#06101f",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
