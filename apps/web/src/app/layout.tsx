import type { Metadata } from "next";
import { buildInfo } from "@/lib/build-info";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meet",
  description: "Schedule meetings with your Discord server",
};

function Footer() {
  const b = buildInfo();
  const built = b.builtAt ? new Date(b.builtAt).toUTCString().replace(/:\d\d GMT$/, " UTC") : null;
  const details = [b.commit && `commit ${b.commit}`, built && `built ${built}`].filter(Boolean).join(" · ");
  return (
    <footer className="px-4 py-4 text-center text-[11px] text-muted/70">
      <span title={details || undefined} className="font-mono tabular-nums">
        meet {b.buildString}
      </span>
      {b.commit && (
        <>
          {" · "}
          <a
            href={`https://github.com/ArchitectsStudios/meet/commit/${b.commit}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:text-text"
          >
            {b.commit}
          </a>
        </>
      )}
    </footer>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col antialiased">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
