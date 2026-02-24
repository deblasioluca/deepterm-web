import { Navbar, Footer } from '@/components/layout';
import {
  HeroSection,
  TrustBar,
  FeaturesGrid,
  DeepDiveFeatures,
  TestimonialsCarousel,
  CTASection,
} from '@/components/sections';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <TrustBar />
        <FeaturesGrid />
        <DeepDiveFeatures />
        <TestimonialsCarousel />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
