import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talent Scout",
  description: "GitHub fork profiler CRM for willchen96/mike",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="border-b">
          <div className="mx-auto flex h-14 max-w-7xl items-center px-6">
            <h1 className="text-lg font-semibold">Talent Scout</h1>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
