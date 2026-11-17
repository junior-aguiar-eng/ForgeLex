/** @type {import('tailwindcss').Config} */
// Cores, fontes e sombras como variáveis (V0 e V1): cada tom aponta para `--fl-*` em `src/index.css`, onde o tema
// `classico` guarda os valores de sempre e o tema `gelo` os troca. Nenhuma tela escreve cor literal.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ivory: {
          50: 'rgb(var(--fl-ivory-50) / <alpha-value>)',
          100: 'rgb(var(--fl-ivory-100) / <alpha-value>)',
          200: 'rgb(var(--fl-ivory-200) / <alpha-value>)',
          300: 'rgb(var(--fl-ivory-300) / <alpha-value>)',
        },
        cognac: {
          50: 'rgb(var(--fl-cognac-50) / <alpha-value>)',
          100: 'rgb(var(--fl-cognac-100) / <alpha-value>)',
          200: 'rgb(var(--fl-cognac-200) / <alpha-value>)',
          400: 'rgb(var(--fl-cognac-400) / <alpha-value>)',
          500: 'rgb(var(--fl-cognac-500) / <alpha-value>)',
          600: 'rgb(var(--fl-cognac-600) / <alpha-value>)',
          700: 'rgb(var(--fl-cognac-700) / <alpha-value>)',
          800: 'rgb(var(--fl-cognac-800) / <alpha-value>)',
          900: 'rgb(var(--fl-cognac-900) / <alpha-value>)',
        },
        stone: {
          50: 'rgb(var(--fl-stone-50) / <alpha-value>)',
          100: 'rgb(var(--fl-stone-100) / <alpha-value>)',
          200: 'rgb(var(--fl-stone-200) / <alpha-value>)',
          300: 'rgb(var(--fl-stone-300) / <alpha-value>)',
          400: 'rgb(var(--fl-stone-400) / <alpha-value>)',
          500: 'rgb(var(--fl-stone-500) / <alpha-value>)',
          600: 'rgb(var(--fl-stone-600) / <alpha-value>)',
          700: 'rgb(var(--fl-stone-700) / <alpha-value>)',
          800: 'rgb(var(--fl-stone-800) / <alpha-value>)',
          900: 'rgb(var(--fl-stone-900) / <alpha-value>)',
          950: 'rgb(var(--fl-stone-950) / <alpha-value>)',
        },
        amber: {
          50: 'rgb(var(--fl-amber-50) / <alpha-value>)',
          100: 'rgb(var(--fl-amber-100) / <alpha-value>)',
          200: 'rgb(var(--fl-amber-200) / <alpha-value>)',
          300: 'rgb(var(--fl-amber-300) / <alpha-value>)',
          600: 'rgb(var(--fl-amber-600) / <alpha-value>)',
          700: 'rgb(var(--fl-amber-700) / <alpha-value>)',
          800: 'rgb(var(--fl-amber-800) / <alpha-value>)',
          900: 'rgb(var(--fl-amber-900) / <alpha-value>)',
        },
        emerald: {
          50: 'rgb(var(--fl-emerald-50) / <alpha-value>)',
          200: 'rgb(var(--fl-emerald-200) / <alpha-value>)',
          300: 'rgb(var(--fl-emerald-300) / <alpha-value>)',
          600: 'rgb(var(--fl-emerald-600) / <alpha-value>)',
          700: 'rgb(var(--fl-emerald-700) / <alpha-value>)',
          800: 'rgb(var(--fl-emerald-800) / <alpha-value>)',
        },
        champagne: {
          border: 'rgb(var(--fl-line) / 0.22)',
          'border-subtle': 'rgb(var(--fl-line) / 0.12)',
          light: 'rgb(var(--fl-champagne-light) / <alpha-value>)',
        },
        // Nomes semânticos da especificação de tokens (plano, 7.1). Cada um tem a própria variável: no tema clássico vale
        // a cor que a interface já usa nesse papel, no gelo vale a da tabela. As telas novas usam estes nomes; os tons
        // legados acima existem até a migração das classes (V7).
        canvas: 'rgb(var(--fl-canvas) / <alpha-value>)',
        'canvas-deep': 'rgb(var(--fl-canvas-deep) / <alpha-value>)',
        surface: 'rgb(var(--fl-surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--fl-surface-muted) / <alpha-value>)',
        line: 'rgb(var(--fl-line) / 0.22)',
        'line-control': 'rgb(var(--fl-line-control) / <alpha-value>)',
        ink: 'rgb(var(--fl-ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--fl-ink-soft) / <alpha-value>)',
        muted: 'rgb(var(--fl-muted) / <alpha-value>)',
        subtle: 'rgb(var(--fl-subtle) / <alpha-value>)',
        accent: 'rgb(var(--fl-accent) / <alpha-value>)',
        'accent-strong': 'rgb(var(--fl-accent-strong) / <alpha-value>)',
        'accent-soft': 'rgb(var(--fl-accent-soft) / <alpha-value>)',
        ok: 'rgb(var(--fl-ok) / <alpha-value>)',
        warn: 'rgb(var(--fl-warn) / <alpha-value>)',
        danger: 'rgb(var(--fl-danger) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['var(--fl-font-serif)'],
        sans: ['var(--fl-font-sans)'],
      },
      boxShadow: {
        'card': '0 2px 12px rgb(var(--fl-accent) / 0.05), 0 1px 3px rgba(0, 0, 0, 0.02)',
        'card-hover': '0 8px 24px rgb(var(--fl-accent) / 0.09), 0 2px 6px rgba(0, 0, 0, 0.03)',
      }
    },
  },
  plugins: [],
};
