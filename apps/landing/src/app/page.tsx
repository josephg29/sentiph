import { DemoUI } from "@/components/demo-ui";
import { Features } from "@/components/features";
import { Hero } from "@/components/hero";
import { Install } from "@/components/install";
import { StarCta } from "@/components/star-cta";

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Features />
      <DemoUI />
      <Install />
      <StarCta />
    </main>
  );
}
