const fs = require('fs');
const path = require('path');

let GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (fs.existsSync(path.join(__dirname, '.env.local'))) {
  const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
  const matchGemini = envContent.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
  if (matchGemini) {
    GEMINI_API_KEY = matchGemini[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const CHUNK = 500;
const OVERLAP = 50;

function chunkText(raw) {
    const text = raw.replace(/\r\n/g, '\n').trim();
    if (!text) return [];
    const blocks = text.split(/\n(?=#{1,6}\s)|\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const chunks = [];
    let cur = '';
    for (const b of blocks) {
      const isTable = b.startsWith('|');
      if (isTable) {
        if (cur) { chunks.push(cur); cur = ''; }
        if (b.length > CHUNK) {
          for (let i = 0; i < b.length; i += CHUNK - OVERLAP) { chunks.push(b.slice(i, i + CHUNK)); }
        } else { chunks.push(b); }
        continue;
      }
      if (b.length > CHUNK) {
        if (cur) { chunks.push(cur); cur = ''; }
        for (let i = 0; i < b.length; i += CHUNK - OVERLAP) { chunks.push(b.slice(i, i + CHUNK)); }
        continue;
      }
      if ((cur + '\n\n' + b).length > CHUNK) {
        if (cur) chunks.push(cur);
        cur = b;
      } else {
        cur = cur ? cur + '\n\n' + b : b;
      }
    }
    if (cur) chunks.push(cur);
    return chunks;
}

function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => +(x / n).toFixed(5));
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function embedBatch(texts, taskType) {
  if (texts.length === 0) return [];
  const out = [];
  const BATCH_SIZE = 100;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    if (i > 0) {
      // TIER 1 KEY allows 1500 RPM. We can send 100 chunks every 2 seconds safely!
      console.log(`[Gemini] Waiting 2s for Tier 1 quota...`);
      await sleep(2000); 
    }
    const chunk = texts.slice(i, i + BATCH_SIZE);
    console.log(`[Gemini] Embedding chunks ${i} to ${Math.min(i + BATCH_SIZE, texts.length)}... (Total: ${texts.length})`);
    
    let attempts = 0;
    while(attempts < 3) {
      try {
        const res = await fetch(`${EMBED_BASE}/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: chunk.map(text => ({
              model: `models/${EMBED_MODEL}`,
              content: { parts: [{ text }] },
              taskType
            })),
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const embeddings = data.embeddings || [];
        for (const emb of embeddings) {
          out.push(normalize(emb.values || []));
        }
        break; 
      } catch (e) {
        attempts++;
        console.error(`Attempt ${attempts} failed:`, e.message);
        if (attempts >= 3) throw e;
        await sleep(5000);
      }
    }
  }
  return out;
}

async function getFileSha(repoPath, branch, githubToken) {
    const res = await fetch(`https://api.github.com/repos/quang507/NhaDat-chatbot/contents/${repoPath}?ref=${branch}`, {
        headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'NodeJS'
        }
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.sha;
}

const { execSync } = require('child_process');

async function getIndexFile() {
    try {
        console.log("Fetching chatbot-logs branch from remote...");
        execSync('git fetch origin chatbot-logs');
        console.log("Extracting index.json from chatbot-logs branch...");
        execSync('git show origin/chatbot-logs:index.json > old_index.json');
        const content = fs.readFileSync('old_index.json', 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        console.error("Could not fetch old index.json via git:", e.message);
        return null;
    }
}

// Removed saveFileToGithub

async function run() {
    let GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    if (fs.existsSync(path.join(__dirname, '.env.local'))) {
        const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
        const match = envContent.match(/^GITHUB_TOKEN\s*=\s*(.+)$/m);
        if (match) GITHUB_TOKEN = match[1].trim().replace(/^['"]|['"]$/g, '');
    }
    
    // 1. Get Old Index to reuse vectors
    console.log("Fetching old index.json from GitHub to reuse vectors...");
    const oldIndex = await getIndexFile();
    const vectorCache = new Map();
    if (oldIndex && oldIndex.chunks) {
        oldIndex.chunks.forEach(c => {
            if (c.text && c.vec) {
                // Use hash or just string as key. String is fine for ~7000 chunks.
                vectorCache.set(c.text, c.vec);
            }
        });
        console.log(`Loaded ${vectorCache.size} unique vectors from old index.`);
    }
    
    // 2. Read new data
    const dataText = fs.readFileSync(path.join(__dirname, 'data.md'), 'utf-8');
    console.log("Read data.md, chunking...");
    const texts = chunkText(dataText);
    console.log(`Generated ${texts.length} chunks.`);
    
    // 3. Separate reused vs new
    const newTexts = [];
    const newTextsIndices = [];
    const finalVecs = new Array(texts.length);
    
    let reusedCount = 0;
    for (let i = 0; i < texts.length; i++) {
        if (vectorCache.has(texts[i])) {
            finalVecs[i] = vectorCache.get(texts[i]);
            reusedCount++;
        } else {
            newTexts.push(texts[i]);
            newTextsIndices.push(i);
        }
    }
    
    console.log(`Reused ${reusedCount} vectors. Need to fetch ${newTexts.length} new vectors via API.`);
    
    // 4. Fetch new vectors
    if (newTexts.length > 0) {
        const newVecs = await embedBatch(newTexts, 'RETRIEVAL_DOCUMENT');
        for (let i = 0; i < newTexts.length; i++) {
            finalVecs[newTextsIndices[i]] = newVecs[i];
        }
    }
    
    // 5. Build final Index
    let currentFile = '';
    const rawChunks = texts.map((text, i) => {
        const m = text.match(/##\s*📄\s*\[([^\]]*)\]\s*➡\s*([^\n]+)/);
        if (m) currentFile = `${m[1].trim()}/${m[2].trim()}`;
        return { text, vec: finalVecs[i] || [], file: currentFile || undefined };
    });
    
    const index = {
        chunks: rawChunks,
        builtAt: new Date().toISOString(),
    };
    
    console.log("Saving index.json locally...");
    fs.writeFileSync('index.json', JSON.stringify(index, null, 2));
    console.log("Done! You can now commit and push index.json using git.");
}

run();
