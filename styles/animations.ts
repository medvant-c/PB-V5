export const animations = {
  fast: "150ms",
  normal: "250ms",
  slow: "400ms",
  hoverScale: 1.03,
  fadeDuration: "300ms",
  slideDuration: "350ms",
} as const;

export type AnimationToken = keyof typeof animations;
