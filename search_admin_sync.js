const fs = require('fs');
const path = require('path');

const filePath = 'C:/Users/QuangLêBáDuy/.gemini/antigravity/scratch/NhaDat-chatbot/app/admin/page.tsx';
const content = fs.readFileSync(filePath, 'utf-8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('sync') || line.toLowerCase().includes('đồng bộ')) {
    console.log(`Line ${idx+1}: ${line.trim()}`);
  }
});
