<?php
/*
Plugin Name: NhaDat Chatbot
Plugin URI: https://nhadat.company
Description: Tích hợp AI Chatbot dạng Popup ẩn hiện
Version: 1.1.0
Author: NhaDat Team
*/

if (!defined('ABSPATH')) { exit; }

add_action('wp_footer', function() { 
    $chatbot_url = 'https://nha-dat-chatbot.vercel.app';
    ?>
    <style>
        #nhadat-ai-widget {
            position: fixed;
            bottom: 20px;
            right: 20px; /* Có thể đổi thành left: 20px nếu muốn nằm bên trái */
            z-index: 999999;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
        }
        #nhadat-ai-iframe-container {
            display: none;
            width: 360px;
            height: 600px;
            border-radius: 12px;
            box-shadow: 0 5px 25px rgba(0,0,0,0.2);
            overflow: hidden;
            margin-bottom: 15px;
            background: #fff;
            border: 1px solid #ddd;
            transition: all 0.3s ease;
        }
        /* Hiển thị khung chat khi có class active */
        #nhadat-ai-iframe-container.active {
            display: block;
        }
        #nhadat-ai-iframe-container iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        #nhadat-ai-button {
            width: 60px;
            height: 60px;
            background-color: #d13023; /* Màu đỏ đô, mày có thể đổi mã màu tùy ý */
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            display: flex;
            justify-content: center;
            align-items: center;
            transition: transform 0.2s;
        }
        #nhadat-ai-button:hover {
            transform: scale(1.05);
        }
        #nhadat-ai-button svg {
            width: 30px;
            height: 30px;
            fill: #fff;
        }
        
        /* Chỉnh lại kích thước cho mobile */
        @media (max-width: 480px) {
            #nhadat-ai-iframe-container {
                width: 90vw;
                height: 70vh;
                right: 5vw;
            }
        }
    </style>

    <div id="nhadat-ai-widget">
        <div id="nhadat-ai-iframe-container">
            <iframe src="<?php echo esc_url($chatbot_url); ?>" allow="microphone;camera;"></iframe>
        </div>
        <div id="nhadat-ai-button" onclick="toggleNhaDatChat()">
            <!-- Icon Chat SVG -->
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path></svg>
        </div>
    </div>

    <script>
        function toggleNhaDatChat() {
            var container = document.getElementById('nhadat-ai-iframe-container');
            container.classList.toggle('active');
        }
    </script>
    <?php
});
