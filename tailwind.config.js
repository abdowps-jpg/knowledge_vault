const { themeColors, radii, space } = require("./theme.config");
const plugin = require("tailwindcss/plugin");

const tailwindColors = Object.fromEntries(
  Object.entries(themeColors).map(([name, swatch]) => [
    name,
    {
      DEFAULT: `var(--color-${name})`,
      light: swatch.light,
      dark: swatch.dark,
    },
  ]),
);

// Expose our radii/space scale to Tailwind so `rounded-md`, `p-md`, `gap-sm`
// etc. all resolve to the same numbers our RN components use via useTokens().
const tailwindRadii = Object.fromEntries(
  Object.entries(radii).map(([k, v]) => [k, `${v}px`])
);
const tailwindSpace = Object.fromEntries(
  Object.entries(space).map(([k, v]) => [k, `${v}px`])
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  // Scan all component and app files for Tailwind classes
  content: ["./app/**/*.{js,ts,tsx}", "./components/**/*.{js,ts,tsx}", "./lib/**/*.{js,ts,tsx}", "./hooks/**/*.{js,ts,tsx}"],

  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: tailwindColors,
      borderRadius: tailwindRadii,
      spacing: tailwindSpace,
    },
  },
  plugins: [
    plugin(({ addVariant }) => {
      addVariant("light", ':root:not([data-theme="dark"]) &');
      addVariant("dark", ':root[data-theme="dark"] &');
    }),
  ],
};
