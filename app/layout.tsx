import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Toyota VTEX Bridge",
  description: "Initial Amplify Gen 2 and Next.js App Router scaffold.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
