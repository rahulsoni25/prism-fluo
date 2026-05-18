'use client';
import { useEffect, useRef, useState } from 'react';
import { FLOAT_PHASE } from '@/lib/insights/buckets';

/**
 * Scroll-triggered card reveal. Three layers of motion:
 *   1. Card fades + translates in (fadeInUp) when it enters the viewport
 *   2. Card gently floats forever after (.float-card from globals.css)
 *   3. Chart.js draw animations play on mount (bars grow, doughnuts spin, etc.)
 *
 * Children only mount once the card is in-view, so the Chart.js animation
 * plays at the right time. minHeight prevents the empty placeholder from
 * collapsing — without it, all cards would appear in-viewport at once.
 */
export default function AnimatedCard({ index, bucketCls, children }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return; }

    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.06, rootMargin: '0px 0px 80px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // .insight-card runs two animations: fadeInUp then float-card.
  // animation-delay takes comma-separated values, one per animation.
  const fadeDelay  = index * 0.08;
  const floatDelay = FLOAT_PHASE[index % FLOAT_PHASE.length];

  return (
    <div
      ref={ref}
      className={`insight-card ${bucketCls}`}
      style={
        shown
          ? { animationDelay: `${fadeDelay}s, ${floatDelay}s` }
          : { animation: 'none', opacity: 0, transform: 'translateY(12px)', minHeight: 260 }
      }
    >
      {shown ? children : null}
    </div>
  );
}
