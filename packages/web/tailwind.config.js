/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          deep: 'var(--color-bg-deep)',
          surface: 'var(--color-bg-surface)',
        },
        accent: {
          primary: 'var(--color-accent-primary)',
          secondary: 'var(--color-accent-secondary)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
        },
      },
      fontFamily: {
        body: ['Nunito', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        md: '16px',
        lg: '24px',
      },
      transitionTimingFunction: {
        'stoody': 'cubic-bezier(0.25, 0.8, 0.25, 1)',
      },
      transitionDuration: {
        'base': '300ms',
      },
    },
  },
  plugins: [],
};
