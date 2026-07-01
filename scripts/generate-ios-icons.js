const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const src = path.join(process.cwd(), 'assets', 'icon.png');
const destDir = path.join(process.cwd(), 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
const icons = [
  { idiom: 'iphone', size: '20x20', scale: '2x', filename: 'AppIcon-20@2x.png', width: 40 },
  { idiom: 'iphone', size: '20x20', scale: '3x', filename: 'AppIcon-20@3x.png', width: 60 },
  { idiom: 'iphone', size: '29x29', scale: '2x', filename: 'AppIcon-29@2x.png', width: 58 },
  { idiom: 'iphone', size: '29x29', scale: '3x', filename: 'AppIcon-29@3x.png', width: 87 },
  { idiom: 'iphone', size: '40x40', scale: '2x', filename: 'AppIcon-40@2x.png', width: 80 },
  { idiom: 'iphone', size: '40x40', scale: '3x', filename: 'AppIcon-40@3x.png', width: 120 },
  { idiom: 'iphone', size: '60x60', scale: '2x', filename: 'AppIcon-60@2x.png', width: 120 },
  { idiom: 'iphone', size: '60x60', scale: '3x', filename: 'AppIcon-60@3x.png', width: 180 },
  { idiom: 'ipad', size: '20x20', scale: '1x', filename: 'AppIcon-20@1x~ipad.png', width: 20 },
  { idiom: 'ipad', size: '20x20', scale: '2x', filename: 'AppIcon-20@2x~ipad.png', width: 40 },
  { idiom: 'ipad', size: '29x29', scale: '1x', filename: 'AppIcon-29@1x~ipad.png', width: 29 },
  { idiom: 'ipad', size: '29x29', scale: '2x', filename: 'AppIcon-29@2x~ipad.png', width: 58 },
  { idiom: 'ipad', size: '40x40', scale: '1x', filename: 'AppIcon-40@1x~ipad.png', width: 40 },
  { idiom: 'ipad', size: '40x40', scale: '2x', filename: 'AppIcon-40@2x~ipad.png', width: 80 },
  { idiom: 'ipad', size: '76x76', scale: '1x', filename: 'AppIcon-76@1x~ipad.png', width: 76 },
  { idiom: 'ipad', size: '76x76', scale: '2x', filename: 'AppIcon-76@2x~ipad.png', width: 152 },
  { idiom: 'ipad', size: '83.5x83.5', scale: '2x', filename: 'AppIcon-83.5@2x~ipad.png', width: 167 },
  { idiom: 'universal', size: '1024x1024', scale: '1x', filename: 'AppIcon-1024.png', width: 1024 }
];

(async () => {
  try {
    if (!fs.existsSync(src)) {
      throw new Error(`Source icon not found at ${src}`);
    }
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    for (const icon of icons) {
      const destPath = path.join(destDir, icon.filename);
      await sharp(src)
        .resize(icon.width, icon.width)
        .png()
        .toFile(destPath);
      console.log(`Generated ${icon.filename}`);
    }

    const contents = {
      images: icons.map((icon) => ({
        idiom: icon.idiom,
        size: icon.size,
        filename: icon.filename,
        scale: icon.scale,
      })),
      info: {
        version: 1,
        author: 'xcode',
      },
    };
    fs.writeFileSync(path.join(destDir, 'Contents.json'), JSON.stringify(contents, null, 2));
    console.log('AppIcon set regenerated with', icons.length, 'images');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
