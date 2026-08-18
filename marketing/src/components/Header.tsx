import Link from "next/link";
import { BlinkingEyes } from "./BlinkingEyes";

export function Header() {
  return (
    <header className="w-full flex items-center justify-between px-6 py-4 border-b border-line/30 bg-paper">
      <Link href="/" className="flex items-center gap-3 no-underline group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand rounded-sm">
        <BlinkingEyes className="w-8 h-8" />
        <span className="font-mono tracking-tight text-xl text-ink font-medium">Happy Wheels</span>
      </Link>
      
      <nav className="flex items-center gap-8">
        <Link 
          href="/about" 
          className="text-ink/80 hover:text-ink hover:text-accent transition-colors font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand rounded-sm"
        >
          Our Story
        </Link>
        <Link 
          href="/sign-in" 
          className="text-ink/80 hover:text-ink hover:text-accent transition-colors font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand rounded-sm"
        >
          Sign In
        </Link>
        <Link 
          href="/sign-up" 
          className="bg-brand text-paper px-6 py-2.5 rounded-full font-medium transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          Try Happy Wheels
        </Link>
      </nav>
    </header>
  );
}
