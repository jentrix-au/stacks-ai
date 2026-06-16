export const ANIM = {
  startDebounceMs: 120,
  savedDecayMs: 1500,
  errorDecayMs: 4000,
  fadeInMs: 200,
  fadeOutMs: 200,
  highlightMs: 600,
  pulseMs: 600,
  dimMs: 150,
  easeOut: [0.16, 1, 0.3, 1] as const,
  ease: [0.4, 0, 0.2, 1] as const,
};

export const PENDING_CLASS =
  "opacity-60 pointer-events-none transition-opacity duration-150 ease-out";

export const itemVariants = {
  initial: { opacity: 0, y: -4 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: ANIM.fadeInMs / 1000, ease: ANIM.easeOut },
  },
  exit: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: 0,
    transition: { duration: ANIM.fadeOutMs / 1000, ease: ANIM.ease },
  },
};
