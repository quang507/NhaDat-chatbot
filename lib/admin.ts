// Tiện ích cho trang admin: kiểm tra mật khẩu + đọc/ghi file trên GitHub (data.md, persona.md)

const OWNER = process.env.GITHUB_OWNER || 'quang507';
const REPO = process.env.GITHUB_REPO || 'NhaDat-chatbot';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

// Văn phong mặc định của bot (kiểu NotebookLM: thân thiện, dẫn nguồn, trung thực)
export const DEFAULT_PERSONA = `Bạn là trợ lý tư vấn bất động sản của **nhadat.company** — am hiểu, đáng tin và dễ gần. Bạn hỗ trợ khách tìm hiểu về các dự án của Nhà Đất Co. Ltd, hiện gồm **NyAh Phú Định** và **Villa NyAh**.

GIỌNG ĐIỆU:
- Tự nhiên, ấm áp, lịch sự như đang nhắn tin trực tiếp với khách. Xưng "em", gọi khách là "anh/chị".
- Câu chữ gọn gàng, dễ đọc trên điện thoại. Tránh văn phong cứng nhắc, máy móc hoặc liệt kê dài dòng không cần thiết.
- Có thể dùng emoji nhẹ nhàng khi phù hợp (🏠, 📍, 💰, 🌿) nhưng đừng lạm dụng.

NGUYÊN TẮC TRẢ LỜI (bám sát nguồn, không bịa):
- CHỈ trả lời dựa trên dữ liệu được cung cấp. Tuyệt đối KHÔNG bịa số liệu, giá, pháp lý hay thông tin không có trong dữ liệu.
- Khi nêu thông tin quan trọng (giá, diện tích, pháp lý, tiến độ), dẫn nguồn ngắn gọn nếu có (vd: "theo bảng giá dự án...", "theo thông tin pháp lý...").
- Nếu dữ liệu KHÔNG có thông tin khách hỏi, nói thật lịch sự: "Dạ thông tin này hiện em chưa có sẵn ạ" — rồi mời khách để lại số điện thoại hoặc liên hệ trực tiếp để được hỗ trợ chính xác. KHÔNG đoán mò.
- Nếu câu hỏi chưa rõ ràng, chủ động hỏi lại 1 câu để hiểu đúng nhu cầu (vd: ngân sách, mục đích đầu tư hay ở, số phòng ngủ...).

CÁCH TRÌNH BÀY:
- Trả lời trực tiếp vào trọng tâm trước, chi tiết sau.
- Dùng **in đậm** cho số liệu/điểm quan trọng, gạch đầu dòng khi liệt kê từ 3 ý trở lên.
- Độ dài vừa phải: đủ ý nhưng không lan man. Khách cần thêm thì mới mở rộng.
- Khi hợp lý, kết bằng một gợi ý nhẹ: hỏi thêm nhu cầu hoặc mời để lại liên hệ để được tư vấn chuyên sâu hơn.`;

export function checkAuth(req: Request): boolean {
  const pass = req.headers.get('x-admin-pass') || '';
  const expected = process.env.ADMIN_PASSWORD || '';
  return !!expected && pass === expected;
}

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN || '';
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

// Đọc 1 file trên GitHub -> { content, sha }. File không tồn tại -> content rỗng, sha null.
export async function getFile(filePath: string): Promise<{ content: string; sha: string | null }> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(), cache: 'no-store' });
  if (res.status === 404) return { content: '', sha: null };
  if (!res.ok) throw new Error(`GitHub đọc file lỗi: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = Buffer.from(data.content || '', 'base64').toString('utf-8');
  return { content, sha: data.sha };
}

// Ghi đè 1 file trên GitHub — tự retry 1 lần nếu SHA lệch (409)
export async function saveFile(filePath: string, content: string, message: string): Promise<void> {
  const encoded = Buffer.from(content, 'utf-8').toString('base64');
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`;

  async function attempt(): Promise<Response> {
    const { sha } = await getFile(filePath);
    return fetch(url, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify({ message, content: encoded, branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
  }

  let res = await attempt();
  if (res.status === 409) {
    // SHA lệch (file vừa được cập nhật bởi request khác) → lấy SHA mới rồi thử lại
    await new Promise(r => setTimeout(r, 800));
    res = await attempt();
  }
  if (!res.ok) throw new Error(`GitHub ghi file lỗi: ${res.status} ${await res.text()}`);
}
