(function () {
  // Script nhúng chatbot NhaDat vào bất kỳ website nào (WordPress, HTML...)
  // Cách dùng: <script src="https://nha-dat-chatbot.vercel.app/embed.js"></script>
  var ORIGIN = 'https://nha-dat-chatbot.vercel.app';

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
