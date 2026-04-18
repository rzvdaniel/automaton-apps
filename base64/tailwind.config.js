/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: ['./index.html', './js/**/*.js'],
    theme: {
        extend: {
            colors: {
                ink: { 950: '#0b1220' },
                mist: '#eef4ff',
                coral: '#ff7a59',
                aqua:  '#5ad1e6',
            },
            boxShadow: {
                soft:  '0 24px 80px rgba(15, 23, 42, 0.14)',
                panel: '0 18px 44px rgba(15, 23, 42, 0.12)',
            },
        },
    },
    plugins: [],
};
