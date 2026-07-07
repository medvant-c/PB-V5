import { colors } from "./colors";

export const gradients = {
  primary: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
  secondary: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%)`,
  hero: `linear-gradient(180deg, ${colors.background} 0%, ${colors.surface} 100%)`,
} as const;

export type GradientToken = keyof typeof gradients;
