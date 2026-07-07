export const shadows = {
  small: "0 1px 2px 0 rgba(17, 24, 39, 0.06)",
  medium: "0 4px 8px -2px rgba(17, 24, 39, 0.08)",
  large: "0 12px 24px -4px rgba(17, 24, 39, 0.1)",
  xl: "0 24px 48px -8px rgba(17, 24, 39, 0.14)",
} as const;

export type ShadowToken = keyof typeof shadows;
