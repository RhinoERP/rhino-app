import type { ReactNode } from "react";
import { OfflineSnapshotAuthorizationMonitor } from "@/components/offline/offline-snapshot-authorization-monitor";

export default function OfflineLayout({ children }: { children: ReactNode }) {
  return (
    <OfflineSnapshotAuthorizationMonitor>
      {children}
    </OfflineSnapshotAuthorizationMonitor>
  );
}
