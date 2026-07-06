import type { Metadata } from "next";
import { Poppins, Inter } from "next/font/google";
import "./globals.css";
import AppShell from "@/app/components/AppShell";
import { getServerSession } from "@/lib/session.server";
import { AuthSessionProvider } from "@/app/context/AuthSessionContext";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Hospital Bed Management System",
  description: "Real-time hospital bed availability and ward management system",
  icons: {
    icon: "/hospital.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialSession = await getServerSession();

  return (
    <html lang="en">
      <body className={`${poppins.variable} ${inter.variable} antialiased`}>
        <AppShell initialSession={initialSession}>{children}</AppShell>
      </body>
    </html>
  );
}
