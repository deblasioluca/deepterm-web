import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#0A0A0F',
          secondary: '#12121A',
          tertiary: '#1A1A2E',
        },
        border: {
          DEFAULT: '#2A2A3E',
          hover: '#3A3A5E',
        },
        text: {
          primary: '#F0F0F5',
          secondary: '#9090A8',
          tertiary: '#606078',
        },
        accent: {
          primary: '#6C5CE7',
          'primary-hover': '#7C6CF7',
          secondary: '#00D4AA',
          warning: '#FDCB6E',
          danger: '#FF6B6B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        h1: ['48px', { lineHeight: '56px', fontWeight: '700' }],
        h2: ['36px', { lineHeight: '44px', fontWeight: '700' }],
        h3: ['24px', { lineHeight: '32px', fontWeight: '600' }],
        body: ['16px', { lineHeight: '26px', fontWeight: '400' }],
        small: ['14px', { lineHeight: '22px', fontWeight: '400' }],
      },
      spacing: {
        section: '96px',
      },
      maxWidth: {
        content: '1280px',
      },
      borderRadius: {
        card: '16px',
        button: '8px',
      },
      backgroundImage: {
        'gradient-hero': 'linear-gradient(135deg, #6C5CE7 0%, #00D4AA 100%)',
        'gradient-text': 'linear-gradient(135deg, #6C5CE7 0%, #00D4AA 100%)',
      },
      animation: {
        'cursor-blink': 'blink 1s step-end infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
