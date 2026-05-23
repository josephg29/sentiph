import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { DemoUI } from "@/components/demo-ui";
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
