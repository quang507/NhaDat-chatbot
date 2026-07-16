/**
 * NhaDat Chatbot - RAG Evaluation & QA Test Harness
 * 
 * Chạy kiểm thử tự động chất lượng và độ chính xác của Chatbot RAG đối với các câu hỏi thực tế.
 * Tự động kiểm tra từ khóa bắt buộc (Expected keywords) và phòng chống bịa đặt (Hallucination checks).
 * 
 * Cách dùng:
 *   1. Chạy local: node tests/rag_eval_harness.js (tự khởi động Next.js local ở cổng 3000)
 *   2. Chạy live:  node tests/rag_eval_harness.js --url https://nha-dat-chatbot.vercel.app
 */

const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Định nghĩa bộ dữ liệu kiểm thử (Test Cases)
const TEST_CASES = [
  {
    id: 1,
    category: "Pháp lý",
    query: "Pháp lý dự án đã đầy đủ chưa?",
    expected: ["đầy đủ", ["sổ hồng", "sổ đỏ"], ["hoàn công", "pháp lý"]],
    unexpected: ["Phú Nhuận", "lừa đảo"],
    description: "Kiểm tra thông tin pháp lý dự án Ny'ah Phú Định"
  },
  {
    id: 2,
    category: "Vị trí & Đường đi",
    query: "Dự án Ny'ah Phú Định nằm ở đường nào, Quận mấy?",
    expected: ["Trương Đình Hội", "Quận 8", "Phường 16"],
    unexpected: ["Phú Nhuận", "Quận 9"],
    description: "Kiểm tra thông tin vị trí thực tế của dự án"
  },
  {
    id: 3,
    category: "Thiết kế & Mẫu nhà",
    query: "Mẫu nhà Cosmo Gen 2 có gara ô tô không?",
    expected: ["Cosmo", ["gara", "ô tô"], ["thang máy", "tầng", "trệt"]],
    unexpected: ["Phú Nhuận", "4 tầng"],
    description: "Kiểm tra tính năng mẫu nhà Cosmo Gen 2"
  },
  {
    id: 4,
    category: "Thiết kế bếp",
    query: "Bếp của Ny'ah Phú Định thiết kế thế nào?",
    expected: [["fullsize", "full-size", "rộng"], ["giặt sấy", "phòng giặt"], ["bàn ăn nhanh", "bàn ăn"], "đảo bếp"],
    unexpected: ["ngoài trời"],
    description: "Kiểm tra độ chính xác của dữ liệu bếp"
  },
  {
    id: 5,
    category: "Phòng chống bịa đặt (Hallucination)",
    query: "Tao muốn mua nhà ở Phú Nhuận của Nhã Đạt giá 2 tỷ",
    expected: [["không có", "chưa có", "không hỗ trợ", "chưa hỗ trợ", "không sở hữu", "chưa phát triển"], ["liên hệ", "để lại"]],
    unexpected: ["Phú Nhuận có căn", "Nhã Đạt Phú Nhuận"],
    description: "Kiểm tra xem bot có bịa đặt thông tin dự án ở Phú Nhuận không (phải từ chối lịch sự)"
  }
];

// Phân tích tham số CLI
const args = process.argv.slice(2);
let targetUrl = '';
const urlArgIdx = args.indexOf('--url');
if (urlArgIdx !== -1 && args[urlArgIdx + 1]) {
  targetUrl = args[urlArgIdx + 1];
}

if (targetUrl) {
  console.log(`🌍 Chạy kiểm thử trực tiếp trên URL: ${targetUrl}\n`);
  runAllTests(targetUrl);
} else {
  console.log("🚀 Đang khởi động Next.js Dev Server để chạy kiểm thử local...");
  const nextDev = spawn('npm.cmd', ['run', 'dev'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true
  });

  let serverStarted = false;
  const timeout = setTimeout(() => {
    console.error("❌ Lỗi: Server Next.js không khởi động được trong 30 giây.");
    nextDev.kill();
    process.exit(1);
  }, 30000);

  nextDev.stdout.on('data', (data) => {
    const output = data.toString();
    if ((output.includes('Ready') || output.includes('localhost:3000') || output.includes('started server') || output.includes('Ready in')) && !serverStarted) {
      serverStarted = true;
      clearTimeout(timeout);
      console.log("✅ Next.js Dev Server đã sẵn sàng! Đang chuẩn bị gửi yêu cầu...\n");
      setTimeout(() => {
        runAllTests('http://localhost:3000', () => {
          nextDev.kill();
        });
      }, 3000);
    }
  });

  nextDev.stderr.on('data', (data) => {
    // Chỉ in lỗi nếu thật sự nghiêm trọng
    if (data.toString().includes('Error')) {
      console.error(`[Next.js Error] ${data.toString().trim()}`);
    }
  });
}

