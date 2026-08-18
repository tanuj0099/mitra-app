import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";

export default function About() {
  return (
    <>
      <Header />
      <main className="flex-1 flex flex-col w-full overflow-hidden bg-paper px-6 py-24">
        <div className="max-w-2xl mx-auto">
          <h1 className="font-serif text-4xl md:text-5xl text-ink leading-[1.1] tracking-tight mb-12">
            The Story Behind Happy Wheels
          </h1>
          
          <div className="flex flex-col gap-8 text-xl text-ink/80 leading-relaxed font-medium">
            <p>
              Happy Wheels wasn't born in a corporate boardroom looking for a market. It was born at a hackathon, incubated at the Cambridge Innovation Center (CIC), and built by a small team who saw a massive, quiet crisis.
            </p>
            
            <blockquote className="font-serif text-2xl md:text-3xl text-ink leading-relaxed my-8 pl-6 border-l-2 border-accent">
              "We noticed that the elderly and those with limited mobility were being left entirely out of the modern tech conversation."
            </blockquote>
            
            <p>
              Most robotics and AI tools are designed for productivity. They assume the user is highly mobile, has perfect vision, and has the manual dexterity to navigate complex touch screens. But for millions of people, a touchscreen is a barrier, not a tool.
            </p>
            
            <p>
              We built Happy Wheels to be something fundamentally different: a companion that requires zero physical interaction. You just talk to it. It sits on a bedside table or wheelchair mount, providing conversational companionship, guiding you through safe, camera-tracked physical therapy, and constantly listening for distress to ensure you're never truly alone.
            </p>
            
            <p>
              Technology should care for the people who need it most. That's why Happy Wheels exists.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
