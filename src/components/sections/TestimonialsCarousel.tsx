'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { useLocale } from '@/components/i18n/LocaleProvider';

const testimonials = [
  {
    id: 1,
    quote:
      "DeepTerm has completely transformed how I manage our production servers. The split terminal views let me monitor logs while deploying, and the AI assistant has saved me countless hours troubleshooting.",
    author: 'Sarah Chen',
    title: 'Lead DevOps Engineer',
    company: 'TechFlow Inc.',
    rating: 5,
  },
  {
    id: 2,
    quote:
      "Finally, an SSH client that feels native on macOS. The keyboard shortcuts are intuitive, and the performance is incredible. I've tried every terminal app out there — DeepTerm is the one I'm sticking with.",
    author: 'Marcus Rodriguez',
    title: 'Senior Backend Developer',
    company: 'CloudScale Systems',
    rating: 5,
  },
  {
    id: 3,
    quote:
      "The command snippets feature alone is worth it. I've saved all our deployment scripts, health checks, and maintenance commands. New team members can be productive from day one.",
    author: 'Emily Watson',
    title: 'System Administrator',
    company: 'DataVault Technologies',
    rating: 5,
  },
  {
    id: 4,
    quote:
      "Security was my biggest concern with SSH clients. DeepTerm storing everything in macOS Keychain with zero data collection gives me the peace of mind I need for our enterprise environment.",
    author: 'James Park',
    title: 'Security Engineer',
    company: 'SecureOps Global',
    rating: 5,
  },
];

export function TestimonialsCarousel() {
  const { messages } = useLocale();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const localizedTestimonials = testimonials.map((testimonial, index) => ({
    ...testimonial,
    quote: messages.home.testimonials[index]?.quote ?? testimonial.quote,
    author: messages.home.testimonials[index]?.author ?? testimonial.author,
    title: messages.home.testimonials[index]?.title ?? testimonial.title,
    company: messages.home.testimonials[index]?.company ?? testimonial.company,
  }));

  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const handlePrev = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  const handleNext = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  return (
    <section className="py-section bg-background-secondary/30">
      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-h2 font-bold text-text-primary mb-4">
            {messages.home.testimonialsTitle}
          </h2>
          <p className="text-lg text-text-secondary">
            {messages.home.testimonialsSubtitle}
          </p>
        </motion.div>

        <div className="relative max-w-3xl mx-auto">
          {/* Navigation Buttons */}
          <button
            onClick={handlePrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 p-2 text-text-tertiary hover:text-text-primary transition-colors hidden lg:block"
            aria-label={messages.home.previousTestimonial}
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 p-2 text-text-tertiary hover:text-text-primary transition-colors hidden lg:block"
            aria-label={messages.home.nextTestimonial}
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          {/* Testimonial Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="text-center p-8 md:p-12">
                {/* Stars */}
                <div className="flex justify-center gap-1 mb-6">
                  {[...Array(localizedTestimonials[currentIndex].rating)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-5 h-5 fill-accent-warning text-accent-warning"
                    />
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="text-lg md:text-xl text-text-primary mb-8 leading-relaxed">
                  &ldquo;{localizedTestimonials[currentIndex].quote}&rdquo;
                </blockquote>

                {/* Author */}
                <div>
                  <div className="w-12 h-12 bg-accent-primary/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span className="text-accent-primary font-semibold">
                      {localizedTestimonials[currentIndex].author.charAt(0)}
                    </span>
                  </div>
                  <p className="font-semibold text-text-primary">
                    {localizedTestimonials[currentIndex].author}
                  </p>
                  <p className="text-text-secondary">
                    {localizedTestimonials[currentIndex].title} {messages.home.titleAt} {localizedTestimonials[currentIndex].company}
                  </p>
                </div>
              </Card>
            </motion.div>
          </AnimatePresence>

          {/* Dots */}
          <div className="flex justify-center gap-2 mt-8">
            {localizedTestimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  setIsAutoPlaying(false);
                  setCurrentIndex(index);
                }}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentIndex
                    ? 'w-8 bg-accent-primary'
                    : 'bg-text-tertiary hover:bg-text-secondary'
                }`}
                aria-label={`${messages.home.testimonialAria} ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
