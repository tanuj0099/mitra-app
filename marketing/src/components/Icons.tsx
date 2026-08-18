import React from "react";

export function IconCompanion({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`${className} text-brand`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M 20 50 C 20 30, 80 30, 80 50 C 80 70, 50 80, 20 80 C 30 70, 20 50, 20 50 Z" />
      <path d="M 40 45 L 40 45.1" strokeWidth="6" />
      <path d="M 60 45 L 60 45.1" strokeWidth="6" />
    </svg>
  );
}

export function IconCoach({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`${className} text-brand`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M 50 20 L 50 80" />
      <path d="M 30 40 L 50 20 L 70 40" />
      <circle cx="50" cy="50" r="35" />
    </svg>
  );
}

export function IconSOS({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`${className} text-brand`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="50" cy="50" r="40" />
      <path d="M 50 30 L 50 60" />
      <path d="M 50 70 L 50 70.1" strokeWidth="6" />
    </svg>
  );
}
