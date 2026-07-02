const fs = require('fs');

async function run() {
    const env = fs.readFileSync('.env.local', 'utf8');
    const keyMatch = env.match(/GEMINI_API_KEY=["']?(.*?)["']?(\n|$)/);
    if (!keyMatch) { console.error("No key"); return; }
    const key = keyMatch[1].trim();

    const qaFile = "C:\\Users\\QuangLêBáDuy\\OneDrive - Nha Dat Co Ltd\\Team Mktg - NPD mktg\\mktg - private\\03_Content\\ChatBot, LiveSlide\\ChatBotData_Upload\\qa-generated.md";
    const content = fs.readFileSync(qaFile, 'utf8');
    
    // Split into blocks
    const blocks = content.split(/\n(?=Q: )/).map(b => b.trim()).filter(b => b);
    console.log(`Found ${blocks.length} QA blocks.`);

    const BATCH_SIZE = 40;
    let finalOutput = "";

    const systemPrompt = `Bạn là chuyên gia về dự án Ny'ah Phú Định. Bạn đang dọn dẹp một danh sách Q&A.
Luật:
1. Đọc kỹ danh sách Q&A bên dưới.
2. LOẠI BỎ (XÓA) các Q&A vô nghĩa, chung chung, thừa thãi, hoặc hỏi đáp lặp đi lặp lại cùng một thông tin (ví dụ: đã có 1 câu về pháp lý 1/500 rồi thì xóa các câu hỏi khác trả lời y chang).
3. NẾU một Q&A có nhiều câu hỏi (Q) chung một câu trả lời (A) và đó là thông tin hữu ích (pháp lý, giá, chính sách, thiết kế) thì GIỮ LẠI nguyên vẹn định dạng Q: ... A: ...
4. CHỈ TRẢ VỀ các Q&A được giữ lại, KHÔNG giải thích thêm. Định dạng bắt buộc:
Q: [Câu hỏi]
A: [Câu trả lời]

(cách nhau 1 dòng trống)`;

    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
        const batch = blocks.slice(i, i + BATCH_SIZE).join('\n\n');
        console.log(`Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(blocks.length / BATCH_SIZE)}...`);
        
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ parts: [{ text: batch }] }],
                    generationConfig: { temperature: 0.2 }
                })
            });
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                finalOutput += text.trim() + "\n\n";
            } else {
                console.error("No text returned", JSON.stringify(data));
                finalOutput += batch + "\n\n"; // fallback to keeping it
            }
        } catch (e) {
            console.error("Error processing batch", e);
            finalOutput += batch + "\n\n";
        }
        
        // Sleep to avoid rate limits
        await new Promise(r => setTimeout(r, 4000));
    }

    fs.writeFileSync(qaFile, finalOutput.trim() + "\n", 'utf8');
    console.log("Done filtering QAs!");
}

run();
