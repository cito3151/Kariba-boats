import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import BoatImage from './BoatImage';

interface Props {
  images: string[];
  alt?: string;
  intervalMs?: number;
  className?: string;
  showArrows?: boolean;
  showDots?: boolean;
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: '0%', opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
};

// Reduced motion keeps the slideshow, but it cross-fades in place instead of
// sweeping the frame sideways, and it stops advancing by itself: an unprompted
// loop every few seconds is the thing the setting most wants gone. The arrows
// and dots still work, so nothing becomes unreachable.
const fadeVariants = {
  enter: () => ({ opacity: 0 }),
  center: { x: '0%', opacity: 1 },
  exit: () => ({ opacity: 0 }),
};

export default function AutoCarousel({
  images,
  alt = '',
  intervalMs = 4000,
  className = '',
  showArrows = false,
  showDots = false,
}: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const variants = reduce ? fadeVariants : slideVariants;

  useEffect(() => {
    if (images.length <= 1 || paused || reduce) return;
    const timer = setInterval(() => {
      setDirection(1);
      setIndex((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [images.length, paused, intervalMs, reduce]);

  const go = (e: React.MouseEvent, dir: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDirection(dir);
    setIndex((i) => (i + dir + images.length) % images.length);
  };

  const jump = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDirection(i > index ? 1 : -1);
    setIndex(i);
  };

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={index}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={reduce ? { duration: 0.25 } : { duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <BoatImage src={images[index]} alt={alt} className="h-full w-full" />
        </motion.div>
      </AnimatePresence>

      {showArrows && images.length > 1 && (
        <>
          <button
            onClick={(e) => go(e, -1)}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60"
            aria-label="Previous photo"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={(e) => go(e, 1)}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60"
            aria-label="Next photo"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {showDots && images.length > 1 && (
        // The dot you see stays 6px, but the button around it is 24px square: the
        // WCAG 2.2 minimum target. These sit inside a card that is itself a link,
        // so a 6px target meant a thumb aimed at a dot usually opened the boat.
        <div className="absolute bottom-0.5 left-1/2 z-10 flex -translate-x-1/2">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => jump(e, i)}
              aria-label={`Go to photo ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              className="group/dot grid h-6 min-w-6 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span
                aria-hidden
                className={`block h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50 group-hover/dot:bg-white/75'
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
