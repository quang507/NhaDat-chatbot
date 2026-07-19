// Detect image brightness & auto-adjust text color for readability
// Returns: { isDark: boolean, textColor: string, textShadow: string }

export interface BrightnessAnalysis {
  isDark: boolean;
  luminance: number;
  textColor: string;
  textShadow: string;
}

// Fast brightness detection from image URL using canvas (client-side)
// Returns average luminance (0=black, 1=white)
export function analyzeImageBrightness(url: string): Promise<BrightnessAnalysis> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context failed');

        ctx.drawImage(img, 0, 0, 100, 100);
        const imageData = ctx.getImageData(0, 0, 100, 100).data;

        let totalLuminance = 0;
        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          // Perceived brightness (ITU BT.601)
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          totalLuminance += lum;
        }

        const avgLuminance = totalLuminance / (imageData.length / 4);
        const isDark = avgLuminance < 0.5;

        resolve({
          isDark,
          luminance: avgLuminance,
          textColor: isDark ? '#FFFFFF' : '#161616',
          textShadow: isDark
            ? '0 2px 8px rgba(0,0,0,0.3)'
            : '0 1px 4px rgba(0,0,0,0.2)',
        });
      } catch (e) {
        // Fallback: assume dark, use white text with shadow
        resolve({
          isDark: true,
          luminance: 0,
          textColor: '#FFFFFF',
          textShadow: '0 2px 12px rgba(0,0,0,0.6)',
        });
      }
    };

    img.onerror = () => {
      // Fallback on image load fail
      resolve({
        isDark: true,
        luminance: 0,
        textColor: '#FFFFFF',
        textShadow: '0 2px 12px rgba(0,0,0,0.6)',
      });
    };

    img.src = url;
  });
}

// Server-side: detect from dominant color metadata (if available)
// Can be called at LLM generation time to pick text color
export function analyzeColorForReadability(rgbString: string): BrightnessAnalysis {
  try {
    const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) throw new Error('Invalid rgb format');

    const [, r, g, b] = match.map(Number);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const isDark = lum < 0.5;

    return {
      isDark,
      luminance: lum,
      textColor: isDark ? '#FFFFFF' : '#161616',
      textShadow: isDark
        ? '0 2px 8px rgba(0,0,0,0.3)'
        : '0 1px 4px rgba(0,0,0,0.2)',
    };
  } catch {
    return {
      isDark: true,
      luminance: 0,
      textColor: '#FFFFFF',
      textShadow: '0 2px 12px rgba(0,0,0,0.6)',
    };
  }
}
