/**
 * 小红书抖音整理助手 - 小红书 Content Script
 * 针对小红书网页版博主主页的作品基础信息与点赞数读取
 */

console.log('[rednote-douyin-organizer] 小红书 Content script 加载中...');

function parseNumber(str) {
    if (!str) return 0;

    str = str.toString().trim();

    if (str.includes('亿')) {
        const num = parseFloat(str.replace('亿', ''));
        return Math.round(num * 100000000);
    }
    if (str.includes('万') || str.includes('w') || str.includes('W')) {
        const num = parseFloat(str.replace(/[万wW]/g, ''));
        return Math.round(num * 10000);
    }

    const cleaned = str.replace(/[^\d.]/g, '');
    return parseInt(cleaned, 10) || 0;
}

function extractNumberFromText(text) {
    if (!text) return 0;
    const trimmed = text.toString().trim();

    // 支持 "1.2万" "356" "2.1万赞" 等
    const match = trimmed.match(/(\d+\.?\d*)\s*([万wW亿])?/);
    if (!match) return 0;

    const num = parseFloat(match[1]);
    const unit = match[2] || '';

    if (unit === '亿') return Math.round(num * 100000000);
    if (unit === '万' || unit === 'w' || unit === 'W') return Math.round(num * 10000);
    return Math.round(num);
}

function getAuthorInfo() {
    let authorName = '';

    const nameSelectors = [
        'h1',
        '[data-testid="user-name"]',
        '[class*="userName"]',
        '[class*="username"]',
        '[class*="nickname"]',
        'div[class*="name"]',
        'span[class*="name"]'
    ];

    for (const selector of nameSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent && el.textContent.trim().length > 0 && el.textContent.trim().length < 50) {
            authorName = el.textContent.trim();
            break;
        }
    }

    if (!authorName) {
        const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
        if (ogTitle && ogTitle.length < 80) {
            authorName = ogTitle.replace(/-.*$/, '').trim();
        }
    }

    if (!authorName) {
        const title = document.title || '';
        const match = title.match(/^(.*?)(?:的)?小红书/);
        if (match && match[1]) authorName = match[1].trim();
    }

    const authorUrl = `${window.location.origin}${window.location.pathname}`;
    console.log(`[rednote-douyin-organizer] 小红书博主信息: ${authorName}, ${authorUrl}`);
    return { authorName: authorName || '未知博主', authorUrl };
}

function isXhsProfilePage(url) {
    return /xiaohongshu\.com\/user\/profile\//.test(url);
}

function extractVideos() {
    const videos = [];
    const { authorName, authorUrl } = getAuthorInfo();

    console.log('[rednote-douyin-organizer] 开始读取小红书作品基础信息与点赞数...');

    const url = window.location.href;
    if (!isXhsProfilePage(url)) {
        throw new Error('当前页面不是小红书博主主页（请进入 user/profile 页面）');
    }

    const searchScope = document.body;

    const linkEls = searchScope.querySelectorAll(
        'a[href^="/explore/"], a[href*="/explore/"], a[href*="/discovery/item/"]'
    );

    console.log(`[rednote-douyin-organizer] 找到 ${linkEls.length} 个小红书作品链接`);

    const processedUrls = new Set();

    linkEls.forEach((linkEl, index) => {
        try {
            const href = linkEl.getAttribute('href') || '';
            if (!href) return;

            const noteUrl = new URL(href, window.location.origin).toString();
            if (processedUrls.has(noteUrl)) return;
            processedUrls.add(noteUrl);

            let card = linkEl;
            for (let i = 0; i < 10; i++) {
                if (!card.parentElement) break;
                card = card.parentElement;
                if (card.offsetWidth > 100 && card.offsetHeight > 100) break;
            }

            let title = '';
            const titleSelectors = [
                '[class*="title"]',
                'p',
                'span',
                'div'
            ];
            for (const selector of titleSelectors) {
                const els = card.querySelectorAll(selector);
                for (const el of els) {
                    const text = (el.textContent || '').trim();
                    if (!text) continue;
                    if (text.length < 2 || text.length > 120) continue;
                    if (/^\d+\.?\d*[万wW亿]?$/.test(text)) continue;
                    // 避免把“赞/收藏”等短标签当标题
                    if (text === '赞' || text === '收藏' || text === '评论') continue;
                    title = text;
                    break;
                }
                if (title) break;
            }

            let likes = 0;
            const candidates = card.querySelectorAll('span, div');
            candidates.forEach((el) => {
                const text = (el.textContent || '').trim();
                if (!text) return;

                // "1.2万" 或 "1.2万赞"
                if (/^\d+\.?\d*\s*[万wW亿]?\s*(赞|喜欢)?$/.test(text) || text.includes('赞')) {
                    const n = extractNumberFromText(text);
                    if (n > likes) likes = n;
                }
            });

            // 回退：从整段文本里找一个最大的数字
            if (likes === 0) {
                const allText = (card.textContent || '').trim();
                const matches = allText.match(/\d+\.?\d*\s*[万wW亿]?/g) || [];
                for (const m of matches) {
                    const n = parseNumber(m);
                    if (n > likes) likes = n;
                }
            }

            videos.push({
                title: title || `作品 ${index + 1}`,
                videoUrl: noteUrl,
                authorName,
                authorUrl,
                likes,
                collectTime: new Date().toISOString()
            });
        } catch (e) {
            console.error('[rednote-douyin-organizer] 读取单个小红书作品出错:', e);
        }
    });

    if (videos.length === 0) {
        throw new Error('未找到作品链接。请确认已进入小红书博主主页并向下滚动加载作品后再整理。');
    }

    console.log(`[rednote-douyin-organizer] 共读取 ${videos.length} 个小红书作品`);
    return videos;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[rednote-douyin-organizer] 小红书 Content script 收到消息:', request.action);

    if (request.action === 'extractVideos') {
        try {
            const videos = extractVideos();
            sendResponse({ success: true, videos });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }

    if (request.action === 'getPageInfo') {
        const { authorName, authorUrl } = getAuthorInfo();
        const url = window.location.href;
        const isUserPage = isXhsProfilePage(url);

        sendResponse({
            success: true,
            channel: 'xiaohongshu',
            isUserPage,
            authorName,
            authorUrl,
            url
        });
        return true;
    }

    return true;
});

console.log('[rednote-douyin-organizer] 小红书 Content script 已就绪');
