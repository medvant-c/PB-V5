"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface IllustrationProps {
  className?: string;
}

function useGradientId(prefix: string) {
  const id = useId();
  return `${prefix}${id.replace(/[:]/g, "")}`;
}

function RocketIllustration({ className }: IllustrationProps) {
  const gradId = useGradientId("rocket");
  return (
    <svg viewBox="0 0 48 48" className={cn("h-6 w-6", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F7BFF" />
          <stop offset="1" stopColor="#7C4DFF" />
        </linearGradient>
      </defs>
      <path
        d="M24 4c6 4 9 11 9 19 0 4-1 7-2 9l-7 4-7-4c-1-2-2-5-2-9 0-8 3-15 9-19Z"
        fill={`url(#${gradId})`}
      />
      <circle cx="24" cy="20" r="4.2" fill="white" />
      <path d="M15 27c-3 1-5 4-5 8 3-1 6-2 8-4l-3-4Z" fill={`url(#${gradId})`} />
      <path d="M33 27c3 1 5 4 5 8-3-1-6-2-8-4l3-4Z" fill={`url(#${gradId})`} />
      <path d="M20 36h8l-2 6a2 2 0 0 1-4 0l-2-6Z" fill="#F59E0B" />
    </svg>
  );
}

function BriefcaseIllustration({ className }: IllustrationProps) {
  const gradId = useGradientId("briefcase");
  return (
    <svg viewBox="0 0 48 48" className={cn("h-6 w-6", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F7BFF" />
          <stop offset="1" stopColor="#7C4DFF" />
        </linearGradient>
      </defs>
      <rect x="18" y="8" width="12" height="8" rx="3" fill="none" stroke={`url(#${gradId})`} strokeWidth="3" />
      <rect x="6" y="16" width="36" height="24" rx="6" fill={`url(#${gradId})`} />
      <rect x="20" y="25" width="8" height="6" rx="1.5" fill="white" />
    </svg>
  );
}

function FactoryIllustration({ className }: IllustrationProps) {
  const gradId = useGradientId("factory");
  return (
    <svg viewBox="0 0 48 48" className={cn("h-6 w-6", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F7BFF" />
          <stop offset="1" stopColor="#7C4DFF" />
        </linearGradient>
      </defs>
      <rect x="6" y="24" width="18" height="16" rx="2" fill={`url(#${gradId})`} />
      <rect x="24" y="16" width="18" height="24" rx="2" fill={`url(#${gradId})`} opacity="0.85" />
      <rect x="28" y="6" width="4" height="12" rx="1.5" fill={`url(#${gradId})`} />
      <rect x="35" y="9" width="4" height="9" rx="1.5" fill={`url(#${gradId})`} />
      <rect x="10" y="29" width="5" height="5" rx="1" fill="white" />
      <rect x="29" y="22" width="5" height="5" rx="1" fill="white" />
      <rect x="36" y="22" width="5" height="5" rx="1" fill="white" />
    </svg>
  );
}

function WarehouseIllustration({ className }: IllustrationProps) {
  const gradId = useGradientId("warehouse");
  return (
    <svg viewBox="0 0 48 48" className={cn("h-6 w-6", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F7BFF" />
          <stop offset="1" stopColor="#7C4DFF" />
        </linearGradient>
      </defs>
      <path d="M4 20 24 8l20 12v4H4v-4Z" fill={`url(#${gradId})`} />
      <rect x="6" y="24" width="36" height="16" rx="2" fill={`url(#${gradId})`} opacity="0.85" />
      <rect x="19" y="28" width="10" height="12" rx="1" fill="white" />
      <rect x="9" y="28" width="6" height="6" rx="1" fill="white" opacity="0.9" />
      <rect x="33" y="28" width="6" height="6" rx="1" fill="white" opacity="0.9" />
    </svg>
  );
}

function TruckIllustration({ className }: IllustrationProps) {
  const gradId = useGradientId("truck");
  return (
    <svg viewBox="0 0 48 48" className={cn("h-6 w-6", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F7BFF" />
          <stop offset="1" stopColor="#7C4DFF" />
        </linearGradient>
      </defs>
      <rect x="4" y="16" width="24" height="16" rx="2" fill={`url(#${gradId})`} />
      <path d="M28 21h9l6 6v5h-15v-11Z" fill={`url(#${gradId})`} opacity="0.85" />
      <rect x="32" y="24" width="6" height="5" rx="1" fill="white" opacity="0.9" />
      <circle cx="14" cy="34" r="4" fill="#111827" />
      <circle cx="35" cy="34" r="4" fill="#111827" />
      <circle cx="14" cy="34" r="1.6" fill="white" />
      <circle cx="35" cy="34" r="1.6" fill="white" />
    </svg>
  );
}

function AcademyIllustration({ className }: IllustrationProps) {
  const gradId = useGradientId("academy");
  return (
    <svg viewBox="0 0 48 48" className={cn("h-6 w-6", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F7BFF" />
          <stop offset="1" stopColor="#7C4DFF" />
        </linearGradient>
      </defs>
      <rect x="10" y="26" width="28" height="10" rx="2" fill={`url(#${gradId})`} opacity="0.85" />
      <path d="M4 18 24 10l20 8-20 8-20-8Z" fill={`url(#${gradId})`} />
      <path d="M14 22v8c0 2 4 4 10 4s10-2 10-4v-8" fill="none" stroke={`url(#${gradId})`} strokeWidth="2.5" />
      <circle cx="41" cy="19" r="1.6" fill={`url(#${gradId})`} />
      <path d="M41 19v9" stroke={`url(#${gradId})`} strokeWidth="2" />
    </svg>
  );
}

function RobotIllustration({ className }: IllustrationProps) {
  const gradId = useGradientId("robot");
  return (
    <svg viewBox="0 0 48 48" className={cn("h-6 w-6", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F7BFF" />
          <stop offset="1" stopColor="#7C4DFF" />
        </linearGradient>
      </defs>
      <rect x="10" y="6" width="6" height="6" rx="1.5" fill={`url(#${gradId})`} />
      <rect x="10" y="4" width="2" height="6" fill={`url(#${gradId})`} />
      <rect x="8" y="14" width="32" height="24" rx="8" fill={`url(#${gradId})`} />
      <circle cx="18" cy="25" r="3.6" fill="white" />
      <circle cx="30" cy="25" r="3.6" fill="white" />
      <path d="M17 32c2 2 4 3 7 3s5-1 7-3" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <rect x="2" y="22" width="5" height="10" rx="2.5" fill={`url(#${gradId})`} opacity="0.85" />
      <rect x="41" y="22" width="5" height="10" rx="2.5" fill={`url(#${gradId})`} opacity="0.85" />
    </svg>
  );
}

export {
  RocketIllustration,
  BriefcaseIllustration,
  FactoryIllustration,
  WarehouseIllustration,
  TruckIllustration,
  AcademyIllustration,
  RobotIllustration,
};
