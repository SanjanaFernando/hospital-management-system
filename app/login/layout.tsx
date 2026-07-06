import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login — Hospital Bed Management System",
  description: "Authenticate to access the hospital management dashboard",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
