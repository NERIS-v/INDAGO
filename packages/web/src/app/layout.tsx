import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "INDAGO",
  description: "Intelligence Analysis Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="grain min-h-screen bg-surface-0 font-sans text-surface-700 antialiased">
        <Sidebar />
        <main className="pl-60 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
