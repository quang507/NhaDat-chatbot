// ═══════════════════════════════════════════════════════════════════════════
// CATALOG SLIDE TĨNH — Ny'ah Phú Định
// ═══════════════════════════════════════════════════════════════════════════
// Mỗi entry = 1 slide có sẵn (title/points/speech/ảnh) khớp theo TỪ KHÓA.
// Không gọi AI — trả ngay lập tức, hoạt động kể cả khi Groq/Gemini chết.
//
// CÁCH THÊM SLIDE MỚI (sửa tay):
//   1. Copy 1 entry bất kỳ, đổi keywords + title + points + speech_text + image_urls
//   2. `keywords`: khớp BẤT KỲ từ nào (so khớp cả bản không dấu)
//   3. `allOf`: PHẢI có đủ TẤT CẢ các từ (dùng cho tổ hợp "bếp + signature")
//      — entry có allOf được ưu tiên chạy TRƯỚC các nhánh generic trong route
//   4. Ảnh: đường dẫn bắt đầu /images/... (file phải tồn tại trong public/)
//
// SỐ LIỆU trong points lấy từ lib/units.ts (Data_productlist.xlsx 24/6/2026)
// — KHÔNG tự bịa thêm số.
// ═══════════════════════════════════════════════════════════════════════════

export interface CatalogSlide {
  layout_type?: 'split_image_right' | 'split_image_left' | 'full_background' | 'dark_minimal' | 'text_only';
  title: string;
  points: string[];
  speech_text: string;
  image_urls: string[];
  maps_url?: string;
  forceStatic?: boolean; // true = dùng nguyên text tĩnh, không cho LLM viết lại
}

export interface CatalogEntry {
  keywords: string[];   // khớp bất kỳ (any-of)
  allOf?: string[];     // bắt buộc đủ tất cả (chạy ở phase 'combo', trước nhánh generic)
  slide: CatalogSlide;
}

const IMG = '/images/01_NyAh-PhuDinh';

// Ảnh gốc toàn dự án (phối cảnh tổng)
const ROOT = [`${IMG}/ny'ah phu dinh (1).jpg`, `${IMG}/ny'ah phu dinh (2).jpg`, `${IMG}/ny'ah phu dinh (3).jpg`];

