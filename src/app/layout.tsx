import type { Metadata, Viewport } from "next";
import { Figtree, Noto_Sans } from "next/font/google";
import "./globals.css";

const heading = Figtree({ variable: "--font-heading", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });
const body = Noto_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: "RecoverWell — Post-op recovery triage",
  description: "Deterministic post-operative symptom triage with nurse-in-the-loop review",
  manifest: "/manifest.json",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
