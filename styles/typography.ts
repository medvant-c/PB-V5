export const typography = {
  display: {
    fontSize: "64px",
    lineHeight: "72px",
    fontWeight: 700,
    letterSpacing: "-0.02em",
  },
  h1: {
    fontSize: "48px",
    lineHeight: "56px",
    fontWeight: 700,
    letterSpacing: "-0.02em",
  },
  h2: {
    fontSize: "36px",
    lineHeight: "44px",
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  h3: {
    fontSize: "28px",
    lineHeight: "36px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  bodyLarge: {
    fontSize: "20px",
    lineHeight: "30px",
    fontWeight: 400,
    letterSpacing: "0em",
  },
  body: {
    fontSize: "16px",
    lineHeight: "24px",
    fontWeight: 400,
    letterSpacing: "0em",
  },
  small: {
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: 400,
    letterSpacing: "0em",
  },
  caption: {
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 500,
    letterSpacing: "0.01em",
  },
  button: {
    fontSize: "16px",
    lineHeight: "24px",
    fontWeight: 600,
    letterSpacing: "0em",
  },
} as const;

export type TypographyToken = keyof typeof typography;