export const STATIC_SLIDES: CatalogEntry[] = [

  // ── 1. TIẾN ĐỘ & BÀN GIAO ──────────────────────────────────────────────
  {
    keywords: ['tiến độ', 'xây tới đâu', 'xây đến đâu', 'công trường', 'thi công', 'đang xây', 'thực tế dự án', 'hình thực tế', 'xây dựng thế nào'],
    slide: {
      title: 'Tiến độ xây dựng T6/2026',
      points: ['Công trường thi công liên tục, cập nhật hàng tháng', 'Hình ảnh thực tế mới nhất tháng 6/2026', 'Khách có thể ghé xem trực tiếp tại dự án'],
      speech_text: 'Đây là hình ảnh công trường thực tế mới nhất tháng 6 năm 2026, dự án đang thi công đúng tiến độ.',
      image_urls: [`${IMG}/tien_do/xay_dung/thang_06-2026-1.jpg`, `${IMG}/tien_do/xay_dung/thang_06-2026-2.jpg`, `${IMG}/tien_do/xay_dung/thang_06-2026-3.jpg`],
    },
  },
  {
    keywords: ['tháng 5', 'tháng năm'],
    allOf: ['tiến độ'],
    slide: {
      title: 'Công trường tháng 5/2026',
      points: ['Hình ảnh thi công thực tế tháng 5/2026', 'Cập nhật đều đặn từng hạng mục', 'Minh bạch tiến độ với khách hàng'],
      speech_text: 'Hình ảnh công trường tháng 5 năm 2026 — từng hạng mục được cập nhật minh bạch.',
      image_urls: [`${IMG}/tien_do/xay_dung/thang_05-2026-2.jpg`, `${IMG}/tien_do/xay_dung/thang_05-2026-3.jpg`, `${IMG}/tien_do/xay_dung/thang_05-2026-4.jpg`],
    },
  },
  {
    keywords: ['bàn giao', 'nhận nhà', 'khi nào xong', 'bao giờ xong', 'khi nào nhận', 'timeline', 'lộ trình'],
    slide: {
      title: 'Lộ trình dự án',
      points: ['Thi công đúng cam kết, cập nhật công khai hàng tháng', 'Lịch bàn giao chi tiết theo từng giai đoạn', 'Liên hệ tư vấn viên để nhận mốc bàn giao chính xác'],
      speech_text: 'Dự án thi công theo đúng cam kết — anh chị liên hệ tư vấn viên để nhận lịch bàn giao chi tiết cho từng căn.',
      image_urls: [`${IMG}/chu_dau_tu/nha_dat/nha-dat_timeline.jpg`],
    },
  },

  // ── 2. CHỦ ĐẦU TƯ NHÃ ĐẠT ──────────────────────────────────────────────
  {
    keywords: ['chủ đầu tư', 'nhã đạt là ai', 'công ty nhã đạt', 'ai xây', 'uy tín không', 'đáng tin'],
    slide: {
      title: 'Chủ đầu tư Nhã Đạt',
      points: ['Chủ đầu tư kiêm đơn vị phát triển trực tiếp dự án', 'Triết lý: sản phẩm thật, giá trị thật', 'Đồng hành cùng khách từ lúc mua đến khi an cư'],
      speech_text: 'Nhã Đạt là chủ đầu tư trực tiếp phát triển dự án, với triết lý sản phẩm thật và đồng hành lâu dài cùng khách hàng.',
      image_urls: [`${IMG}/chu_dau_tu/nha_dat/nha-dat-tieu-chi-1.jpg`, `${IMG}/chu_dau_tu/nha_dat/nha-dat-tieu-chi-3.jpg`],
    },
  },
  {
    keywords: ['dự án đã làm', 'đã xây dự án', 'kinh nghiệm', 'dự án trước', 'từng làm'],
    slide: {
      title: 'Các dự án Nhã Đạt đã thực hiện',
      points: ['Chuỗi dự án nhà phố đã hoàn thành và bàn giao', 'Chất lượng được kiểm chứng qua từng công trình', 'Cư dân thực tế đang an cư tại các dự án'],
      speech_text: 'Nhã Đạt đã hoàn thành và bàn giao nhiều dự án nhà phố — chất lượng được kiểm chứng bằng cư dân thực tế.',
      image_urls: [`${IMG}/chu_dau_tu/nha_dat/nha-dat_du-an-1.jpg`, `${IMG}/chu_dau_tu/nha_dat/nha-dat_du-an-2.jpg`, `${IMG}/chu_dau_tu/nha_dat/nha-dat_du-an-3.jpg`],
    },
  },
  {
    keywords: ['đối tác', 'ngân hàng nào', 'đơn vị thi công', 'nhà thầu'],
    slide: {
      title: 'Đối tác đồng hành',
      points: ['Hệ sinh thái đối tác thi công — vật liệu — tài chính', 'Ngân hàng đối tác hỗ trợ vay mua nhà', 'Chuỗi cung ứng minh bạch, chất lượng kiểm soát'],
      speech_text: 'Dự án có hệ sinh thái đối tác từ thi công, vật liệu đến ngân hàng hỗ trợ vay — tất cả đều minh bạch.',
      image_urls: [`${IMG}/chu_dau_tu/nha_dat/nha-dat_doi-tac.jpg`],
    },
  },

  // ── 3. PHÁP LÝ ─────────────────────────────────────────────────────────
  {
    keywords: ['pháp lý', 'sổ hồng', 'sổ đỏ', 'giấy phép', 'giấy chứng nhận', 'gcn', 'gpxd', 'tranh chấp', 'quy hoạch'],
    slide: {
      layout_type: 'split_image_right',
      title: 'Pháp lý minh bạch',
      points: ['Diện tích đất theo GCN, diện tích sàn theo GPXD từng lô', 'Hồ sơ pháp lý rõ ràng, xem trực tiếp tại văn phòng', 'Chủ đầu tư trực tiếp đứng tên phát triển dự án'],
      speech_text: 'Pháp lý dự án minh bạch — từng lô có số liệu GCN và giấy phép xây dựng rõ ràng, anh chị có thể xem hồ sơ trực tiếp.',
      image_urls: [`${IMG}/phap_ly/logo_nyahphudinh_210531_f-02.png`],
    },
  },

  // ── 4. GIÁ & THANH TOÁN & RỔ HÀNG ──────────────────────────────────────
  {
    keywords: ['giá bán', 'giá bao nhiêu', 'bao nhiêu tiền', 'bảng giá', 'mức giá', 'giá cả', 'ngân sách', 'tầm giá', 'giá từ'],
    slide: {
      title: 'Bảng giá T6/2026',
      points: ['Giá nhà thô từ ~8,98 tỷ đồng (lô Cosmo Gen 2 #42)', 'Gói hoàn thiện Air: cộng thêm khoảng 3% giá trị', 'Liên hệ tư vấn để nhận bảng giá chi tiết từng lô'],
      speech_text: 'Giá nhà thô hiện từ khoảng tám tỷ chín trăm tám mươi mốt triệu — anh chị liên hệ để nhận bảng giá chi tiết từng lô theo rổ hàng mới nhất.',
      image_urls: [`${IMG}/mat_bang/ban-do-phan-lo_can-nha.jpg`],
      forceStatic: true,
    },
  },
  {
    keywords: ['còn căn nào', 'còn hàng', 'rổ hàng', 'còn trống', 'căn nào còn', 'lô nào còn', 'còn bán'],
    slide: {
      title: 'Rổ hàng T6/2026 — 7 lô cuối',
      points: ['Còn 7 lô: #01, #02, #03, #23, #24, #42, #50', 'Đủ dòng: Office, Cosmo, Cashmere, Opus', 'Giá thô từ 8,98 tỷ (lô #42) đến 16,57 tỷ (lô #26 đã bán)'],
      speech_text: 'Rổ hàng tháng 6 còn đúng 7 lô: lô 1, 2, 3, 23, 24, 42 và 50 — đủ các dòng Office, Cosmo, Cashmere và Opus.',
      image_urls: [`${IMG}/mat_bang/ban-do-phan-lo_can-nha.jpg`, `${IMG}/mat_bang/ban-do-phan-lo-dien-tich.jpg`],
      forceStatic: true,
    },
  },
  {
    keywords: ['thanh toán', 'trả góp', 'vay ngân hàng', 'lãi suất', 'trả trước', 'vay được không', 'hỗ trợ vay'],
    slide: {
      title: 'Thanh toán & Vay ngân hàng',
      points: ['Ngân hàng đối tác hỗ trợ vay mua nhà', 'Lịch thanh toán linh hoạt theo tiến độ xây dựng', 'Tư vấn viên hỗ trợ hồ sơ vay trọn gói'],
      speech_text: 'Dự án có ngân hàng đối tác hỗ trợ vay, lịch thanh toán linh hoạt theo tiến độ — tư vấn viên sẽ lo hồ sơ trọn gói cho anh chị.',
      image_urls: [`${IMG}/chu_dau_tu/nha_dat/nha-dat_doi-tac.jpg`],
    },
  },
  {
    keywords: ['gói air', 'nhà thô', 'hoàn thiện', 'bàn giao thô', 'full nội thất'],
    slide: {
      title: 'Gói bàn giao: Thô & Air',
      points: ['Bàn giao nhà thô hoặc gói hoàn thiện Air', 'Gói Air chênh khoảng 3% giá trị căn nhà', 'Hoàn thiện đồng bộ hệ khí tươi AirTop'],
      speech_text: 'Anh chị có thể chọn nhận nhà thô hoặc gói Air hoàn thiện đồng bộ kèm hệ khí tươi, chênh lệch chỉ khoảng ba phần trăm.',
      image_urls: [`${IMG}/chu_dau_tu/nha_dat/nha-dat_cong-nghe-1.jpg`],
    },
  },
  {
    keywords: ['đầu tư', 'sinh lời', 'cho thuê', 'tăng giá', 'giữ tiền', 'dòng tiền'],
    slide: {
      title: 'Sống đẹp hơn chung cư — Sinh lời hơn thổ cư',
      points: ['Nhà phố sở hữu đất — tài sản tăng trưởng dài hạn', 'Cho thuê ở hoặc kinh doanh đều khả thi', 'Compound hoàn chỉnh giúp giữ giá trị bền vững'],
      speech_text: 'Nhà phố có đất luôn là tài sản giữ giá — vừa ở đẹp hơn chung cư, vừa sinh lời tốt hơn thổ cư lẻ.',
      image_urls: [`${IMG}/noi_that/mat-tien-so-sanh.jpg`],
    },
  },
  {
    keywords: ['đặt cọc', 'giữ chỗ', 'booking', 'đặt chỗ'],
    slide: {
      title: 'Đặt chỗ & Giữ căn',
      points: ['Quy trình đặt cọc minh bạch, có hợp đồng rõ ràng', 'Giữ đúng căn — đúng giá đã báo', 'Tư vấn viên hướng dẫn từng bước'],
      speech_text: 'Quy trình đặt cọc minh bạch với hợp đồng rõ ràng — anh chị được giữ đúng căn, đúng giá đã báo.',
      image_urls: [`${IMG}/mat_bang/ban-do-phan-lo_can-nha.jpg`],
    },
  },
  {
    keywords: ['chính sách', 'ưu đãi', 'khuyến mãi', 'chiết khấu', 'quà tặng'],
    slide: {
      title: 'Chính sách bán hàng',
      points: ['Chính sách cập nhật theo từng đợt mở bán', 'Ưu đãi riêng cho khách thiện chí xem nhà thực tế', 'Liên hệ để nhận chính sách mới nhất hôm nay'],
      speech_text: 'Chính sách ưu đãi thay đổi theo từng đợt — anh chị liên hệ ngay để nhận chính sách tốt nhất hôm nay.',
      image_urls: ROOT,
    },
  },

  // ── 5. VỊ TRÍ & KẾT NỐI ────────────────────────────────────────────────
  {
    keywords: ['quận 1', 'về trung tâm', 'lên quận 1', 'đi quận 1', '18 phút'],
    slide: {
      layout_type: 'split_image_right',
      title: '18 phút đến Quận 1',
      points: ['Kết nối thẳng đại lộ Võ Văn Kiệt', 'Chỉ 18 phút lái xe vào trung tâm Quận 1', 'Tránh hoàn toàn kẹt xe giờ cao điểm hướng Đông'],
      speech_text: 'Từ dự án chỉ mất mười tám phút qua đại lộ Võ Văn Kiệt là vào tới trung tâm Quận 1.',
      image_urls: [`${IMG}/vi_tri/duong_di/18_phut_den_quan_1_chi_tiet.jpg`],
      maps_url: 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A',
    },
  },
  {
    keywords: ['quận 8', 'khu này', 'khu vực này', 'phường phú định'],
    slide: {
      layout_type: 'split_image_right',
      title: 'Tọa độ Quận 8',
      points: ['Mặt tiền Trương Đình Hội, Phú Định, Quận 8', 'Khu dân cư hiện hữu, tiện ích quanh vùng đầy đủ', 'Cửa ngõ Tây Nam kết nối Quận 1, 5, 6, 7'],
      speech_text: 'Dự án nằm ngay mặt tiền Trương Đình Hội, Quận 8 — cửa ngõ Tây Nam kết nối nhanh các quận trung tâm.',
      image_urls: [`${IMG}/vi_tri/duong_di/vi_tri.jpg`],
      maps_url: 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A',
    },
  },
  {
    keywords: ['trường học', 'đi học', 'trường cấp', 'trường gần', 'học hành', 'con đi học'],
    slide: {
      title: 'Học hành cho con',
      points: ['Trường các cấp hiện hữu quanh khu Quận 8', 'Kết nối nhanh khu trường quốc tế Nam Sài Gòn', 'Tư vấn viên gửi danh sách trường theo nhu cầu'],
      speech_text: 'Quanh dự án có đủ trường các cấp, và kết nối nhanh sang khu trường quốc tế Nam Sài Gòn.',
      image_urls: [`${IMG}/vi_tri/duong_di/vi_tri.jpg`],
    },
  },
  {
    keywords: ['bệnh viện', 'y tế', 'khám bệnh', 'cấp cứu'],
    slide: {
      title: 'Y tế quanh dự án',
      points: ['Hệ thống y tế Quận 8 và Quận 5 lân cận', 'Di chuyển nhanh về cụm bệnh viện trung tâm', 'An tâm cho gia đình nhiều thế hệ'],
      speech_text: 'Từ dự án di chuyển rất nhanh về cụm bệnh viện Quận 5 và trung tâm — an tâm cho cả gia đình.',
      image_urls: [`${IMG}/vi_tri/duong_di/vi_tri.jpg`],
    },
  },
  {
    keywords: ['chợ', 'siêu thị', 'mua sắm', 'đi chợ', 'tạp hóa'],
    slide: {
      title: 'Mua sắm hằng ngày',
      points: ['Chợ và siêu thị hiện hữu quanh khu dân cư', 'Đi bộ hoặc vài phút xe là tới', 'Nhịp sống tiện lợi ngay cửa nhà'],
      speech_text: 'Chợ, siêu thị đều hiện hữu quanh khu — nhịp sống tiện lợi ngay trước cửa nhà.',
      image_urls: [`${IMG}/vi_tri/duong_di/vi_tri.jpg`],
    },
  },
  {
    keywords: ['sân bay', 'tân sơn nhất', 'ra sân bay'],
    slide: {
      title: 'Kết nối sân bay',
      points: ['Theo Võ Văn Kiệt — đường trên cao về Tân Sơn Nhất', 'Lộ trình tránh các điểm kẹt nội đô', 'Thuận tiện cho gia đình hay công tác'],
      speech_text: 'Đi sân bay Tân Sơn Nhất thuận tiện theo trục Võ Văn Kiệt, tránh được các điểm kẹt nội đô.',
      image_urls: [`${IMG}/vi_tri/duong_di/18_phut_den_quan_1_chi_tiet.jpg`],
    },
  },
  {
    allOf: ['vị trí', 'cosmo'],
    keywords: [],
    slide: {
      layout_type: 'split_image_right',
      title: 'Vị trí các lô Cosmo',
      points: ['Cosmo Gen 2 nằm tại các trục nội khu vuông vắn', 'Lô điển hình 5m mặt tiền, vuông vắn dễ bố trí', 'Xem sơ đồ để chọn hướng hợp mệnh'],
      speech_text: 'Đây là sơ đồ vị trí các lô Cosmo trong dự án — lô vuông vắn với mặt tiền năm mét.',
      image_urls: [`${IMG}/vi_tri/ban_do/cosmo-gen-2_vi-tri.jpg`],
    },
  },
  {
    allOf: ['vị trí', 'fusion'],
    keywords: [],
    slide: {
      layout_type: 'split_image_right',
      title: 'Vị trí các lô Fusion',
      points: ['Fusion Gen 5 trải dọc hai trục chính của dự án', 'Có dãy 2 mặt tiền phía Tây - Tây Nam (lô 27-35)', 'Xem sơ đồ để chọn lô hợp hướng'],
      speech_text: 'Sơ đồ vị trí các lô Fusion — trong đó dãy lô 27 đến 35 là bản hai mặt tiền.',
      image_urls: [`${IMG}/vi_tri/ban_do/fusion-gen-5_vi-tri.jpg`],
    },
  },

  // ── 6. TIỆN ÍCH NỘI KHU ────────────────────────────────────────────────
  {
    keywords: ['sân chơi', 'khu vui chơi', 'trẻ em chơi', 'chỗ chơi cho con'],
    slide: {
      title: 'Sân chơi trẻ em',
      points: ['Sân chơi trẻ em an toàn ngay trong compound', 'Bố mẹ quan sát con từ công viên kế bên', 'Không lo xe cộ — nội khu khép kín'],
      speech_text: 'Trong compound có sân chơi trẻ em an toàn — bố mẹ ngồi công viên kế bên là trông được con.',
      image_urls: [`${IMG}/tien_ich/san_choi_tre_em/tien-ich-5.jpg`, `${IMG}/tien_ich/san_choi_tre_em/tien-ich-6.jpg`],
    },
  },
  {
    keywords: ['sân thể thao', 'cầu lông', 'bóng rổ', 'tập thể dục', 'thể thao', 'vận động'],
    slide: {
      title: 'Sân thể thao nội khu',
      points: ['Sân thể thao đa năng: cầu lông, bóng rổ', 'Không gian vận động cho cả nhà mỗi ngày', 'Ngay trong compound, bước chân là tới'],
      speech_text: 'Nội khu có sân thể thao đa năng chơi được cầu lông, bóng rổ — cả nhà vận động mỗi ngày rất tiện.',
      image_urls: [`${IMG}/tien_ich/san_the_thao/tien-ich-9.jpg`, `${IMG}/tien_ich/san_the_thao/tien-ich-11.jpg`],
    },
  },
  {
    keywords: ['cà phê', 'coffee', 'landmark', 'quán nước'],
    slide: {
      title: 'Landmark Coffee',
      points: ['Quán cà phê Landmark ngay trong dự án', 'Điểm hẹn cư dân — tiếp khách không cần đi xa', 'Không gian mở nhìn ra công viên'],
      speech_text: 'Ngay trong dự án có Landmark Coffee — điểm hẹn của cư dân, tiếp khách khỏi cần đi đâu xa.',
      image_urls: [`${IMG}/tien_ich/landmark_coffee/tien-ich-8.jpg`, `${IMG}/tien_ich/landmark_coffee/enscape_2021-08-16-11-21-00.jpg`],
    },
  },
  {
    keywords: ['công viên', 'cây xanh', 'mảng xanh', 'đi dạo', 'không gian xanh'],
    slide: {
      title: 'Công viên nội khu',
      points: ['Công viên cây xanh trung tâm dự án', 'Đường dạo bộ xanh mát mỗi sáng chiều', 'Lá phổi điều hòa không khí cả compound'],
      speech_text: 'Trung tâm dự án là công viên cây xanh — đường dạo bộ xanh mát, lá phổi của cả khu.',
      image_urls: [`${IMG}/tien_ich/cong_vien/nyah-phu-dinh_cong-vien.png`, `${IMG}/tien_ich/cong_vien/tien-ich-12.jpg`],
    },
  },
  {
    keywords: ['khuôn viên', 'cảnh quan', 'nội khu đẹp', 'landscape', 'đường nội khu'],
    slide: {
      title: 'Cảnh quan nội khu',
      points: ['Cảnh quan thiết kế đồng bộ toàn compound', 'Đường nội khu rộng, vỉa hè trồng cây', 'Mỗi góc đều là không gian sống'],
      speech_text: 'Toàn bộ cảnh quan nội khu được thiết kế đồng bộ — đường rộng, vỉa hè xanh, góc nào cũng đáng sống.',
      image_urls: [`${IMG}/tien_ich/lanscape-khuon-vien-anh-chup/enscape_2021-08-09-13-01-55.jpg`, `${IMG}/tien_ich/lanscape-khuon-vien-anh-chup/enscape_2021-08-11-11-15-00.jpg`, `${IMG}/tien_ich/lanscape-khuon-vien-anh-chup/enscape_2021-08-11-14-11-29.jpg`],
    },
  },
  {
    keywords: ['cổng vào', 'cổng chính', 'lối vào', 'cổng dự án'],
    slide: {
      title: 'Cổng chào dự án',
      points: ['Cổng vào compound bề thế, nhận diện riêng', 'Kiểm soát ra vào — an ninh khép kín', 'Ấn tượng đầu tiên khi về nhà'],
      speech_text: 'Cổng vào compound được thiết kế bề thế với kiểm soát ra vào — ấn tượng đầu tiên mỗi lần về nhà.',
      image_urls: [`${IMG}/tien_ich/cong_vao/tien-ich-1.jpg`, `${IMG}/tien_ich/cong_vao/tien-ich-2.jpg`],
    },
  },
  {
    keywords: ['an ninh', 'bảo vệ', 'camera', 'an toàn không', 'compound', 'khép kín'],
    slide: {
      title: 'Compound an ninh khép kín',
      points: ['Khu compound khép kín, kiểm soát ra vào', 'An ninh tuần tra, camera giám sát', 'Trẻ em chơi trong khu — bố mẹ an tâm'],
      speech_text: 'Đây là compound khép kín có kiểm soát ra vào và camera an ninh — trẻ em chơi trong khu bố mẹ hoàn toàn an tâm.',
      image_urls: [`${IMG}/tien_ich/cong_vao/tien-ich-3.jpg`, `${IMG}/tien_ich/cong_vao/tien-ich-4.jpg`],
    },
  },
  {
    keywords: ['yên tĩnh', 'ồn ào', 'ồn không', 'náo nhiệt'],
    slide: {
      title: 'Không gian sống yên tĩnh',
      points: ['Nội khu tách biệt khỏi trục đường lớn', 'Mật độ thấp — chỉ 50 căn toàn dự án', 'Yên tĩnh nhưng không hẻo lánh'],
      speech_text: 'Nội khu tách biệt khỏi đường lớn với chỉ năm mươi căn — yên tĩnh mà vẫn không hẻo lánh.',
      image_urls: [`${IMG}/tien_ich/lanscape-khuon-vien-anh-chup/enscape_2021-08-09-14-00-56.jpg`],
    },
  },

  // ── 7. MẶT BẰNG & QUY MÔ ───────────────────────────────────────────────
  {
    keywords: ['phân lô', 'sơ đồ lô', 'bản đồ dự án', 'mặt bằng tổng', 'sơ đồ dự án', 'toàn khu'],
    slide: {
      layout_type: 'split_image_right',
      title: 'Sơ đồ phân lô 50 căn',
      points: ['Tổng 50 lô nhà phố trong compound', 'Đủ dòng: Cosmo, Fusion, Opus, Office, Cashmere, Signature', 'Xem sơ đồ để chọn vị trí và hướng phù hợp'],
      speech_text: 'Dự án gồm năm mươi lô nhà phố với đầy đủ các dòng sản phẩm — đây là sơ đồ phân lô tổng thể.',
      image_urls: [`${IMG}/mat_bang/ban-do-phan-lo_can-nha.jpg`, `${IMG}/mat_bang/ban-do-phan-lo_tinh-nang.jpg`],
      forceStatic: true,
    },
  },
  {
    keywords: ['diện tích', 'bao nhiêu mét', 'mét vuông', 'rộng bao nhiêu', 'm2'],
    slide: {
      layout_type: 'split_image_right',
      title: 'Diện tích các lô',
      points: ['Đất từ 42,9 m² đến 91,8 m² tùy lô', 'Sàn sử dụng từ ~175 m² đến 517 m²', 'Mặt tiền 4m — 6,4m theo từng dòng'],
      speech_text: 'Diện tích đất từ bốn mươi ba đến chín mươi hai mét vuông, sàn sử dụng lên tới hơn năm trăm mét vuông tùy lô.',
      image_urls: [`${IMG}/mat_bang/ban-do-phan-lo-dien-tich.jpg`],
      forceStatic: true,
    },
  },
  {
    keywords: ['quy mô', 'bao nhiêu căn', 'tổng số căn', '50 căn', 'mấy căn'],
    slide: {
      title: 'Quy mô 50 căn compound',
      points: ['50 lô nhà phố — mật độ thấp, riêng tư', '6 dòng sản phẩm cho từng nhu cầu sống', 'Compound hoàn chỉnh: công viên, thể thao, cà phê'],
      speech_text: 'Dự án quy mô năm mươi căn nhà phố compound — mật độ thấp với đầy đủ công viên, sân thể thao và cà phê nội khu.',
      image_urls: [`${IMG}/mat_bang/ban-do-phan-lo_can-nha.jpg`, ...ROOT.slice(0, 2)],
    },
  },
  {
    keywords: ['mấy tầng', 'bao nhiêu tầng', 'số tầng', 'cao mấy tầng', 'mấy lầu', 'bao nhiêu lầu'],
    slide: {
      title: 'Cấu trúc 6 tầng',
      points: ['Cosmo/Fusion: trệt + lửng + 3 lầu + sân thượng', 'Opus/Office: 6 tầng bề thế có thang máy', 'Thang máy lên tận sân thượng ở các dòng lớn'],
      speech_text: 'Nhà cao sáu tầng gồm trệt, lửng, ba lầu và sân thượng — có thang máy lên tận nơi.',
      image_urls: [`${IMG}/noi_that/cosmo_gen_2/cosmo-gen-2_mat-cat.jpg`],
      forceStatic: true,
    },
  },
  {
    keywords: ['mặt tiền bao nhiêu', 'mặt tiền rộng', 'ngang bao nhiêu', 'bề ngang'],
    slide: {
      title: 'Mặt tiền 4m — 6,4m',
      points: ['Cosmo: 5m vuông vắn — Fusion: 4m sâu tối ưu', 'Opus/Office mặt tiền đường lớn 4—6,4m', 'Lô góc #14 tới 5,74m, #26 tới 6,4m'],
      speech_text: 'Mặt tiền các lô từ bốn đến sáu mét tư — Cosmo năm mét vuông vắn, lô góc lớn nhất tới sáu mét tư.',
      image_urls: [`${IMG}/noi_that/mat-tien-so-sanh.jpg`],
      forceStatic: true,
    },
  },
  {
    allOf: ['cấu trúc', 'cosmo'],
    keywords: [],
    slide: {
      layout_type: 'split_image_right',
      title: 'Cấu trúc tầng Cosmo Gen 2',
      points: ['Trệt: garage + khách thông tầng', 'Tầng 2 ông bà — tầng 3 bếp — tầng 4 master', 'Tầng 5 phòng con — tầng 6 sân thượng'],
      speech_text: 'Cấu trúc Cosmo Gen 2: trệt để xe và tiếp khách, các tầng trên chia trọn cho ba thế hệ.',
      image_urls: [`${IMG}/mat_bang/cosmo-gen-2_cau-truc-1-2-3.jpg`, `${IMG}/mat_bang/cosmo-gen-2_cau-truc-4-5-6.jpg`],
    },
  },
  {
    allOf: ['cấu trúc', 'fusion'],
    keywords: [],
    slide: {
      layout_type: 'split_image_right',
      title: 'Cấu trúc tầng Fusion Gen 5',
      points: ['4 phòng ngủ cho 3 thế hệ', 'Thiết kế lệch tầng thông thoáng', 'Thang máy + thang biến hóa tiết kiệm diện tích'],
      speech_text: 'Fusion Gen 5 có bốn phòng ngủ cho ba thế hệ với thiết kế lệch tầng độc đáo.',
      image_urls: [`${IMG}/mat_bang/fusion-gen-5_cau-truc-1-2-3.jpg`, `${IMG}/mat_bang/fusion-gen-5_cau-truc-4-5-6.jpg`],
    },
  },
  {
    allOf: ['cấu trúc', 'opus'],
    keywords: [],
    slide: {
      layout_type: 'split_image_right',
      title: 'Cấu trúc tầng Opus',
      points: ['Tầng dưới kinh doanh — tầng trên để ở', 'Thang máy lên tận sân thượng', 'Diện tích sàn tới 351 m²'],
      speech_text: 'Opus chia tầng dưới cho kinh doanh, tầng trên để ở — diện tích sàn lên tới ba trăm năm mươi mét vuông.',
      image_urls: [`${IMG}/mat_bang/opus_cau-truc-1-2-3.jpg`],
    },
  },

  // ── 8. HƯỚNG & PHONG THỦY ──────────────────────────────────────────────
  {
    keywords: ['hướng nhà', 'phong thủy', 'hướng nào', 'hợp tuổi', 'đông tứ', 'tây tứ', 'hợp mệnh'],
    slide: {
      layout_type: 'split_image_right',
      title: 'Hướng nhà & Phong thủy',
      points: ['Đông - Đông Nam: dãy lô 3-14 và 38-42 (Đông Tứ Mệnh)', 'Hướng Bắc: lô 15-26 — Tây/Tây Nam: lô 27-37', 'Hướng Nam: lô 1, 2, 43, 44 (Tây Tứ Mệnh)'],
      speech_text: 'Dự án có đủ các hướng Đông Nam, Bắc, Tây Nam và Nam — anh chị cho biết tuổi, em chọn lô hợp mệnh ngay.',
      image_urls: [`${IMG}/mat_bang/ban-do-phan-lo_can-nha.jpg`],
      forceStatic: true,
    },
  },

  // ── 9. MẪU NHÀ — COSMO GEN 2 ───────────────────────────────────────────
  {
    allOf: ['mặt cắt', 'cosmo'],
    keywords: [],
    slide: {
      layout_type: 'split_image_right',
      title: 'Mặt cắt Cosmo Gen 2',
      points: ['Nhìn xuyên cả 6 tầng công năng', 'Giếng trời xuyên suốt đón sáng', 'Thang máy + thang bộ bố trí tối ưu'],
      speech_text: 'Đây là mặt cắt Cosmo Gen 2 — nhìn rõ sáu tầng công năng với giếng trời xuyên suốt.',
      image_urls: [`${IMG}/noi_that/cosmo_gen_2/cosmo-gen-2_mat-cat.jpg`],
    },
  },
  {
    keywords: ['gạch bông gió', 'bông gió'],
    slide: {
      title: 'Mặt tiền gạch bông gió',
      points: ['Lớp gạch bông gió chắn nắng Tây', 'Gió xuyên phòng — nhà luôn thoáng', 'Ngôn ngữ kiến trúc đặc trưng của dự án'],
      speech_text: 'Mặt tiền dùng gạch bông gió vừa chắn nắng vừa đón gió — ngôn ngữ kiến trúc đặc trưng của dự án.',
      image_urls: [`${IMG}/noi_that/cosmo_gen_2/cosmo-ultra-gach-bong-gio.jpg`, `${IMG}/noi_that/cosmo_gen_2/opus-ultra-gach-bong-gio.jpg`],
    },
  },

  // ── 10. MẪU NHÀ — FUSION GEN 5 ─────────────────────────────────────────
  {
    allOf: ['mặt tiền', 'fusion'],
    keywords: [],
    slide: {
      title: 'Mặt tiền Fusion Gen 5',
      points: ['Mặt tiền 4m thiết kế hiện đại', 'Bản 2 mặt tiền tại dãy lô 27-35', 'Ban công cây xanh từng tầng'],
      speech_text: 'Mặt tiền Fusion Gen 5 hiện đại với ban công xanh — đặc biệt có bản hai mặt tiền ở dãy lô 27 đến 35.',
      image_urls: [`${IMG}/noi_that/fusion_gen_5/fusion-gen-5_mat-tien.jpg`],
    },
  },
  {
    keywords: ['2 mặt tiền', 'hai mặt tiền', '2mt'],
    slide: {
      title: 'Fusion 2 Mặt Tiền',
      points: ['Dãy lô 27-35 sở hữu 2 mặt tiền', 'Hướng Tây - Tây Nam, đón gió chéo', 'Đất 43,3—49,2 m², sàn tới 246 m²'],
      speech_text: 'Dãy lô hai mươi bảy đến ba mươi lăm là bản Fusion hai mặt tiền — thoáng cả trước lẫn sau.',
      image_urls: [`${IMG}/noi_that/fusion_gen_5/fusion-gen-5_mat-tien.jpg`, `${IMG}/vi_tri/ban_do/fusion-gen-5_vi-tri.jpg`],
      forceStatic: true,
    },
  },
  {
    keywords: ['phòng học', 'góc học tập', 'bàn học', 'học bài', 'phòng làm việc riêng'],
    slide: {
      title: 'Phòng học & Góc làm việc',
      points: ['Fusion bố trí phòng học riêng cho con', 'Yên tĩnh, tách khỏi khu sinh hoạt chung', 'Đủ sáng tự nhiên từ giếng trời'],
      speech_text: 'Mẫu Fusion có hẳn phòng học riêng cho con — yên tĩnh và đủ sáng tự nhiên.',
      image_urls: [`${IMG}/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_phong-hoc.png`],
    },
  },
  {
    keywords: ['4 phòng ngủ', 'bốn phòng ngủ', 'mấy phòng ngủ', 'bao nhiêu phòng ngủ'],
    slide: {
      title: '4 phòng ngủ — 3 thế hệ',
      points: ['Fusion Gen 5: 4 phòng ngủ trọn vẹn', 'Ông bà tầng thấp — bố mẹ master — con tầng trên', 'Cosmo: master + 2 phòng con + phòng ông bà'],
      speech_text: 'Mẫu Fusion có bốn phòng ngủ cho ba thế hệ — ông bà ở tầng thấp, bố mẹ phòng master, các con tầng trên.',
      image_urls: [`${IMG}/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_master-bedroom.png`, `${IMG}/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_phong-ngu-con.png`],
      forceStatic: true,
    },
  },

  // ── 11. MẪU NHÀ — OPUS & OFFICE ────────────────────────────────────────
  {
    keywords: ['văn phòng', 'làm văn phòng', 'mở công ty', 'đặt công ty', 'kinh doanh tại nhà', 'vừa ở vừa kinh doanh', 'vừa ở vừa làm'],
    slide: {
      title: 'Nhà phố văn phòng Opus/Office',
      points: ['Tầng trệt + lầu 1 làm văn phòng, mặt tiền trưng bày', 'Gia đình ở các tầng trên — tách lối riêng', 'Office lô 26: sàn tới 517 m² cho doanh nghiệp'],
      speech_text: 'Dòng Opus và Office cho phép vừa ở vừa kinh doanh — tầng dưới làm văn phòng, gia đình ở tầng trên với lối đi riêng.',
      image_urls: [`${IMG}/noi_that/opus/van phong/opus_tang-1.jpg`, `${IMG}/noi_that/opus/van phong/opus_tang-2.jpg`],
    },
  },
  {
    keywords: ['showroom', 'trưng bày', 'cửa hàng', 'mặt bằng kinh doanh'],
    slide: {
      title: 'Mặt bằng Showroom',
      points: ['Trệt Opus mặt tiền đường lớn — lý tưởng showroom', 'Trần cao, kính rộng, khách nhìn thấy từ xa', 'Lô 15-17: mặt tiền 5m đường lớn'],
      speech_text: 'Tầng trệt dòng Opus với mặt tiền đường lớn và kính rộng — vị trí showroom lý tưởng.',
      image_urls: [`${IMG}/noi_that/opus/showroom/enscape_2023-01-16-20-23-36.jpg`, `${IMG}/noi_that/opus/opus_tinh-nang-tang-1.jpg`],
    },
  },
  {
    keywords: ['tiếp đối tác', 'khách công ty', 'đối tác đến'],
    slide: {
      title: 'Không gian tiếp đối tác',
      points: ['Phòng khách Opus tông gỗ lịch lãm', 'Sảnh đón riêng tạo ấn tượng chuyên nghiệp', 'Landmark Coffee nội khu cho buổi hẹn nhanh'],
      speech_text: 'Phòng khách Opus tông gỗ lịch lãm cùng sảnh đón riêng — tiếp đối tác ngay tại nhà rất chuyên nghiệp.',
      image_urls: [`${IMG}/noi_that/opus/opus_tong-quan.jpg`],
    },
  },

  // ── 12. MẪU NHÀ — SIGNATURE BY CODINACHS ───────────────────────────────
  {
    keywords: ['signature', 'codinachs', 'kiến trúc sư nước ngoài', 'kts nước ngoài'],
    slide: {
      title: 'Signature by Codinachs',
      points: ['Hợp tác kiến trúc sư Codinachs — bản thiết kế dấu ấn', 'Chỉ 2 căn duy nhất: lô 43 & 44', 'Mặt tiền góc vát vòng cung độc bản'],
      speech_text: 'Signature by Codinachs là dòng giới hạn chỉ hai căn, thiết kế bởi kiến trúc sư Codinachs với mặt tiền vát cong độc bản.',
      image_urls: [`${IMG}/noi_that/signature_by_codinachs/signature_by_codinachs-phoi-canh-1.jpg`, `${IMG}/noi_that/signature_by_codinachs/signature_by_codinachs-phoi-canh-2.jpg`, `${IMG}/noi_that/signature_by_codinachs/signature_by_codinachs-phoi-canh-3.jpg`],
    },
  },
  {
    allOf: ['phòng khách', 'signature'],
    keywords: [],
    slide: {
      title: 'Phòng khách Signature',
      points: ['Không gian khách đậm chất gallery', 'Đường cong kiến trúc ôm trọn ánh sáng', 'Nội thất đặt riêng theo thiết kế Codinachs'],
      speech_text: 'Phòng khách Signature như một gallery — đường cong kiến trúc ôm trọn ánh sáng tự nhiên.',
      image_urls: [`${IMG}/noi_that/signature_by_codinachs/phong-khach-01.jpg`, `${IMG}/noi_that/signature_by_codinachs/phong-khach-02.jpg`, `${IMG}/noi_that/signature_by_codinachs/phong-khach-03.jpg`],
    },
  },
  {
    allOf: ['bếp', 'signature'],
    keywords: [],
    slide: {
      title: 'Bếp Signature',
      points: ['Bếp mở liền phòng ăn theo phong cách Âu', 'Vật liệu cao cấp tuyển chọn', 'Điểm tụ họp của cả gia đình'],
      speech_text: 'Bếp Signature thiết kế mở kiểu Âu với vật liệu cao cấp — điểm tụ họp ấm cúng của cả nhà.',
      image_urls: [`${IMG}/noi_that/signature_by_codinachs/bep-1.jpg`, `${IMG}/noi_that/signature_by_codinachs/bep-2.jpg`],
    },
  },
  {
    allOf: ['ngủ', 'signature'],
    keywords: [],
    slide: {
      title: 'Phòng ngủ Master Signature',
      points: ['Master suite chuẩn khách sạn boutique', 'Cửa sổ cong đón trọn view nội khu', 'Phòng tắm và thay đồ liền kề'],
      speech_text: 'Phòng master Signature chuẩn boutique hotel với ô cửa cong đón trọn view nội khu.',
      image_urls: [`${IMG}/noi_that/signature_by_codinachs/phong-ngu-master-bedroom-1.jpg`, `${IMG}/noi_that/signature_by_codinachs/phong-ngu-master-bedroom-2.jpg`, `${IMG}/noi_that/signature_by_codinachs/phong-ngu-master-bedroom-3.jpg`],
    },
  },
  {
    allOf: ['sân thượng', 'signature'],
    keywords: [],
    slide: {
      title: 'Sân thượng Signature',
      points: ['Rooftop riêng với đường cong đặc trưng', 'Góc BBQ, tiệc ngoài trời cuối tuần', 'View thoáng toàn compound'],
      speech_text: 'Sân thượng Signature là rooftop riêng với đường cong đặc trưng — chỗ BBQ cuối tuần cực chill.',
      image_urls: [`${IMG}/noi_that/signature_by_codinachs/san-thuong-1.jpg`, `${IMG}/noi_that/signature_by_codinachs/san-thuong-2.jpg`],
    },
  },
  {
    allOf: ['mặt bằng', 'signature'],
    keywords: [],
    slide: {
      layout_type: 'split_image_right',
      title: 'Mặt bằng Signature',
      points: ['Đất 55,8 m² — sàn 296,48 m²', 'Mặt tiền 5m nội khu, góc vát vòng cung', 'Hướng Nam (Tây Tứ Mệnh)'],
      speech_text: 'Mặt bằng Signature: đất năm mươi lăm phẩy tám mét vuông, sàn gần ba trăm mét vuông, hướng Nam.',
      image_urls: [`${IMG}/noi_that/signature_by_codinachs/signature_by_codinachs-mat-bang-1.jpg`, `${IMG}/noi_that/signature_by_codinachs/signature_by_codinachs-mat-bang-2.jpg`],
      forceStatic: true,
    },
  },
  {
    keywords: ['căn 43', 'lô 43', 'căn 44', 'lô 44'],
    slide: {
      title: 'Lô 43 & 44 — Signature v2',
      points: ['Đất 55,8 m² — sàn 296,48 m² mỗi căn', 'Mặt tiền 5m nội khu, góc vát vòng cung', 'Hướng Nam — Tây Tứ Mệnh'],
      speech_text: 'Lô bốn mươi ba và bốn mươi tư là hai căn Signature duy nhất — đất năm mươi lăm phẩy tám mét vuông, hướng Nam.',
      image_urls: [`${IMG}/noi_that/signature_by_codinachs/signature_by_codinachs-mat-tien-43-44.jpg`, `${IMG}/noi_that/signature_by_codinachs/signature_by_codinachs-phoi-canh-1.jpg`],
      forceStatic: true,
    },
  },

  // ── 13. CASHMERE ───────────────────────────────────────────────────────
  {
    keywords: ['cashmere'],
    slide: {
      title: 'Dòng Cashmere',
      points: ['Lô lớn đặc biệt: 65,9 — 73,8 m² đất', 'Sàn sử dụng 294 — 335 m²', 'Lô 23 còn trống — giá thô 10,498 tỷ'],
      speech_text: 'Cashmere là dòng lô lớn đặc biệt với đất tới bảy mươi ba mét vuông — hiện lô hai mươi ba còn trống, giá thô mười tỷ tư trăm chín mươi tám.',
      image_urls: ROOT,
      forceStatic: true,
    },
  },

  // ── 14. THANG & KỸ THUẬT ───────────────────────────────────────────────
  {
    keywords: ['thang xoắn', 'cầu thang xoắn', 'thang nghệ thuật', 'thang đẹp'],
    slide: {
      title: 'Thang xoắn nghệ thuật',
      points: ['Thang xoắn điểm nhấn giữa nhà', 'Tiết kiệm diện tích hơn thang thẳng', 'Kết hợp thang biến hóa đa công năng'],
      speech_text: 'Thang xoắn là điểm nhấn nghệ thuật giữa nhà — vừa đẹp vừa tiết kiệm diện tích.',
      image_urls: [`${IMG}/noi_that/thang_xoan/thang-xoan.jpg`, `${IMG}/noi_that/thang_xoan/1.jpg`, `${IMG}/noi_that/thang_xoan/5v5a3952-png.jpg`],
    },
  },
  {
    keywords: ['thang máy', 'elevator', 'thang kính'],
    slide: {
      title: 'Thang máy trong nhà',
      points: ['Thang máy tiêu chuẩn ở Cosmo, Fusion, Opus', 'Lên thẳng sân thượng — tiện cho ông bà', 'Thang kính lấy sáng, không tối tù'],
      speech_text: 'Nhà có thang máy lên thẳng sân thượng — ông bà lớn tuổi đi lại cực kỳ nhẹ nhàng.',
      image_urls: [`${IMG}/noi_that/cosmo_gen_2/gara/cosmo-gen-2_gara.png`, `${IMG}/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach.png`],
    },
  },
  {
    keywords: ['thang biến hóa'],
    slide: {
      title: 'Thang biến hóa',
      points: ['Thiết kế thang linh hoạt theo nhu cầu', 'Giải phóng diện tích sàn cho không gian sống', 'Đặc trưng của Cosmo & Fusion'],
      speech_text: 'Thang biến hóa giúp giải phóng diện tích sàn — đặc trưng thiết kế của Cosmo và Fusion.',
      image_urls: [`${IMG}/noi_that/thang_xoan/generated-image-march-25-2026-10_18am.jpg`],
    },
  },
  {
    keywords: ['airtop', 'khí tươi', 'thông gió', 'không khí trong nhà', 'ngộp không'],
    slide: {
      title: 'Hệ khí tươi AirTop',
      points: ['AirTop cấp khí tươi liên tục cho cả nhà', 'Nhà phố kín vẫn thoáng như có gió trời', 'Trang bị chuẩn ở các dòng chính'],
      speech_text: 'Hệ AirTop cấp khí tươi liên tục — nhà phố đóng kín cửa vẫn thoáng như có gió trời.',
      image_urls: [`${IMG}/chu_dau_tu/nha_dat/nha-dat_cong-nghe-1.jpg`, `${IMG}/chu_dau_tu/nha_dat/nha-dat_cong-nghe-2.jpg`],
    },
  },
  {
    keywords: ['smart home', 'nhà thông minh', 'công nghệ nhà'],
    slide: {
      title: 'Công nghệ trong nhà',
      points: ['Hạ tầng chờ sẵn cho smart home', 'Hệ kỹ thuật âm tường gọn gàng', 'Nâng cấp theo nhu cầu từng gia đình'],
      speech_text: 'Nhà có hạ tầng chờ sẵn cho smart home — anh chị nâng cấp theo nhu cầu rất dễ.',
      image_urls: [`${IMG}/chu_dau_tu/nha_dat/nha-dat_cong-nghe-3.jpg`],
    },
  },
  {
    keywords: ['giếng trời', 'ánh sáng tự nhiên', 'đón sáng', 'nhà sáng không', 'tối không'],
    slide: {
      title: 'Giếng trời & Ánh sáng',
      points: ['Giếng trời xuyên suốt các tầng', 'Phòng nào cũng có ánh sáng tự nhiên', 'Kết hợp gạch bông gió đón gió chéo'],
      speech_text: 'Giếng trời xuyên suốt giúp phòng nào cũng có ánh sáng tự nhiên — nhà phố mà không hề tối.',
      image_urls: [`${IMG}/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach.png`, `${IMG}/noi_that/cosmo_gen_2/cosmo-gen-2_mat-cat.jpg`],
    },
  },

  // ── 15. KHÔNG GIAN SỐNG & GIA ĐÌNH ────────────────────────────────────
  {
    keywords: ['ba thế hệ', '3 thế hệ', 'nhiều thế hệ', 'đa thế hệ', 'ở chung ông bà', 'sống chung'],
    slide: {
      title: 'Nhà cho 3 thế hệ',
      points: ['Tầng 2 dành riêng ông bà — gần bếp, ít leo cầu thang', 'Master bố mẹ và phòng con tách tầng riêng tư', 'Thang máy kết nối — cả nhà gần nhau mà vẫn riêng'],
      speech_text: 'Nhà thiết kế cho ba thế hệ: ông bà tầng thấp gần bếp, bố mẹ và các con mỗi người một tầng riêng tư.',
      image_urls: [`${IMG}/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_tang-2-phong-ngu-ong-ba-1.png`, `${IMG}/noi_that/fusion_gen_5/tang-2/fusion-gen-5_tang-2.png`],
    },
  },
  {
    keywords: ['con nhỏ', 'trẻ nhỏ', 'em bé', 'gia đình trẻ', 'mới cưới', 'vợ chồng trẻ'],
    slide: {
      title: 'Tổ ấm cho gia đình trẻ',
      points: ['Phòng con thiết kế sẵn, đón sáng giếng trời', 'Sân chơi trẻ em ngay trong compound', 'An ninh khép kín — con chạy chơi thoải mái'],
      speech_text: 'Với gia đình trẻ, phòng con đón sáng tự nhiên và sân chơi ngay trong khu — bé chạy chơi bố mẹ vẫn an tâm.',
      image_urls: [`${IMG}/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_phong-ngu-con-2.png`, `${IMG}/tien_ich/san_choi_tre_em/tien-ich-5.jpg`],
    },
  },
  {
    keywords: ['về già', 'nghỉ hưu', 'dưỡng già', 'lớn tuổi', 'người già'],
    slide: {
      title: 'An dưỡng tuổi vàng',
      points: ['Phòng ông bà tầng thấp + thang máy tận nơi', 'Công viên đi dạo mỗi sáng ngay dưới nhà', 'Con cháu quây quần trong cùng mái ấm'],
      speech_text: 'Ông bà có phòng riêng tầng thấp với thang máy tận nơi, sáng xuống công viên đi dạo — tuổi vàng an nhiên bên con cháu.',
      image_urls: [`${IMG}/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_tang-2-phong-ngu-ong-ba-1.png`, `${IMG}/tien_ich/cong_vien/nyah-phu-dinh_cong-vien.png`],
    },
  },
  {
    keywords: ['làm việc tại nhà', 'wfh', 'work from home', 'freelance'],
    slide: {
      title: 'Làm việc tại nhà',
      points: ['Fusion có phòng học/làm việc riêng', 'Opus tách hẳn tầng văn phòng', 'Yên tĩnh compound — họp online thoải mái'],
      speech_text: 'Làm việc tại nhà rất thoải mái: Fusion có phòng riêng, Opus tách hẳn tầng văn phòng, compound lại yên tĩnh.',
      image_urls: [`${IMG}/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_phong-hoc.png`, `${IMG}/noi_that/opus/van phong/opus_tang-1.jpg`],
    },
  },
  {
    keywords: ['sân thượng', 'rooftop', 'bbq', 'nướng', 'tiệc ngoài trời', 'trồng cây', 'trồng rau'],
    slide: {
      title: 'Sân thượng đa năng',
      points: ['Sân thượng thoáng — thang máy lên tận nơi', 'Góc BBQ, tiệc gia đình cuối tuần', 'Trồng cây, phơi đồ, vườn rau nhỏ'],
      speech_text: 'Sân thượng có thang máy lên tận nơi — cuối tuần BBQ, ngày thường trồng rau phơi đồ đều tiện.',
      image_urls: [`${IMG}/noi_that/signature_by_codinachs/san-thuong-1.jpg`, `${IMG}/noi_that/signature_by_codinachs/san-thuong-3.jpg`],
    },
  },
  {
    keywords: ['ban công', 'logia', 'lô gia'],
    slide: {
      title: 'Ban công xanh',
      points: ['Ban công từng tầng đón gió tự nhiên', 'Chỗ đặt bồn cây — mảng xanh riêng mỗi phòng', 'Kết nối không gian trong nhà với bên ngoài'],
      speech_text: 'Mỗi tầng đều có ban công đón gió — đặt vài bồn cây là có mảng xanh riêng cho từng phòng.',
      image_urls: [`${IMG}/noi_that/fusion_gen_5/fusion-gen-5_mat-tien.jpg`],
    },
  },
  {
    keywords: ['hàng xóm', 'cộng đồng', 'cư dân', 'láng giềng'],
    slide: {
      title: 'Cộng đồng cư dân văn minh',
      points: ['50 gia đình — cộng đồng nhỏ, thân thiện', 'Không gian chung: công viên, cà phê, thể thao', 'Chuẩn sống đồng đều trong compound'],
      speech_text: 'Chỉ năm mươi gia đình trong compound — cộng đồng nhỏ, văn minh và thân thiện.',
      image_urls: [`${IMG}/tien_ich/lanscape-khuon-vien-anh-chup/enscape_2021-08-11-12-23-26.jpg`],
    },
  },
  {
    keywords: ['nuôi chó', 'nuôi mèo', 'thú cưng', 'pet'],
    slide: {
      title: 'Sống cùng thú cưng',
      points: ['Nhà riêng — nuôi thú cưng thoải mái', 'Công viên nội khu dắt đi dạo mỗi ngày', 'Không vướng quy định như chung cư'],
      speech_text: 'Nhà phố riêng nên nuôi thú cưng thoải mái, có công viên dắt đi dạo — không vướng quy định như chung cư.',
      image_urls: [`${IMG}/tien_ich/cong_vien/nyah-phu-dinh_cong-vien.png`],
    },
  },

  // ── 16. NỘI THẤT & VẬT LIỆU ────────────────────────────────────────────
  {
    keywords: ['vật liệu', 'đá thạch anh', 'gỗ tự nhiên', 'thiết bị vệ sinh', 'thương hiệu gì'],
    slide: {
      title: 'Vật liệu & Hoàn thiện',
      points: ['Mặt bếp đá thạch anh, tủ gỗ cao cấp', 'Thiết bị vệ sinh thương hiệu tuyển chọn', 'Chi tiết hoàn thiện chuẩn theo gói bàn giao'],
      speech_text: 'Vật liệu hoàn thiện đều tuyển chọn cao cấp — từ mặt bếp đá thạch anh đến thiết bị vệ sinh chính hãng.',
      image_urls: [`${IMG}/noi_that/cosmo_gen_2/bep/cosmo-gen-2_bep.png`, `${IMG}/noi_that/cosmo_gen_2/wc/cosmo-gen-2_wc.png`],
    },
  },
  {
    keywords: ['bếp đảo', 'đảo bếp', 'quầy bar'],
    slide: {
      title: 'Bếp đảo & Quầy bar',
      points: ['Bếp đảo đa năng như quầy bar tại gia', 'Nấu nướng — trò chuyện — không quay lưng với khách', 'View thiên nhiên ngay từ phòng ăn'],
      speech_text: 'Bếp đảo đa năng như quầy bar — vừa nấu vừa trò chuyện, không còn quay lưng với cả nhà.',
      image_urls: [`${IMG}/noi_that/cosmo_gen_2/bep/cosmo-gen-2_bep.png`, `${IMG}/noi_that/fusion_gen_5/bep/fusion-gen-5_tang-3.png`],
    },
  },
  {
    keywords: ['giặt sấy', 'máy giặt', 'phơi đồ'],
    slide: {
      title: 'Khu giặt sấy tiện lợi',
      points: ['Giặt sấy bố trí ngay khu bếp — gọn việc nhà', 'Sân thượng phơi đồ nắng gió tự nhiên', 'Động tuyến việc nhà tối ưu từng bước chân'],
      speech_text: 'Khu giặt sấy đặt ngay tầng bếp, phơi đồ trên sân thượng — động tuyến việc nhà cực gọn.',
      image_urls: [`${IMG}/noi_that/cosmo_gen_2/bep/cosmo-gen-2_bep.png`],
    },
  },
  {
    keywords: ['xe bán tải', 'suv', '7 chỗ', 'xe lớn', 'để được mấy xe'],
    slide: {
      title: 'Garage cho xe lớn',
      points: ['Garage đỗ vừa bán tải, SUV 7 chỗ', 'Thêm chỗ xe máy cho cả nhà', 'Cửa cuốn tự động, thông gió tốt'],
      speech_text: 'Garage trong nhà đỗ vừa cả xe bán tải lẫn SUV bảy chỗ, kèm chỗ để xe máy cho cả nhà.',
      image_urls: [`${IMG}/noi_that/fusion_gen_5/gara/fusion-gen-5_gara.png`, `${IMG}/noi_that/cosmo_gen_2/gara/cosmo-gen-2_gara.png`],
    },
  },
  {
    keywords: ['khách đỗ xe', 'khách để xe', 'chỗ đậu xe khách', 'bãi xe'],
    slide: {
      title: 'Đỗ xe cho khách',
      points: ['Đường nội khu rộng — khách đỗ thuận tiện', 'Mỗi nhà đều có garage riêng trong nhà', 'Không cảnh tranh chỗ đậu như chung cư'],
      speech_text: 'Đường nội khu rộng nên khách tới chơi đỗ xe thoải mái — nhà nào cũng đã có garage riêng.',
      image_urls: [`${IMG}/tien_ich/lanscape-khuon-vien-anh-chup/enscape_2021-08-09-16-04-21.jpg`],
    },
  },

  // ── 17. SO SÁNH & TƯ VẤN CHỌN MẪU ─────────────────────────────────────
  {
    keywords: ['so sánh', 'khác nhau', 'cosmo hay fusion', 'nên chọn mẫu', 'mẫu nào phù hợp', 'tư vấn mẫu', 'chọn căn nào'],
    slide: {
      title: 'Chọn mẫu nào phù hợp?',
      points: ['Cosmo 5m vuông vắn — master rộng, ở sang', 'Fusion 4PN — tối ưu cho 3 thế hệ đông người', 'Opus/Office — vừa ở vừa kinh doanh, Signature — độc bản'],
      speech_text: 'Cosmo hợp gia đình thích rộng sang, Fusion tối ưu cho ba thế hệ, còn Opus dành cho anh chị vừa ở vừa kinh doanh.',
      image_urls: [`${IMG}/noi_that/mat-tien-so-sanh.jpg`, `${IMG}/mat_bang/ban-do-phan-lo_tinh-nang.jpg`],
      forceStatic: true,
    },
  },
  {
    keywords: ['chung cư', 'căn hộ chung cư', 'so với chung cư', 'hơn chung cư'],
    slide: {
      title: 'Nhà phố vs Chung cư',
      points: ['Sở hữu đất lâu dài — không lo hết hạn', 'Không phí quản lý cao, không chờ thang máy chung', 'Compound vẫn có tiện ích như chung cư cao cấp'],
      speech_text: 'Khác chung cư, ở đây anh chị sở hữu đất lâu dài mà compound vẫn đủ tiện ích — đúng nghĩa sống đẹp hơn chung cư.',
      image_urls: [`${IMG}/noi_that/mat-tien-so-sanh.jpg`],
    },
  },
  {
    keywords: ['thổ cư', 'nhà trong hẻm', 'mua đất xây', 'so với thổ cư'],
    slide: {
      title: 'Nhà phố compound vs Thổ cư lẻ',
      points: ['Pháp lý sạch — không rủi ro như đất lẻ', 'Hạ tầng, an ninh, tiện ích đồng bộ sẵn', 'Giá trị tăng theo cả khu, thanh khoản tốt hơn'],
      speech_text: 'So với thổ cư lẻ, ở đây pháp lý sạch, hạ tầng đồng bộ và giá trị tăng theo cả khu — sinh lời bền hơn.',
      image_urls: ROOT,
    },
  },

  // ── 18. XEM NHÀ & LIÊN HỆ ──────────────────────────────────────────────
  {
    keywords: ['nhà mẫu', 'xem nhà', 'tham quan', 'ghé xem', 'hẹn xem', 'đi coi nhà', 'coi thực tế'],
    slide: {
      title: 'Mời anh chị xem nhà thực tế',
      points: ['Tham quan nhà hoàn thiện và công trường thật', 'Đặt lịch trước — sale đón tận nơi', 'Xem tận mắt trước khi quyết định'],
      speech_text: 'Mời anh chị đặt lịch xem nhà thực tế — thấy tận mắt công trình rồi hãy quyết định.',
      image_urls: [...ROOT.slice(0, 2), `${IMG}/tien_do/xay_dung/thang_06-2026-1.jpg`],
    },
  },
  {
    keywords: ['liên hệ', 'hotline', 'số điện thoại', 'gặp sale', 'tư vấn viên'],
    slide: {
      title: 'Liên hệ Nhã Đạt',
      points: ['Đội ngũ tư vấn Nhã Đạt hỗ trợ trực tiếp', 'Nhận bảng giá & chính sách mới nhất', 'Đặt lịch tham quan miễn phí'],
      speech_text: 'Anh chị để lại thông tin, đội ngũ Nhã Đạt sẽ gửi bảng giá mới nhất và đặt lịch tham quan miễn phí.',
      image_urls: [`${IMG}/chu_dau_tu/nha_dat/logo_nha-dat-1.png`],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MATCHER — chấm điểm theo tổng độ dài từ khóa khớp; entry allOf ưu tiên (combo).
// phase 'combo'  : chỉ xét entry có allOf (tổ hợp cụ thể) — chạy TRƯỚC nhánh generic
// phase 'general': entry thường (any-of keywords) — chạy SAU nhánh generic của route
// ─────────────────────────────────────────────────────────────────────────────
const rmD = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

export function matchStaticSlide(message: string, phase: 'combo' | 'general'): CatalogSlide | null {
  const msg = (message || '').toLowerCase();
  const noD = rmD(msg);
  const hit = (kw: string) => msg.includes(kw) || noD.includes(rmD(kw));

  let best: { score: number; slide: CatalogSlide } | null = null;
  for (const entry of STATIC_SLIDES) {
    const isCombo = !!(entry.allOf && entry.allOf.length);
    if (phase === 'combo' ? !isCombo : isCombo) continue;

    let score = 0;
    if (isCombo) {
      if (!entry.allOf!.every(hit)) continue;
      score += entry.allOf!.reduce((s, k) => s + k.length, 0) * 2;
      score += entry.keywords.filter(hit).reduce((s, k) => s + k.length, 0);
    } else {
      const matched = entry.keywords.filter(hit);
      if (matched.length === 0) continue;
      score = matched.reduce((s, k) => s + k.length, 0);
    }
    if (!best || score > best.score) best = { score, slide: entry.slide };
  }
  return best ? { ...best.slide, image_urls: [...best.slide.image_urls] } : null;
}
