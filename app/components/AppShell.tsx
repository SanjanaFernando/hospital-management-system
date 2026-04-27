"use client";

import { PropsWithChildren } from "react";
import { AuthSessionProvider } from "@/app/context/AuthSessionContext";
import RoleSwitcher from "@/app/components/RoleSwitcher";

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <AuthSessionProvider>
      <div className="mx-auto max-w-[1600px] px-4 pt-4">
        <RoleSwitcher />
      </div>
      {children}
    </AuthSessionProvider>
  );
}
