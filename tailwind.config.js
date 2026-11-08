/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        brand: {
          // Built around the Voltauri logo blue (#0369fa = 600).
          50: "#f0f6ff",
          100: "#dceafe",
          200: "#b9d6fd",
          300: "#88b8fc",
          400: "#4b95fb",
          500: "#227dfc",
          600: "#0369fa",
          700: "#0358ce",
          800: "#0747a2",
          900: "#0a397b",
        },
      },
    },
  },
  plugins: [],
};
