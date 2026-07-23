/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './app.js'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                brand: 'rgb(var(--c-brand-rgb) / <alpha-value>)',
                'brand-soft': 'var(--c-brand-soft)',
                surface: 'var(--c-surface)',
                page: 'var(--c-page)',
                ink: 'rgb(var(--c-ink-rgb) / <alpha-value>)',
                muted: 'var(--c-muted)',
                line: 'var(--c-line)',
                high: 'rgb(var(--c-high-rgb) / <alpha-value>)',
                med: 'rgb(var(--c-med-rgb) / <alpha-value>)',
                low: 'rgb(var(--c-low-rgb) / <alpha-value>)',
                rest: 'rgb(var(--c-rest-rgb) / <alpha-value>)',
                good: 'var(--c-good)',
                danger: 'var(--c-danger)',
            },
            borderRadius: {
                chip: 'var(--r-chip)',
                control: 'var(--r-control)',
                card: 'var(--r-card)',
                panel: 'var(--r-panel)',
            },
            opacity: {
                // 8：預設 opacity scale 無此值，供 bg-high/8 等分類卡軟色調底使用
                '8': '0.08',
            }
        }
    },
    plugins: [],
}
