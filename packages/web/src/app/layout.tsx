import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import { AppNavDock } from "@/components/layout/app-nav-dock";
import "./globals.css";

export const viewport: Viewport = {
  viewportFit: "cover",
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jbmono",
  display: "swap",
});

// Home display serif (story headlines + the cinematic caption layer). Declared
// as its own variable so the dashboard's `font-display` heading utility is
// never touched; only the home-facing `font-cormorant` utility consumes it.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "INDAGO — Investigative Intelligence Built From Evidence",
  description:
    "INDAGO arranges what you know into one reviewable picture — evidence, provenance, relationships, and what to check next.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrainsMono.variable} ${cormorant.variable}`}
    >
      <body className="grain min-h-screen bg-surface-0 font-sans text-surface-700 antialiased">
        <AppNavDock />
        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
