"use client";

import { useCallback, useEffect, useState } from "react";
import { getOrganizationsCountAction } from "@/modules/organizations/actions/get-organizations-count.action";

export function OrganizationsCount() {
  const [count, setCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    try {
      const result = await getOrganizationsCountAction();
      if (result.success) {
        setCount(result.count);
      } else {
        setCount(0);
      }
    } catch (error) {
      console.error("Error fetching organizations count:", error);
      setCount(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();

    // Listen for organization creation event to refresh the count
    const handleOrganizationCreated = () => {
      fetchCount();
    };

    window.addEventListener("organization-created", handleOrganizationCreated);

    return () => {
      window.removeEventListener(
        "organization-created",
        handleOrganizationCreated
      );
    };
  }, [fetchCount]);

  if (isLoading) {
    return <div className="font-bold text-2xl">-</div>;
  }

  return <div className="font-bold text-2xl">{count ?? 0}</div>;
}
