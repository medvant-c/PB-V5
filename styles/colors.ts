export const colors = {
  primary: "#4F7BFF",
  secondary: "#7C4DFF",
  background: "#FAFBFF",
  surface: "#FFFFFF",
  text: "#111827",
  textSecondary: "#667085",
  border: "#E5E7EB",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
} as const;

export type ColorToken = keyof typeof colors;
