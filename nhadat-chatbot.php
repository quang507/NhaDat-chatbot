<?php
/*
Plugin Name: NhaDat Chatbot
Plugin URI: https://nhadat.company
Description: NhaDat Chatbot Integration
Version: 1.0.0
Author: NhaDat Team
*/

if (!defined('ABSPATH')) {
    exit;
}

add_shortcode('nhadat_chatbot', function() {
    $chatbot_url = 'https://nha-dat-chatbot.vercel.app';

    return sprintf(
        '<div id="nhadat-chatbot-container" style="width:100%%;height:600px;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
            <iframe src="%s"
                    style="width:100%%;height:100%%;border:none;border-radius:8px;"
                    allow="microphone;camera;">
            </iframe>
        </div>',
        esc_url($chatbot_url)
    );
});

add_action('wp_head', function() {
    echo '<style>
        #nhadat-chatbot-container iframe {
            display: block;
        }
    </style>';
});

add_action('wp_footer', function() {
    echo '<div id="nhadat-chatbot-container" style="width:100%;height:600px;border:1px solid #ddd;border-radius:8px;overflow:hidden;margin-top:20px;">
        <iframe src="https://nha-dat-chatbot.vercel.app"
                style="width:100%;height:100%;border:none;border-radius:8px;"
                allow="microphone;camera;">
        </iframe>
    </div>';
});
