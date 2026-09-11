const fs = require('fs');
const path = require('path');

// Replace node:sqlite with node_sqlite so pkg doesn't crash on unrecognized core modules.
const bundlePath = path.join(__dirname, 'server_bundled.js');
if (fs.existsSync(bundlePath)) {
  let content = fs.readFileSync(bundlePath, 'utf-8');
  content = content.replace(/node:sqlite/g, 'node_sqlite');
  fs.writeFileSync(bundlePath, content, 'utf-8');
  console.log('Successfully patched server_bundled.js to hide node:sqlite from pkg!');
  process.exit(0);
} else {
  console.error('server_bundled.js not found!');
  process.exit(1);
}
