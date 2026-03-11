import { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import "./AppLayout.css";

interface AppLayoutProps {
  readonly children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <AppHeader />
      <main className="app-main">{children}</main>
    </div>
  );
}
