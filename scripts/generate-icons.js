// scripts/generate-icons.js — Generate PWA icons using SVG → PNG conversion
// Run: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// SVG template for the KinLoop icon (heart on gradient background)
function createIconSVG(size) {
    const padding = Math.round(size * 0.15);
    const heartSize = size - padding * 2;
    const heartScale = heartSize / 24;
    const cornerRadius = Math.round(size * 0.22);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#E8725C"/>
      <stop offset="100%" style="stop-color:#D4543E"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="url(#bg)"/>
  <g transform="translate(${padding}, ${padding}) scale(${heartScale})">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
          fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

// Write SVG files (these work as fallbacks and for the Apple touch icon)
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

[192, 512, 180].forEach(size => {
    const svg = createIconSVG(size);
    const filename = size === 180 ? 'apple-touch-icon.svg' : `icon-${size}.svg`;
    fs.writeFileSync(path.join(iconsDir, filename), svg);
    console.log(`Created ${filename}`);
});

console.log('\nSVG icons created. To convert to PNG, you can use any SVG-to-PNG tool.');
console.log('For now, the SVGs will work for development. For production, convert them to PNG.');
