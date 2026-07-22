/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './app.js'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                indigo: {
                    500: '#6366f1',
                    600: '#4f46e5',
                }, // 暫留，Task 2 遷移後刪
                brand: 'rgb(var(--c-brand-rgb) / <alpha-value>)',
                'brand-soft': 'var(--c-brand-soft)',
                surface: 'var(--c-surface)',
                page: 'var(--c-page)',
                ink: 'rgb(var(--c-ink-rgb) / <alpha-value>)',
                muted: 'var(--c-muted)',
                line: 'var(--c-line)',
                high: 'var(--c-high)',
                med: 'var(--c-med)',
                low: 'var(--c-low)',
                rest: 'var(--c-rest)',
                good: 'var(--c-good)',
                danger: 'var(--c-danger)',
            },
            borderRadius: {
                chip: 'var(--r-chip)',
                control: 'var(--r-control)',
                card: 'var(--r-card)',
                panel: 'var(--r-panel)',
                '4xl': '2rem',
                '5xl': '2.5rem',
            }
        }
    },
    plugins: [],
}
