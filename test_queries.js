const questions = [
  "Dự án Ny'ah Phú Định ở đâu?",
  "Căn số 3 giá bao nhiêu?",
  "Có những mẫu nhà nào?",
  "Mẫu Cosmo Gen 2 có gì đặc biệt?",
  "Mẫu Fusion Gen 5 thiết kế thế nào?",
  "Pháp lý dự án ra sao?",
  "Tiến độ thanh toán như thế nào?",
  "Căn số 24 diện tích bao nhiêu?",
  "Chủ đầu tư Nhã Đạt có uy tín không?",
  "Mẫu Opus có mấy tầng?"
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log("=== BẮT ĐẦU TEST 10 CÂU HỎI QUA API CHAT ===");
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\n[Câu ${i+1}] Hỏi: "${q}"`);
    try {
      const res = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history: [] })
      });
      if (res.ok) {
        const text = await res.text();
        console.log(`-> Trả lời: ${text.slice(0, 250)}...`);
      } else {
        console.error(`-> Lỗi API: ${res.status}`);
      }
    } catch (e) {
      console.error(`-> Lỗi kết nối: ${e.message}`);
    }
    await sleep(6500); // Tăng delay lên 6.5s để tránh triệt để Groq 429 TPM
  }

  console.log("\n=== BẮT ĐẦU TEST 10 CÂU HỎI QUA API SLIDE ===");
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\n[Câu ${i+1}] Hỏi: "${q}"`);
    try {
      const res = await fetch('http://localhost:3000/api/slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q })
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`-> Layout: ${data.layout_type}`);
        console.log(`-> Title: ${data.title}`);
        console.log(`-> Points: ${JSON.stringify(data.points)}`);
        console.log(`-> Speech: ${data.speech_text}`);
        console.log(`-> Images: ${JSON.stringify(data.image_urls)}`);
      } else {
        console.error(`-> Lỗi API: ${res.status}`);
      }
    } catch (e) {
      console.error(`-> Lỗi kết nối: ${e.message}`);
    }
    await sleep(6500); // Tăng delay lên 6.5s để tránh triệt để Groq 429 TPM
  }
}

runTests();
