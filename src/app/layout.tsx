import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { AuthShell } from "@/components/tour";
import "./globals.css";

// Mercury's own face is proprietary — Inter is the honest substitute,
// loaded self-hosted with the exact weights the UI uses (400/500/600/700)
// and font-display: swap so text never blocks on the font.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Elric — Accounts Payable",
  description: "Elric: AP invoice processing agent — 3-way matching, exception queue, approvals.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  );
}
