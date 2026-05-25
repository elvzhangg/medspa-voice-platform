// Temporary landing-down state. Renders a Chromium-style "This site can't
// be reached" page so accidental visitors think the domain isn't resolving
// rather than seeing the old marketing site or a Next.js 404. The real
// landing page is preserved at src/app/_disabled-landing/page.tsx.bak.
//
// To restore:
//   git mv src/app/_disabled-landing/page.tsx.bak src/app/page.tsx
//   rmdir src/app/_disabled-landing

export const metadata = {
  title: "vauxvoice.com",
};

export default function Page() {
  return (
    <div
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: "0",
        background: "#f1f3f4",
        color: "#202124",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          padding: "120px 32px 64px",
        }}
      >
        <h1
          style={{
            fontSize: 26,
            fontWeight: 400,
            margin: "0 0 16px",
            color: "#202124",
            lineHeight: 1.25,
          }}
        >
          This site can&rsquo;t be reached
        </h1>

        <p
          style={{
            fontSize: 15,
            color: "#5f6368",
            lineHeight: 1.5,
            margin: "0 0 28px",
          }}
        >
          <strong style={{ color: "#202124", fontWeight: 500 }}>vauxvoice.com</strong>&rsquo;s server IP address could not be found.
        </p>

        <p style={{ fontSize: 13, color: "#5f6368", margin: "0 0 8px" }}>Try:</p>
        <ul
          style={{
            fontSize: 13,
            color: "#5f6368",
            margin: "0 0 36px",
            paddingLeft: 20,
            lineHeight: 1.85,
          }}
        >
          <li>
            <a
              href="https://www.google.com/search?q=vauxvoice"
              style={{ color: "#1a73e8", textDecoration: "none" }}
            >
              Checking the connection
            </a>
          </li>
          <li>
            <a
              href="https://www.google.com/search?q=DNS"
              style={{ color: "#1a73e8", textDecoration: "none" }}
            >
              Checking the proxy and the firewall
            </a>
          </li>
          <li>
            <a
              href="https://www.google.com/search?q=DNS"
              style={{ color: "#1a73e8", textDecoration: "none" }}
            >
              Running Windows Network Diagnostics
            </a>
          </li>
        </ul>

        <p
          style={{
            fontSize: 11,
            color: "#5f6368",
            margin: "0 0 36px",
            letterSpacing: "0.02em",
          }}
        >
          ERR_NAME_NOT_RESOLVED
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            style={{
              background: "#1a73e8",
              color: "white",
              border: "none",
              borderRadius: 4,
              padding: "8px 20px",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
