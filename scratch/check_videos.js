const https = require('https');

const urls = [
  'https://calvorosl.com/uploads/product-1779021280777-rabosu.webp',
  'https://calvorosl.com/uploads/product-1779021285385-yb8imw.webp',
  'https://calvorosl.com/uploads/product-1779021286582-fybcqr.webp',
  'https://calvorosl.com/uploads/product-1779021287925-ct142l.webp',
  'https://calvorosl.com/uploads/product-1779021289189-ycy41z.webp'
];

urls.forEach(url => {
  https.request(url, { method: 'HEAD' }, (res) => {
    const size = res.headers['content-length'];
    console.log(`${url}: ${(size / (1024 * 1024)).toFixed(2)} MB`);
  }).end();
});
