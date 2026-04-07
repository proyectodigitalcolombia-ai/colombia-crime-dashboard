const colors = {
  light: {
    text: "#0f1923",
    tint: "#0077cc",

    background: "#f5f7fa",
    foreground: "#0f1923",

    card: "#ffffff",
    cardForeground: "#0f1923",

    primary: "#0077cc",
    primaryForeground: "#ffffff",

    secondary: "#e8f0f8",
    secondaryForeground: "#0f1923",

    muted: "#edf0f4",
    mutedForeground: "#6b7a8d",

    accent: "#e8f0f8",
    accentForeground: "#0f1923",

    destructive: "#e53935",
    destructiveForeground: "#ffffff",

    border: "#dde3ec",
    input: "#dde3ec",

    success: "#2e7d32",
    successForeground: "#ffffff",
    successLight: "#e8f5e9",

    warning: "#f57c00",
    warningForeground: "#ffffff",
    warningLight: "#fff3e0",

    danger: "#c62828",
    dangerForeground: "#ffffff",
    dangerLight: "#ffebee",

    navyDark: "#0a1628",
    navyMid: "#0f2140",
  },

  radius: 10,
};

export type AppColors = typeof colors.light & { radius: number };

export default colors;
