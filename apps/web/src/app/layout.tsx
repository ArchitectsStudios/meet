import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meet",
  description: "Schedule meetings with your Discord server",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