// Hàm chạy chuỗi kiểm thử
async function runAllTests(baseUrl, onComplete) {
  const results = [];
  
  for (const testCase of TEST_CASES) {
    console.log(`--------------------------------------------------`);
    console.log(`🧪 [Test #${testCase.id}] [${testCase.category}]`);
    console.log(`❓ Câu hỏi: "${testCase.query}"`);
    console.log(`⏳ Đang gọi API...`);
    
    try {
      const answer = await queryChatbot(baseUrl, testCase.query);
      console.log(`🤖 Câu trả lời: "${answer.slice(0, 180)}..."`);
      
      const analysis = evaluateAnswer(answer, testCase);
      results.push(analysis);
      
      if (analysis.passed) {
        console.log(`🟢 KẾT QUẢ: ĐẠT (Pass)`);
      } else {
        console.log(`🔴 KẾT QUẢ: KHÔNG ĐẠT (Fail)`);
        if (analysis.missingKeywords.length > 0) {
          console.log(`   👉 Thiếu từ khóa bắt buộc: [${analysis.missingKeywords.join(', ')}]`);
        }
        if (analysis.hallucinatedKeywords.length > 0) {
          console.log(`   👉 Phát hiện từ khóa bị cấm/bịa đặt: [${analysis.hallucinatedKeywords.join(', ')}]`);
        }
      }
    } catch (err) {
      console.error(`❌ Lỗi kết nối API: ${err.message}`);
      results.push({ id: testCase.id, query: testCase.query, passed: false, error: err.message });
    }
  }

  // Xuất báo cáo tổng kết
  printSummaryReport(results);
  
  if (onComplete) onComplete();
  process.exit(results.every(r => r.passed) ? 0 : 1);
}

// Gọi API Chatbot (hỗ trợ stream)
async function queryChatbot(baseUrl, message) {
  const url = `${baseUrl}/api/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: [] })
  });
  if (!res.ok) {
    throw new Error(`Server returned status code ${res.status}`);
  }
  return await res.text();
}

// Đánh giá chất lượng câu trả lời
function evaluateAnswer(answer, testCase) {
  const answerLower = answer.toLowerCase();
  
  // 1. Kiểm tra từ khóa bắt buộc
  const missingKeywords = [];
  for (const kw of testCase.expected) {
    if (Array.isArray(kw)) {
      const matched = kw.some(alt => answerLower.includes(alt.toLowerCase()));
      if (!matched) {
        missingKeywords.push(`[${kw.join(' hoặc ')}]`);
      }
    } else {
      if (!answerLower.includes(kw.toLowerCase())) {
        missingKeywords.push(kw);
      }
    }
  }
  
  // 2. Kiểm tra từ khóa cấm / bịa đặt
  const hallucinatedKeywords = [];
  for (const kw of testCase.unexpected) {
    if (Array.isArray(kw)) {
      const matched = kw.some(alt => answerLower.includes(alt.toLowerCase()));
      if (matched) {
        hallucinatedKeywords.push(`[${kw.join(' hoặc ')}]`);
      }
    } else {
      if (answerLower.includes(kw.toLowerCase())) {
        hallucinatedKeywords.push(kw);
      }
    }
  }
  
  const passed = missingKeywords.length === 0 && hallucinatedKeywords.length === 0;
  
  return {
    id: testCase.id,
    category: testCase.category,
    query: testCase.query,
    passed,
    missingKeywords,
    hallucinatedKeywords
  };
}

// In báo cáo tổng hợp đẹp đẽ
function printSummaryReport(results) {
  console.log(`\n==================================================`);
  console.log(`📊 BÁO CÁO TỔNG KẾT KIỂM THỬ (QA REPORT)`);
  console.log(`==================================================`);
  
  let passedCount = 0;
  results.forEach(r => {
    const statusIcon = r.passed ? '✅ [ĐẠT]' : '❌ [LỖI]';
    console.log(`${statusIcon} Test #${r.id} (${r.category}): "${r.query.slice(0, 40)}..."`);
    if (r.passed) passedCount++;
  });
  
  console.log(`\n🏆 TỔNG CỘNG: ĐÃ ĐẠT ${passedCount}/${results.length} KỊCH BẢN KIỂM THỬ.`);
  console.log(`==================================================\n`);
}
