const fs = require('fs');

async function run() {
    const env = fs.readFileSync('.env.local', 'utf8');
    const keyMatch = env.match(/GROQ_API_KEY=["']?(.*?)["']?(\n|$)/);
    if (!keyMatch) { console.error("No GROQ key"); return; }
    const key = keyMatch[1].trim();

    const qaFile = "C:\\Users\\QuangLêBáDuy\\OneDrive - Nha Dat Co Ltd\\Team Mktg - NPD mktg\\mktg - private\\03_Content\\ChatBot, LiveSlide\\ChatBotData_Upload\\qa-generated.md";
    const content = fs.readFileSync(qaFile, 'utf8');
    
    // Split into blocks
    const blocks = content.split(/\n(?=Q: )/).map(b => b.trim()).filter(b => b);
    console.log(`Found ${blocks.length} QA blocks.`);

    // Groq limits can be strict on TPM (Tokens Per Minute), so small batches.
    const BATCH_SIZE = 10;
    let finalOutput = "";

    const systemPrompt = `Bạn là chuyên gia về dự án Ny'ah Phú Định. Đọc danh sách Q&A bên dưới.
LUẬT LỌC (RẤT QUAN TRỌNG):
1. LOẠI BỎ (XÓA) các Q&A vô nghĩa, chung chung, hỏi đáp lặp lại cùng một thông tin (nếu đã có câu 1/500 rồi thì xóa các câu 1/500 tương tự).
2. NẾU 1 nhóm câu hỏi chung 1 câu trả lời (A) mang thông tin giá trị (pháp lý, giá, chính sách), hãy GIỮ LẠI.
3. CHỈ TRẢ VỀ CÁC Q&A ĐƯỢC GIỮ LẠI.
4. BẮT BUỘC giữ đúng định dạng:
Q: [Câu hỏi]
A: [Câu trả lời]

(Không giải thích thêm, không thêm text thừa)`;

    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
        const batch = blocks.slice(i, i + BATCH_SIZE).join('\n\n');
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(blocks.length / BATCH_SIZE)}...`);
        
        let success = false;
        while (!success) {
            try {
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${key}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "llama-3.1-8b-instant",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: batch }
                        ],
                        temperature: 0.2
                    })
                });
                const data = await res.json();
                
                if (data.error) {
                    console.error("Groq API Error:", JSON.stringify(data.error));
                    console.log("Retrying in 20 seconds...");
                    await new Promise(r => setTimeout(r, 20000));
                    continue;
                }

                const text = data.choices?.[0]?.message?.content;
                if (text) {
                    finalOutput += text.trim() + "\n\n";
                    success = true;
                } else {
                    finalOutput += batch + "\n\n";
                    success = true; 
                }
            } catch (e) {
                console.error("Error processing batch", e);
                console.log("Retrying in 20 seconds...");
                await new Promise(r => setTimeout(r, 20000));
            }
        }
        
        // Sleep to respect Groq RPM limits
        await new Promise(r => setTimeout(r, 5000));
    }

    fs.writeFileSync(qaFile, finalOutput.trim() + "\n", 'utf8');
    console.log("Done filtering QAs with Groq!");
}

run();
