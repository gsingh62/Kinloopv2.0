// next.config.js
/*
module.exports = {
    reactStrictMode: true,
    reactDevOverlay: false,
    devIndicators: {
        buildActivity: false,
    },
    // You can suppress error overlay in dev only with custom error boundaries, not config
};
*/

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export', // ✅ required for static export
    reactStrictMode: true,
    // add any other configs if needed
};

module.exports = nextConfig;
