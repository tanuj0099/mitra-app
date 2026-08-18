import React from 'react';

const facts = [
  "Incubated at Cambridge Innovation Center (CIC)",
  "Conversational AI that truly listens",
  "Adaptive physiotherapy for all mobility levels",
  "Automated multi-tiered SOS safety net",
  "100% voice-operated hands-free UI",
  "Designed for accessibility from day one",
  "Privacy-first edge AI architecture",
];

export function InfiniteMarquee() {
  return (
    <div className="w-full bg-brand text-paper overflow-hidden py-6 relative flex items-center">
      {/* 
        We duplicate the list so the animation can loop seamlessly.
        TranslateX goes from 0 to -50%, which corresponds to moving exactly one full set of items.
      */}
      <div className="flex w-[200%] animate-marquee whitespace-nowrap items-center">
        {[...facts, ...facts].map((fact, i) => (
          <div key={i} className="flex items-center gap-12 px-6">
            <span className="font-serif text-2xl font-medium tracking-wide opacity-90">{fact}</span>
            <div className="w-2 h-2 rounded-full bg-accent/80 shrink-0"></div>
          </div>
        ))}
      </div>
      
      {/* Decorative gradient edges to make the marquee fade in/out smoothly */}
      <div className="absolute top-0 left-0 w-16 h-full bg-gradient-to-r from-brand to-transparent z-10 pointer-events-none"></div>
      <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-brand to-transparent z-10 pointer-events-none"></div>
    </div>
  );
}
