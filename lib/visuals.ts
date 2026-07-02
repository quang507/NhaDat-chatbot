export interface VisualAsset {
  url: string;
  tags: string[];
  models?: ('cosmo_gen_2' | 'fusion_gen_5' | 'opus' | 'signature' | 'all')[];
}

import { IMAGE_CATALOG } from './visuals_catalog';

export function resolveSlideVisuals(
  message: string,
  title: string,
  points: string[],
  speech_text: string,
  model: 'cosmo_gen_2' | 'fusion_gen_5' | 'opus' | 'signature',
  highlight_number?: string
): { image_urls: string[]; layout_type: string; maps_url?: string } {
  
  const textToSearch = (message + ' ' + title + ' ' + (points || []).join(' ') + ' ' + speech_text).toLowerCase();
  
  // 0. Competitor Exclusion Rule
  // Nếu câu hỏi nhắc đến đối thủ nhưng không nhắc dự án mình -> Không hiện hình ảnh (tránh hiện nhầm ảnh vị trí của mình)
  const competitors = ['eco retreat', 'ecoretreat', 'vinhome', 'khang điền', 'nam long', 'đối thủ', 'dự án khác', 'bên kia'];
  const hasCompetitor = competitors.some(c => textToSearch.includes(c));
  const hasOurProject = [
    'nyah', "ny'ah", 'phú định', 'cosmo', 'fusion', 'opus', 'căn',
    'bên mình', 'bên em', 'dự án mình', 'nhà mình', 'ở đây', 'tại đây', 'bên này'
  ].some(p => textToSearch.includes(p));
  
  if (hasCompetitor && !hasOurProject) {
    return { image_urls: [], layout_type: 'text_only' };
  }

  // 1. Tag-based Scoring Engine
  let matches = IMAGE_CATALOG.map(asset => {
    let score = 0;
    // Check if the asset matches the model or is universal
    if (asset.models?.includes('all') || asset.models?.includes(model)) {
      asset.tags.forEach(tag => {
        if (textToSearch.includes(tag)) {
          // Longer tags carry more weight (e.g., 'phòng ngủ master' is 3 words = 3 points, 'bếp' = 1 point)
          score += tag.split(' ').length;
        }
      });
    }
    return { ...asset, score };
  });

  // Keep only those with score > 0 and sort descending
  matches = matches.filter(m => m.score > 0).sort((a, b) => b.score - a.score);

  let image_urls: string[] = [];
  
  if (matches.length > 0) {
    // Pick the top 1 to 3 distinct images based on score
    const topScore = matches[0].score;
    // Get images that are within 50% of the top score to avoid mixing irrelevant images
    const threshold = topScore * 0.5;
    image_urls = matches.filter(m => m.score >= threshold).slice(0, 3).map(m => m.url);
  } else {
    // 2. Fallback: Default images for the model if no tags matched
    if (model === 'cosmo_gen_2' || model === 'signature') {
      image_urls = [
        '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png',
        '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_bep.png',
        '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_ngu-master.png'
      ];
    } else if (model === 'fusion_gen_5') {
      image_urls = [
        '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-khach.png',
        '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_master-bedroom.png',
        '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-hoc.png'
      ];
    } else {
      image_urls = [
        '/images/01_NyAh-PhuDinh/noi_that/opus/opus_sanh-master.jpg',
        '/images/01_NyAh-PhuDinh/noi_that/opus/opus_bep.jpg',
        '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-master.jpg'
      ];
    }
  }

  // 3. Layout Selection Logic
  let layout_type = 'split_image_right';
  let maps_url: string | undefined = undefined;

  const isMapImg = image_urls.some((u: string) => u.includes('vi_tri') || u.includes('18_phut'));
  
  if (image_urls.length === 0) {
    layout_type = 'text_only';
  } else if (isMapImg) {
    layout_type = 'split_image_right'; // Maps usually look better on the right
    // Inject maps_url if we detect a map image or location query
    const mapsMatch = speech_text.match(/https:\/\/maps\.(?:app\.goo\.gl|google\.com)\/\S+/);
    maps_url = mapsMatch ? mapsMatch[0] : 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';
  } else if (/(tổng quan|toàn cảnh|cảnh quan|phối cảnh|không gian|dự án)/.test(textToSearch) && image_urls.length === 1) {
    layout_type = 'full_background';
  } else if (highlight_number && String(highlight_number).trim() && image_urls.length >= 1) {
    layout_type = 'dark_minimal';
  } else {
    // Alternate left/right based on some randomness or string length
    layout_type = (message.length % 2 === 0) ? 'split_image_right' : 'split_image_left';
  }

  return { image_urls, layout_type, maps_url };
}
