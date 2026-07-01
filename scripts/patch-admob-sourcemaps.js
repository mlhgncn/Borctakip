const fs = require('fs');
const path = require('path');

const packageDir = path.join(__dirname, '..', 'node_modules', '@capacitor-community', 'admob');
const distEsmDir = path.join(packageDir, 'dist', 'esm');

function fixSourceMap(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const fixed = content.replace(/\/\/# sourceMappingURL=.*$/gm, '');
  if (fixed !== content) {
    fs.writeFileSync(filePath, fixed, 'utf8');
  }
}

function patchMaps(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      patchMaps(fullPath);
    } else if (item.endsWith('.js')) {
      fixSourceMap(fullPath);
    }
  }
}

patchMaps(distEsmDir);
console.log('Patched @capacitor-community/admob source map paths in dist/esm JS files');
