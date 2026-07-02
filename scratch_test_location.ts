import { classifyAmbientIntent } from './lib/intent';
import { resolveSlideVisuals } from './lib/visuals';

const testCases = [
  "vị trí ny'ah phú định ở đâu em",
  "địa chỉ dự án ny'ah phú định là gì",
  "ny'ah phú định nằm ở đâu",
  "chỉ đường đi tới nyah phú định",
  "dự án ny'ah phú định kết nối thế nào",
  "căn hộ ny'ah phú định cách quận 5 bao xa"
];

console.log(String("Query").padEnd(45) + " | " + String("ShouldGen").padEnd(9) + " | " + String("Images").padEnd(3) + " | " + "Layout");
console.log("-".repeat(95));

for (const q of testCases) {
  // @ts-ignore
  const intent = classifyAmbientIntent(q);
  // @ts-ignore
  const visual = resolveSlideVisuals(q, "Vị trí dự án Ny'ah Phú Định", ["Vị trí thuộc An Dương Vương, Quận 8."], "MC đọc kịch bản...", "cosmo_gen_2", "");
  
  console.log(
    q.padEnd(45) + " | " + 
    intent.shouldGenerate.toString().padEnd(9) + " | " + 
    visual.image_urls.length.toString().padEnd(6) + " | " + 
    visual.layout_type
  );
  if (visual.image_urls.length > 0) {
    console.log("  Images: " + visual.image_urls.join(', '));
  }
}
