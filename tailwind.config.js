module.exports = {
    content: [
        './pages/**/*.{js,ts,jsx,tsx}',
        './components/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                // KinLoop warm sunset palette
                kin: {
                    50:  '#FFF7F3',
                    100: '#FFEDE5',
                    200: '#FFD9CC',
                    300: '#FFBDA6',
                    400: '#FF9B7A',
                    500: '#E8725C',  // primary coral
                    600: '#D4604D',
                    700: '#B5493A',
                    800: '#8C3A2F',
                    900: '#6B2D24',
                },
                sand: {
                    50:  '#FFFBF7',
                    100: '#FFF5EC',
                    200: '#FFECD9',
                    300: '#F2CC8F',  // golden sand accent
                    400: '#E5B97A',
                    500: '#D4A56A',
                },
                sage: {
                    50:  '#F2F8F5',
                    100: '#E0EDE6',
                    200: '#C1DBC9',
                    300: '#9FC5AC',
                    400: '#81B29A',  // sage green accent
                    500: '#6A9A83',
                    600: '#537A68',
                },
                warmgray: {
                    50:  '#FAFAF8',
                    100: '#F5F3F0',
                    200: '#EDE8E3',
                    300: '#DDD5CC',
                    400: '#B8AEA4',
                    500: '#8B7E7A',
                    600: '#6B5F5B',
                    700: '#4A3F3C',
                    800: '#3D2C2E',
                    900: '#2D2424',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
            animation: {
                'slide-up': 'slide-up 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
                'fade-in': 'fade-in 0.2s ease-out',
                'scale-in': 'scale-in 0.2s ease-out',
            },
            keyframes: {
                'slide-up': {
                    from: { opacity: '0', transform: 'translateY(100%)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in': {
                    from: { opacity: '0' },
                    to: { opacity: '1' },
                },
                'scale-in': {
                    from: { opacity: '0', transform: 'scale(0.95)' },
                    to: { opacity: '1', transform: 'scale(1)' },
                },
            },
        },
    },
    plugins: [require('@tailwindcss/typography')],
};
