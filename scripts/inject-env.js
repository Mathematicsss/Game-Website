const fs = require('fs');
const path = require('path');
const url = process.env.SOCKET_URL || '';
const out = path.join(__dirname, '..', 'public', 'js', 'config.js');
const content = "window.SOCKET_URL = " + JSON.stringify(url) + ";\n";
fs.writeFileSync(out, content, 'utf8');
console.log('Wrote config.js with SOCKET_URL:', url || '(same origin)');
