/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* Design system tokens - use CSS variables for theme-aware colors */
        background: 'var(--background)',
        surface: 'var(--bg)',
        'surface-secondary': 'var(--bg-secondary)',
        'surface-tertiary': 'var(--bg-tertiary)',
        border: 'var(--border)',
        accent: 'var(--accent)',
        'text-primary': 'var(--primary-text)',
        'text-secondary': 'var(--secondary-text)',
        'text-tertiary': 'var(--tertiary-text)',

        /* Interactive */
        base: 'var(--base)',
        'base-text': 'var(--base-text)',
        'base-hover': 'var(--base-hover)',
        'base-active': 'var(--base-active)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-inter)', 'var(--font-display)', 'Georgia', 'serif'],
        mono: ['var(--font-jetbrains-mono)', 'var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '220ms',
        slow: '300ms',
      },
    },
  },
  plugins: [],
};
