import { animations } from "./animations";
import { breakpoints } from "./breakpoints";
import { colors } from "./colors";
import { glass } from "./glass";
import { gradients } from "./gradients";
import { radius } from "./radius";
import { shadows } from "./shadows";
import { spacing } from "./spacing";
import { typography } from "./typography";

export const theme = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  gradients,
  glass,
  animations,
  breakpoints,
} as const;

export type Theme = typeof theme;
