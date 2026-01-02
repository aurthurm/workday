import type { Metadata } from "next";
import Providers from "@/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workday",
  description: "A lightweight daily planning and visibility platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-50 text-ink-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
