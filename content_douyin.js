/**
 * 小红书抖音整理助手 - 抖音 Content Script
 * 针对抖音网页版博主主页的视频基础信息与点赞数读取
 */

console.log('[rednote-douyin-organizer] 抖音 Content script 加载中...');

// 数字转换函数：将 "10.5万" 转为 105000
function parseNumber(str) {
    if (!str) return 0;

    str = str.toString().trim();

    // 处理 "1.2万" "10万" "1亿" 等格式
    if (str.includes('亿')) {
        const num = parseFloat(str.replace('亿', ''));
        return Math.round(num * 100000000);
    } else if (str.includes('万') || str.includes('w') || str.includes('W')) {
        const num = parseFloat(str.replace(/[万wW]/g, ''));
        return Math.round(num * 10000);
    } else {
        // 纯数字，移除逗号等非数字字符
        const cleaned = str.replace(/[^\d.]/g, '');
        return parseInt(cleaned, 10) || 0;
    }
}

// 从文本中提取数字（处理 "9.07万" 这种格式）
function extractNumberFromText(text) {
    if (!text) return 0;

    // 匹配 "9.07万" "14.5万" "148" "210万" 等格式
    const match = text.match(/(\d+\.?\d*)\s*[万wW亿]?/);
    if (match) {
        let num = parseFloat(match[1]);
        if (text.includes('亿')) {
            num = num * 100000000;
        } else if (text.includes('万') || text.includes('w') || text.includes('W')) {
            num = num * 10000;
        }
        return Math.round(num);
    }
    return 0;
}

// 获取当前博主信息
function getAuthorInfo() {
    let authorName = '';

    // 尝试多种方式获取博主名称
    const nameSelectors = [
        'h1',  // 通常博主名在 h1 标签
        '[data-e2e="user-info"] span',
        '.user-info .user-name',
        '[class*="userName"]',
        '[class*="nickname"]',
        'span[class*="name"]'
    ];

    for (const selector of nameSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim().length > 0 && el.textContent.trim().length < 50) {
            authorName = el.textContent.trim();
            break;
        }
    }

    // 如果还没找到，尝试从页面标题提取
    if (!authorName) {
        const titleMatch = document.title.match(/(.+)的抖音/);
        if (titleMatch) {
            authorName = titleMatch[1];
        }
    }

    const authorUrl = window.location.href.split('?')[0];

    console.log(`[rednote-douyin-organizer] 抖音博主信息: ${authorName}, ${authorUrl}`);
    return { authorName: authorName || '未知博主', authorUrl };
}

