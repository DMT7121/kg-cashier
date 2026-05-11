const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');

const DIR = path.join(__dirname, 'public', 'kiemkho');

async function processImages() {
  const files = fs.readdirSync(DIR);
  
  for (const file of files) {
    if (!file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.jpeg')) continue;
    
    const filePath = path.join(DIR, file);
    console.log(`Processing: ${file}`);
    
    try {
      const image = await Jimp.read(filePath);
      const w = image.bitmap.width;
      const h = image.bitmap.height;
      const data = image.bitmap.data;
      
      for (let i = 0; i < w * h * 4; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];
        
        // Calculate lightness
        const maxColor = Math.max(r, g, b);
        const minColor = Math.min(r, g, b);
        
        // If color is very close to white/light gray and has low saturation
        // White distance:
        const distToWhite = Math.sqrt((255-r)**2 + (255-g)**2 + (255-b)**2);
        
        if (distToWhite < 30) {
          // Pure white or very close
          data[i+3] = 0;
        } else if (distToWhite < 60) {
          // Anti-alias edge smoothing
          // Alpha reduces linearly from 255 to 0 as distToWhite goes from 60 to 30
          const alpha = ((distToWhite - 30) / 30) * 255;
          data[i+3] = Math.min(a, alpha);
        }
      }
      
      await image.write(filePath);
      console.log(`Done: ${file}`);
    } catch (e) {
      console.error(`Error processing ${file}:`, e.message);
    }
  }
}

processImages();
