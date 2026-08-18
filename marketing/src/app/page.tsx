import Link from "next/link";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { BlinkingEyes } from "../components/BlinkingEyes";
import { IconCompanion, IconCoach, IconSOS } from "../components/Icons";
import { StatsCarousel } from "../components/StatsCarousel";
import { InfiniteMarquee } from "../components/InfiniteMarquee";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1 flex flex-col w-full overflow-hidden">
        
        {/* HERO SECTION */}
        <section className="relative w-full min-h-[85vh] flex flex-col items-center justify-center text-center px-6 py-20 bg-paper overflow-hidden">
          {/* MASSIVE BACKGROUND GRAPHIC */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden select-none">
            <h1 className="text-[25vw] font-serif font-black text-ink/5 tracking-tighter leading-none whitespace-nowrap opacity-40">
              HAPPY
            </h1>
          </div>
          
          <div className="max-w-3xl mx-auto flex flex-col items-center relative z-10">
            <div className="mb-12">
              <BlinkingEyes className="w-40 h-40 md:w-56 md:h-56 text-ink" />
            </div>
            <h1 className="font-serif text-5xl md:text-7xl text-ink leading-[1.1] tracking-tight mb-8">
              Built for the days you can't be there.
            </h1>
            <p className="text-xl md:text-2xl text-ink/80 max-w-2xl mb-12 font-medium">
              A companion that listens, a coach that guides, and a safety net that never sleeps. 
            </p>
            <Link 
              href="/app.html" 
              className="bg-brand text-paper px-10 py-4 rounded-full font-medium text-lg transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              Try Happy Wheels
            </Link>
          </div>
        </section>

        {/* FULL WIDTH CAROUSEL */}
        <InfiniteMarquee />

        {/* PROBLEM SECTION */}
        <section className="w-full px-6 py-24 bg-paper mt-8">
          <div className="max-w-2xl mx-auto">
            <blockquote className="font-serif text-3xl md:text-4xl text-ink leading-relaxed mb-8">
              "We build homes for accessibility, but we leave the days completely empty. The hardest part of limited mobility isn't the physical barriers—it's the isolation."
            </blockquote>
            <div className="h-px w-24 bg-accent mb-8"></div>
            <p className="text-xl text-ink/80 leading-relaxed font-medium">
              Happy Wheels was designed for the gap between medical visits. It sits quietly on a phone mounted to a wheelchair or bedside, offering conversational companionship, safe physical therapy routines, and the peace of mind that if someone stops moving, help is called automatically.
            </p>
          </div>
        </section>

        {/* PRODUCT SECTION */}
        <section className="w-full px-6 py-24 border-t border-line/30 bg-paper">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-12">
              
              <div className="flex flex-col gap-6">
                <IconCompanion className="w-14 h-14" />
                <h3 className="font-serif text-2xl text-ink">Voice Companionship</h3>
                <p className="text-lg text-ink/70 leading-relaxed">
                  Natural, conversational AI that listens and remembers. No screens to tap, no buttons to hunt for—just say "Hey Happy" to share a story, hear a joke, or just talk.
                </p>
              </div>

              <div className="flex flex-col gap-6">
                <IconCoach className="w-14 h-14" />
                <h3 className="font-serif text-2xl text-ink">Adaptive Coach</h3>
                <p className="text-lg text-ink/70 leading-relaxed">
                  Using the device's camera, it safely tracks range of motion for simple physiotherapy exercises. It counts reps, checks form, and builds dynamic wellness reports.
                </p>
                <div className="mt-2 bg-[#EFECE3] border border-line p-4 rounded-lg flex items-center justify-between">
                  <span className="text-ink/80 text-sm font-medium">30-Day Activity</span>
                  <span className="font-mono text-data-green font-medium">24 Sessions</span>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <IconSOS className="w-14 h-14" />
                <h3 className="font-serif text-2xl text-ink">Automated SOS</h3>
                <p className="text-lg text-ink/70 leading-relaxed">
                  If the system detects extended inactivity during a session, or hears distress words, it automatically begins a multi-tiered safety escalation to emergency contacts.
                </p>
              </div>
            </div>
            
            <StatsCarousel />
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="w-full px-6 py-32 bg-paper border-t border-line/30">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-serif text-4xl md:text-5xl text-ink text-center mb-20">How it works</h2>
            
            <div className="flex flex-col gap-16">
              
              <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start md:items-center">
                <div className="font-mono text-5xl text-accent/50 w-16 shrink-0">01</div>
                <div>
                  <h3 className="font-serif text-2xl text-ink mb-3">Mount the device</h3>
                  <p className="text-lg text-ink/70 max-w-xl">
                    Place any modern smartphone or tablet on a wheelchair mount or bedside table. No specialized hardware or complex installation required.
                  </p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start md:items-center">
                <div className="font-mono text-5xl text-accent/50 w-16 shrink-0">02</div>
                <div>
                  <h3 className="font-serif text-2xl text-ink mb-3">Say "Hey Happy"</h3>
                  <p className="text-lg text-ink/70 max-w-xl">
                    The system wakes up instantly via a completely hands-free voice interface. It's designed for low-vision and low-mobility accessibility from day one.
                  </p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start md:items-center">
                <div className="font-mono text-5xl text-accent/50 w-16 shrink-0">03</div>
                <div>
                  <h3 className="font-serif text-2xl text-ink mb-3">Talk, Exercise, or Play</h3>
                  <p className="text-lg text-ink/70 max-w-xl">
                    Start a gamified physical therapy session, play air-music, or just have a conversation. Happy Wheels adapts to your pace and tracks your progress safely.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ABOUT TEASER */}
        <section className="w-full px-6 py-24 bg-ink text-paper text-center">
          <div className="max-w-2xl mx-auto flex flex-col items-center">
            <BlinkingEyes className="w-12 h-12 text-brand mb-8" animate={false} />
            <h2 className="font-serif text-3xl md:text-4xl mb-6">Born from a simple need.</h2>
            <p className="text-xl text-paper/80 leading-relaxed mb-10 font-medium">
              Happy Wheels was incubated at the Cambridge Innovation Center (CIC). It was built by a team who believed that companion robotics shouldn't be a luxury reserved for the few.
            </p>
            <Link 
              href="/about" 
              className="text-brand hover:text-accent font-medium text-lg underline underline-offset-4 decoration-2 transition-colors focus-visible:outline-2 focus-visible:outline-brand rounded-sm"
            >
              Read our story
            </Link>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="w-full px-6 py-40 bg-brand text-center">
          <div className="max-w-3xl mx-auto flex flex-col items-center">
            <h2 className="font-serif text-5xl md:text-6xl text-paper mb-12">
              Ready to meet Happy?
            </h2>
            <Link 
              href="/app.html" 
              className="bg-paper text-brand px-12 py-5 rounded-full font-medium text-xl transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-paper shadow-xl"
            >
              Try Happy Wheels
            </Link>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
