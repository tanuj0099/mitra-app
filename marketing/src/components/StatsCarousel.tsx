import React from "react";

export function StatsCarousel() {
  return (
    <div className="w-full relative mt-16">
      {/* Snap Scrolling Container */}
      <div className="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-8 hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        
        {/* Slide 1: Graph */}
        <div className="min-w-[85vw] md:min-w-[400px] snap-center shrink-0 bg-[#EFECE3] border border-line rounded-2xl p-8 flex flex-col gap-6">
          <div>
            <h4 className="font-serif text-xl text-ink">Weekly Adherence</h4>
            <p className="text-sm text-ink/70">Consistent daily physical therapy</p>
          </div>
          
          <div className="flex items-end justify-between h-32 mt-4 gap-2 border-b border-line/50 pb-2">
            {[40, 65, 45, 80, 55, 90, 75].map((height, i) => (
              <div key={i} className="w-8 md:w-10 bg-data-green/20 rounded-t-sm relative group transition-all hover:bg-data-green/40" style={{ height: `${height}%` }}>
                <div className="absolute bottom-0 w-full bg-data-green rounded-t-sm transition-all" style={{ height: `${height}%` }}></div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs font-mono text-ink/50 uppercase">
            <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
          </div>
        </div>

        {/* Slide 2: Stat */}
        <div className="min-w-[85vw] md:min-w-[400px] snap-center shrink-0 bg-brand border border-line rounded-2xl p-8 flex flex-col justify-center gap-4 text-paper">
          <h4 className="font-serif text-2xl text-paper/80">Clinical Impact</h4>
          <div className="font-mono text-7xl md:text-8xl tracking-tighter">
            82<span className="text-4xl text-accent">%</span>
          </div>
          <p className="text-lg text-paper/90 font-medium">
            Improvement in consistent session logging when patients use conversational AI over traditional touch screens.
          </p>
        </div>

        {/* Slide 3: Trend */}
        <div className="min-w-[85vw] md:min-w-[400px] snap-center shrink-0 bg-[#EFECE3] border border-line rounded-2xl p-8 flex flex-col gap-6">
          <div>
            <h4 className="font-serif text-xl text-ink">Joint Mobility Trend</h4>
            <p className="text-sm text-ink/70">Average shoulder flexion over 4 weeks</p>
          </div>
          
          <div className="relative h-32 mt-4 w-full">
            <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible" preserveAspectRatio="none">
              <path d="M 0 35 Q 25 35, 50 20 T 100 5" fill="none" stroke="var(--color-data-green)" strokeWidth="3" strokeLinecap="round" />
              <circle cx="0" cy="35" r="3" fill="var(--color-data-green)" />
              <circle cx="50" cy="20" r="3" fill="var(--color-data-green)" />
              <circle cx="100" cy="5" r="3" fill="var(--color-data-green)" />
            </svg>
          </div>
          <div className="flex justify-between text-xs font-mono text-ink/50 uppercase mt-2">
            <span>Wk 1</span>
            <span>Wk 2</span>
            <span>Wk 4</span>
          </div>
        </div>

      </div>
      
      {/* Decorative gradient for fade effect on edges */}
      <div className="absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-paper to-transparent pointer-events-none md:block hidden"></div>
      <div className="absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-paper to-transparent pointer-events-none md:block hidden"></div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}} />
    </div>
  );
}
