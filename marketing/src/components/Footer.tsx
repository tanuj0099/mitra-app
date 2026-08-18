import Link from "next/link";
import { BlinkingEyes } from "./BlinkingEyes";

export function Footer() {
  return (
    <footer className="w-full border-t border-line/50 bg-paper py-12 px-6 mt-auto">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
        
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 text-ink/60">
            <BlinkingEyes className="w-6 h-6" animate={false} />
            <span className="font-mono text-sm tracking-tight">Happy Wheels</span>
          </div>
          <p className="text-ink/70 text-sm max-w-sm">
            Incubated at Cambridge Innovation Center (CIC) to bring accessible care to everyone.
          </p>
        </div>
        
        <div className="flex gap-8">
          <div className="flex flex-col gap-2">
            <Link href="/" className="text-sm text-ink/70 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand rounded-sm w-fit">Home</Link>
            <Link href="/about" className="text-sm text-ink/70 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand rounded-sm w-fit">Our Story</Link>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/sign-in" className="text-sm text-ink/70 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand rounded-sm w-fit">Sign In</Link>
            <Link href="/sign-up" className="text-sm text-ink/70 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand rounded-sm w-fit">Create Account</Link>
          </div>
        </div>
        
      </div>
      
      <div className="max-w-4xl mx-auto mt-12 pt-6 border-t border-line/30 flex justify-between items-center text-xs text-ink/50">
        <p>© {new Date().getFullYear()} Happy Wheels. All rights reserved.</p>
        <p>Designed with care.</p>
      </div>
    </footer>
  );
}
