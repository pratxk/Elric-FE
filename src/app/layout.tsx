import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Elric — Accounts Payable",
  description: "Elric: AP invoice processing agent — 3-way matching, exception queue, approvals. Live API where wired; demo data where tagged.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <Sidebar />
        <div className="pl-60">
          <TopBar />
          <main className="mx-auto max-w-6xl px-8 pb-16 pt-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
