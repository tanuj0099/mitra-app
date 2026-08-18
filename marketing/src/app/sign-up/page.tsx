"use client";

import Link from "next/link";
import { BlinkingEyes } from "../../components/BlinkingEyes";

export default function SignUp() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-paper">
      <Link href="/" className="mb-12 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand rounded-sm" aria-label="Go to homepage">
        <BlinkingEyes className="w-16 h-16 text-brand" />
      </Link>
      
      <div className="w-full max-w-md bg-[#EFECE3] border border-line rounded-2xl p-8 md:p-10 shadow-sm">
        <h1 className="font-serif text-3xl text-ink mb-2">Create Account</h1>
        <p className="text-ink/70 mb-8 font-medium">Join Happy Wheels and set up your safety net.</p>
        
        <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium text-ink">Full Name</label>
            <input 
              type="text" 
              id="name" 
              required
              className="w-full px-4 py-3 rounded-lg border border-line bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-ink">Email Address</label>
            <input 
              type="email" 
              id="email" 
              required
              className="w-full px-4 py-3 rounded-lg border border-line bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-ink">Password</label>
            <input 
              type="password" 
              id="password" 
              required
              className="w-full px-4 py-3 rounded-lg border border-line bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
            />
          </div>
          
          <button 
            type="submit"
            className="w-full bg-brand text-paper py-3.5 rounded-lg font-medium text-lg mt-2 transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            Create Account
          </button>
        </form>

        <p className="text-center mt-6 text-ink/60 text-xs leading-relaxed max-w-[280px] mx-auto">
          We never share your medical data. Activity history stays private and is only used to guide your coaching.
        </p>
        
        <p className="text-center mt-8 text-ink/70 font-medium text-sm">
          Already have an account? <Link href="/sign-in" className="text-brand hover:text-accent focus-visible:outline-2 focus-visible:outline-brand rounded-sm underline underline-offset-4">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
