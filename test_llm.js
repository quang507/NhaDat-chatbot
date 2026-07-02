const fs = require('fs');

async function test() {
    const key = fs.readFileSync('.env', 'utf8').match(/GEMINI_API_KEY=(.*)/)[1].trim();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: "Hello" }] }]
        })
    });
    const data = await res.json();
    console.log(data?.candidates?.[0]?.content?.parts?.[0]?.text || data);
}
test();
