export const glass = {
  background: "rgba(255, 255, 255, 0.6)",
  border: "rgba(255, 255, 255, 0.3)",
  blur: "20px",
  shadow: "0 8px 32px 0 rgba(17, 24, 39, 0.1)",
} as const;

export type GlassToken = keyof typeof glass;
