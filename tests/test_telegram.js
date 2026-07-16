const token = '8899139655:AAHDjh_W3gBsRbSixQNFgeqPmbIAGDe-hb8';

async function main() {
  console.log("🔍 Đang kết nối tới Telegram API...");
  try {
    const res = await fetch(`https://api.telegram.org/bot\${token}/getUpdates`);
    if (!res.ok) {
      console.error(`❌ Lỗi kết nối: Status \${res.status}`);
      return;
    }
    const data = await res.json();
    if (!data.ok) {
      console.error("❌ Telegram trả về lỗi:", data);
      return;
    }

    const updates = data.result || [];
    if (updates.length === 0) {
      console.log("\n⚠️ Chưa tìm thấy tin nhắn nào gửi tới Bot.");
      console.log("👉 Vui lòng mở link: https://t.me/Nhadatcompanylog_bot");
      console.log("👉 Nhấn nút [START] hoặc gửi bất kỳ tin nhắn nào cho Bot, sau đó chạy lại script này.");
      return;
    }

    console.log("\n📬 Tìm thấy các cuộc trò chuyện gần đây:");
    const seen = new Set();
    for (const upd of updates) {
      const chat = upd.message?.chat || upd.my_chat_member?.chat;
      if (!chat) continue;
      if (seen.has(chat.id)) continue;
      seen.add(chat.id);
      
      const type = chat.type === 'private' ? 'Cá nhân (User)' : `Nhóm (\${chat.title})`;
      const sender = chat.first_name ? `\${chat.first_name} \${chat.last_name || ''}` : 'Ẩn danh';
      console.log(`- 🆔 Chat ID: \${chat.id} | Loại: \${type} | Người gửi: \${sender}`);
    }

    const firstChatId = Array.from(seen)[0];
    if (firstChatId) {
      console.log(`\n🧪 Gửi thử tin nhắn test tới Chat ID: \${firstChatId}...`);
      const sendRes = await fetch(`https://api.telegram.org/bot\${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: firstChatId,
          text: `<b>🎉 Kết nối thành công!</b>\nĐây là tin nhắn thử nghiệm từ NPD Chatbot.`,
          parse_mode: 'HTML'
        })
      });
      if (sendRes.ok) {
        console.log("🟢 Gửi tin nhắn test THÀNH CÔNG! Hãy kiểm tra điện thoại của bạn.");
      } else {
        console.error("❌ Gửi tin nhắn test THẤT BẠI.");
      }
    }
  } catch (err) {
    console.error("❌ Gặp lỗi kết nối mạng:", err.message);
  }
}

main();
