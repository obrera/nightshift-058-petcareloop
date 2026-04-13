import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#07111d',
        panel: '#101d31',
      },
      boxShadow: {
        panel: '0 30px 70px rgba(2, 8, 23, 0.45)',
      },
    },
  },
  plugins: [],
} satisfies Config;
