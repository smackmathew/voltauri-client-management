/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9edff",
          200: "#bce0ff",
          300: "#8ecbff",
          400: "#59adff",
          500: "#3390fa",
          600: "#1d70ef",
          700: "#175adb",
          800: "#1a49b1",
          900: "#1b408b",
        },
      },
    },
  },
  plugins: [],
};
