/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "media",
  content: ["./*.tsx", "./**/*.tsx", "!./node_modules"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"]
      },
      colors: {
        softgray: {
          DEFAULT: "#F5F7FA",
          dark: "#1E2127"
        },
        juicyorange: {
          50: "#FFF7F0",
          100: "#FFEADB",
          200: "#FFD5B6",
          300: "#FFC091",
          400: "#FFAF75",
          500: "#FF9F59",
          600: "#FF8940",
          700: "#FF6D1A",
          800: "#F55800",
          900: "#D14C00",
          950: "#9A3900"
        },
        electricblue: {
          50: "#F0F9FF",
          100: "#E0F2FF",
          200: "#C3E5FF",
          300: "#9FD4FF",
          400: "#72C0FF",
          500: "#4FACFE",
          600: "#2D92F0",
          700: "#1B79D6",
          800: "#1561AF",
          900: "#104D87",
          950: "#0B325A"
        },
        bubblegumpink: {
          50: "#FFF1F5",
          100: "#FFE3EC",
          200: "#FFC5D8",
          300: "#FFA2BE",
          400: "#FF84AB",
          500: "#FF6B98",
          600: "#FF4781",
          700: "#FF2069",
          800: "#F0005A",
          900: "#C8004C",
          950: "#950039"
        },
        mintfresh: {
          50: "#F0FDF9",
          100: "#DCFCF0",
          200: "#BBF7E2",
          300: "#91F2CD",
          400: "#6DECC0",
          500: "#61E8B3",
          600: "#3DD499",
          700: "#2BB17F",
          800: "#228D66",
          900: "#1C7454",
          950: "#0F4D38"
        },
        limezest: "#AEDC46",
        lavendardream: "#A983FF",
        sunshineyellow: "#FFD166",
        deepnavy: "#130E40"
      }
    }
  },
  plugins: []
}
