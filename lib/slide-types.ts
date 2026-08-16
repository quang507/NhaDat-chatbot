// Kiểu dữ liệu slide DÙNG CHUNG cho: trang /slide, SlideBody, state machine,
// transport (HTTP/WS) và server showroom. Trước đây mỗi nơi tự khai một bản.

export type SlideLayout =
  | 'split_image_right'
  | 'split_image_left'
  | 'full_background'
  | 'dark_minimal'
  | 'text_only';

export type SlideData = {
  layout_type?: SlideLayout;
  title: string;
  points: string[];
  highlight_number?: string;
  speech_text: string;
  /** Câu trả lời LLM bám đúng câu khách hỏi (pha 2 refine). */
  answer_text?: string;
  image_url?: string;
  image_urls?: string[];
  maps_url?: string;
  skip?: boolean;
  /** Server đánh dấu nguồn slide (vd 'static_fast') - client dùng quyết định refine. */
  _source?: string;
};
