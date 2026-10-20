/** @type {import('tailwindcss').Config} */
// Colours come from CSS variables (RGB triplets) so opacity modifiers like
// bg-accent/15 work. Same palette as the Stockroom app.
function withOpacity(varName) {
  return `rgb(var(${varName}) / <alpha-value>)`
}

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: withOpacity('--color-paper'),     // page background
        surface: withOpacity('--color-card'),    // raised surface
        field: withOpacity('--color-field'),     // input surface
        ink: withOpacity('--color-ink'),         // primary text
        muted: withOpacity('--color-inkfaint'),  // muted text
        line: withOpacity('--color-hairline'),   // borders
        accent: withOpacity('--color-amber'),    // accent
        warn: withOpacity('--color-amber'),      // warning
        ok: withOpacity('--color-pine'),         // success
        bad: withOpacity('--color-rust'),        // danger
        plan: withOpacity('--color-inkfaint'),   // planned / neutral
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
