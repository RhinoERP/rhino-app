"use client";

type OrganizationsCountProps = {
  count: number;
};

export function OrganizationsCount({ count }: OrganizationsCountProps) {
  return <div className="font-bold text-2xl">{count}</div>;
}
