import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Pillars } from "@/components/landing/pillars";
import { Features } from "@/components/landing/features";
import { Architecture } from "@/components/landing/architecture";
import { Cta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { ClaudePet } from "@/components/landing/claude-pet";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Pillars />
        <Features />
        <Architecture />
        <Cta />
      </main>
      <Footer />
      <ClaudePet />
    </>
  );
}
