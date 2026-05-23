import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Install } from "@/components/install";
import { StarCta } from "@/components/star-cta";

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Features />
      <Install />
      <StarCta />
    </main>
  );
}
