(function () {
  // Script nhúng chatbot NhaDat vào bất kỳ website nào (WordPress, HTML...)
  // Cách dùng: <script src="https://<domain-chatbot>/embed.js"></script>
  // ORIGIN lấy theo chính nơi tải script -> đổi host (Vercel / máy tự chạy) không phải sửa file.
  // Plugin tối ưu (WP Rocket...) có thể chép script về domain website -> khi đó
  // origin script trùng trang chủ, không phải chatbot -> dùng mặc định.
  var ORIGIN = 'https://nha-dat-chatbot.vercel.app';
  try {
    var cur = document.currentScript && new URL(document.currentScript.src).origin;
    if (cur && cur !== location.origin) ORIGIN = cur;
  } catch (e) {}

  var iframe = document.createElement('iframe');
  iframe.src = ORIGIN + '/embed';
  iframe.title = 'NhaDat Chatbot';
  iframe.allow = 'clipboard-write';
  iframe.style.cssText = [
    'position:fixed',
    'bottom:0',
    'right:0',
    'width:100px',
    'height:100px',
    'border:0',
    'z-index:2147483647',
    'background:transparent',
    'color-scheme:normal',
    'transition:width .2s,height .2s',
  ].join(';');

  function setSize(open) {
    if (open) {
      iframe.style.width = '420px';
      iframe.style.height = '640px';
    } else {
      iframe.style.width = '100px';
      iframe.style.height = '100px';
    }
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN) return;
    if (e.data && e.data.type === 'nhadat-chat') setSize(e.data.open);
  });

  if (document.body) document.body.appendChild(iframe);
  else window.addEventListener('DOMContentLoaded', function () { document.body.appendChild(iframe); });
})();
