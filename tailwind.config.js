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
                }
            },
            borderRadius: {
                '4xl': '2rem',
                '5xl': '2.5rem',
            }
        }
    },
    plugins: [],
}
