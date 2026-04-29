import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verified Writing MVP",
  description: "Proof-of-process writing prototype"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