// 核心：读取当前页面可见视频列表
function extractVideos() {
    const videos = [];
    const { authorName, authorUrl } = getAuthorInfo();

    console.log('[rednote-douyin-organizer] 开始读取抖音视频基础信息与点赞数...');

    // 优先在作品列表容器内查找，避免读到广告等无关内容
    const postListContainers = [
        '[data-e2e="user-post-list"]',  // 作品列表
        '[data-e2e="user-like-list"]',  // 喜欢列表
        'ul[class*="video"]',
        'div[class*="post-list"]',
        'div[class*="video-list"]'
    ];

    let container = null;
    for (const selector of postListContainers) {
        container = document.querySelector(selector);
        if (container) {
            console.log(`[rednote-douyin-organizer] 找到抖音作品列表容器: ${selector}`);
            break;
        }
    }

    // 如果没找到作品列表容器，就在整个页面查找，但会进行更严格的过滤
    const searchScope = container || document.body;

    const videoLinks = searchScope.querySelectorAll('a[href*="/video/"]');
    console.log(`[rednote-douyin-organizer] 在容器内找到 ${videoLinks.length} 个抖音视频链接`);

    const processedUrls = new Set(); // 去重

    // 无关内容过滤关键词
    const filterKeywords = ['广告', '协议', '用户服务', '隐私政策', '版权', '投诉', '举报'];

    videoLinks.forEach((linkEl, index) => {
        try {
            let videoUrl = linkEl.href;
            if (!videoUrl.startsWith('http')) {
                videoUrl = 'https://www.douyin.com' + linkEl.getAttribute('href');
            }

            // 去重
            if (processedUrls.has(videoUrl)) return;
            processedUrls.add(videoUrl);

            // 向上查找视频卡片容器（通常是 li 或包含视频信息的 div）
            let card = linkEl;
            for (let i = 0; i < 10; i++) {
                if (card.parentElement) {
                    card = card.parentElement;
                    // 找到一个合理大小的容器就停止
                    if (card.offsetWidth > 100 && card.offsetHeight > 100) {
                        break;
                    }
                }
            }

            // 读取视频标题（通常在卡片下方的描述文字）
            let title = '';
            const textElements = card.querySelectorAll('p, span, div');
            for (const el of textElements) {
                const text = el.textContent.trim();
                // 标题通常是较长的文字，且不是纯数字
                if (text.length > 5 && text.length < 200 && !/^\d+\.?\d*[万亿]?$/.test(text)) {
                    title = text;
                    break;
                }
            }

            // 过滤无关内容：跳过包含敏感关键词的内容
            const isJunkData = filterKeywords.some(keyword => title.includes(keyword));
            if (isJunkData) {
                console.log(`[rednote-douyin-organizer] 跳过无关内容: ${title.substring(0, 30)}...`);
                return; // 跳过这条
            }

            // 读取点赞数（查找卡片内的数字）
            let likes = 0;
            const allText = card.textContent;

            // 查找所有可能是点赞数的元素
            const spanElements = card.querySelectorAll('span, div');
            for (const el of spanElements) {
                const text = el.textContent.trim();
                // 匹配 "9.07万" "148" 等格式
                if (/^\d+\.?\d*[万wW亿]?$/.test(text)) {
                    const num = extractNumberFromText(text);
                    if (num > likes) {
                        likes = num; // 取最大值（通常是点赞数）
                    }
                }
            }

            // 如果卡片中没找到数字，尝试查找带有心形图标附近的数字
            if (likes === 0) {
                const heartMatch = allText.match(/[❤♥]\s*(\d+\.?\d*[万wW亿]?)/);
                if (heartMatch) {
                    likes = extractNumberFromText(heartMatch[1]);
                }
            }

            videos.push({
                title: title || `视频 ${index + 1}`,
                videoUrl,
                authorName,
                authorUrl,
                likes,
                collectTime: new Date().toISOString()
            });

                console.log(`[rednote-douyin-organizer] 抖音视频 ${videos.length}: ${title.substring(0, 20)}... 点赞: ${likes}`);

        } catch (e) {
            console.error('[rednote-douyin-organizer] 读取单个抖音视频出错:', e);
        }
    });

    console.log(`[rednote-douyin-organizer] 共读取 ${videos.length} 个抖音视频`);
    return videos;
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[rednote-douyin-organizer] 抖音 Content script 收到消息:', request.action);

    if (request.action === 'extractVideos') {
        try {
            const videos = extractVideos();
            console.log('[rednote-douyin-organizer] 返回抖音视频基础信息与点赞数:', videos.length);
            sendResponse({ success: true, videos });
        } catch (error) {
            console.error('[rednote-douyin-organizer] 抖音读取失败:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }

    if (request.action === 'getPageInfo') {
        const { authorName, authorUrl } = getAuthorInfo();
        const url = window.location.href;
        const isDouyinUserPage = url.includes('douyin.com/user/');

        sendResponse({
            success: true,
            channel: 'douyin',
            isDouyinUserPage,
            isUserPage: isDouyinUserPage,
            authorName,
            authorUrl,
            url
        });
        return true;
    }

    return true;
});

// 标记脚本已加载
console.log('[rednote-douyin-organizer] 抖音 Content script 已就绪');
