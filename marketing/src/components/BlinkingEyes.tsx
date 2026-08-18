import React from "react";

interface BlinkingEyesProps {
  className?: string;
  animate?: boolean;
}

export function BlinkingEyes({ className = "w-12 h-12", animate = true }: BlinkingEyesProps) {
  return (
    <svg 
      viewBox="0 0 100 40" 
      className={`${className} text-ink`}
      fill="currentColor"
      aria-hidden="true"
    >
      <g className={animate ? "animate-slow-blink" : ""}>
        <path d="M 20 20 C 30 5, 40 5, 50 20 C 40 35, 30 35, 20 20 Z" />
        <circle cx="35" cy="20" r="5" fill="var(--paper)" />
        
        <path d="M 50 20 C 60 5, 70 5, 80 20 C 70 35, 60 35, 50 20 Z" />
        <circle cx="65" cy="20" r="5" fill="var(--paper)" />
      </g>
    </svg>
  );
}
