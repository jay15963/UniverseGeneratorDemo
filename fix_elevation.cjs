const fs = require('fs');

let content = fs.readFileSync('src/lib/planet-generator/generator.ts', 'utf8');

const targetStr = `        // 4. Flatten ocean floor and add ruggedness to land
        if (elevation < seaLevel) {
            const depth = seaLevel - elevation;
            elevation = seaLevel - Math.pow(depth, 0.7) * 0.3;
        } else {
            // Base land noise to prevent perfectly smooth flatlands/ramps, but keep it subtle for flatter plains
            let landNoise = (this.fbm(nx, ny, 4, 0.5, 2.0, 20.0) - 0.5) * 0.02;
            
            // Add mountain ranges based on elevation (higher = more rugged)
            // Squaring the ruggedness makes lowlands much flatter and highlands much sharper
            const normalizedElev = Math.max(0, (elevation - seaLevel) / (1 - seaLevel));
            const ruggedness = Math.pow(normalizedElev, 2.0); 
            
            let mNoise = this.fbm(nx, ny, 6, 0.5, 2.0, 12.0);
            mNoise = 1.0 - Math.abs(mNoise * 2.0 - 1.0); // Ridged noise for sharp mountain peaks
            
            elevation += landNoise + (mNoise * mNoise) * ruggedness * 0.5;
        }

        this.elevation[index] = Math.max(0, Math.min(1, elevation));
      }
    }
  }`;

const replacementStr = `        structuralElev[index] = elevation;
      }
    }
    
    // Separable Box Blur to heal Voronoi Triple Point 1px Plate Jumps
    const tempElev = new Float32Array(width * height);
    const R = 3; // 7x7 blur filter (R=3) completely hides 1px jumps into perfect gentle slopes without wiping out continents
    const windowSize = R * 2 + 1;
    
    // Horizontal blur (with X wrapping)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let dx = -R; dx <= R; dx++) {
                let nx = x + dx;
                if (nx < 0) nx += width;
                if (nx >= width) nx -= width;
                sum += structuralElev[y * width + nx];
            }
            tempElev[y * width + x] = sum / windowSize;
        }
    }
    
    // Vertical blur (no Y wrapping, edges clamped)
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let sum = 0;
            let count = 0;
            for (let dy = -R; dy <= R; dy++) {
                let ny = y + dy;
                if (ny >= 0 && ny < height) {
                    sum += tempElev[ny * width + x];
                    count++;
                }
            }
            structuralElev[y * width + x] = sum / count; // Reuse array to save memory
        }
    }

    // 4. Flatten ocean floor and add ruggedness to land
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        let elevation = structuralElev[index];
        const nx = x / width;
        const ny = y / height;

        if (elevation < seaLevel) {
            const depth = seaLevel - elevation;
            elevation = seaLevel - Math.pow(depth, 0.7) * 0.3;
        } else {
            // Base land noise to prevent perfectly smooth flatlands/ramps, but keep it subtle for flatter plains
            let landNoise = (this.fbm(nx, ny, 4, 0.5, 2.0, 20.0) - 0.5) * 0.02;
            
            // Add mountain ranges based on elevation (higher = more rugged)
            // Squaring the ruggedness makes lowlands much flatter and highlands much sharper
            const normalizedElev = Math.max(0, (elevation - seaLevel) / (1 - seaLevel));
            const ruggedness = Math.pow(normalizedElev, 2.0); 
            
            let mNoise = this.fbm(nx, ny, 6, 0.5, 2.0, 12.0);
            mNoise = 1.0 - Math.abs(mNoise * 2.0 - 1.0); // Ridged noise for sharp mountain peaks
            
            elevation += landNoise + (mNoise * mNoise) * ruggedness * 0.5;
        }

        this.elevation[index] = Math.max(0, Math.min(1.0, elevation));
      }
    }
  }`;

content = content.replace(
    '    const { width, height, seaLevel } = this.config;\n    \n    for (let y = 0; y < height; y++) {',
    '    const { width, height, seaLevel } = this.config;\n    const structuralElev = new Float32Array(width * height);\n    for (let y = 0; y < height; y++) {'
);

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync('src/lib/planet-generator/generator.ts', content);
    console.log("SUCCESS");
} else {
    console.log("TARGET STRING NOT FOUND");
    // Print first 50 chars of what's there
    let idx = content.indexOf('// 4. Flatten ocean floor');
    if(idx !== -1) console.log(content.substring(idx, idx + 200));
}
