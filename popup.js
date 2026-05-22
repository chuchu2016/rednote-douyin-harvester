/**
 * 小红书抖音整理助手 - 弹窗交互逻辑
 */

// DOM 元素
const pageStatus = document.getElementById('pageStatus');
const statusTitle = document.getElementById('statusTitle');
const statusDesc = document.getElementById('statusDesc');
const notSupportedTip = document.getElementById('notSupportedTip');
const openDouyinLink = document.getElementById('openDouyinLink');
const openXhsLink = document.getElementById('openXhsLink');
const mainPanel = document.getElementById('mainPanel');
const likeThresholdInput = document.getElementById('likeThreshold');
const extractBtn = document.getElementById('extractBtn');
const resultsArea = document.getElementById('resultsArea');
const resultsCount = document.getElementById('resultsCount');
const resultsList = document.getElementById('resultsList');
const actionRow = document.getElementById('actionRow');
const saveBtn = document.getElementById('saveBtn');
const exportBtn = document.getElementById('exportBtn');
const statusEl = document.getElementById('status');

// 当前弹窗生命周期内的整理结果
let collectedVideos = [];
let currentChannel = null;

function setButtonText(button, label) {
    if (!button) return;
    const labelEl = button.querySelector('span');
    if (labelEl) {
        labelEl.textContent = label;
    } else {
        button.textContent = label;
    }
}

function getChannelFromUrl(url) {
    if (!url) return null;
    if (url.includes('douyin.com')) return 'douyin';
    if (url.includes('xiaohongshu.com')) return 'xiaohongshu';
    return null;
}

function isProfileUrl(channel, url) {
    if (!url) return false;
    if (channel === 'douyin') return /douyin\.com\/user\//.test(url);
    if (channel === 'xiaohongshu') return /xiaohongshu\.com\/user\/profile\//.test(url);
    return false;
}

// 格式化数字显示
function formatNumber(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function formatDateTime(timestamp = Date.now()) {
    const dateValue = new Date(timestamp);
    const date = Number.isNaN(dateValue.getTime()) ? new Date() : dateValue;
    const pad = (value) => String(value).padStart(2, '0');

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('-') + ' ' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join(':');
}

function formatDateForFilename(timestamp = Date.now()) {
    return formatDateTime(timestamp).slice(0, 10);
}

function sanitizeFilenamePart(value, fallback) {
    const text = String(value || '').trim() || fallback;
    return text
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/-+/g, '-')
        .slice(0, 60);
}

function createExcelDocument(videos) {
    const headers = [
        '视频标题',
        '视频链接',
        '博主名称',
        '博主主页',
        '点赞数',
        '整理时间'
    ];

    const rows = videos.map((video) => [
        video.title || '',
        video.videoUrl || '',
        video.authorName || '',
        video.authorUrl || '',
        video.likes || 0,
        video.collectTime ? formatDateTime(video.collectTime) : formatDateTime()
    ]);

    const renderCell = (value) => `<td>${escapeHtml(value)}</td>`;
    const headerHtml = headers.map(renderCell).join('');
    const rowHtml = rows.map(row => `<tr>${row.map(renderCell).join('')}</tr>`).join('');

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>整理结果</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head>
<body>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowHtml}</tbody>
  </table>
</body>
</html>`;
}

function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 显示状态提示
function showStatus(type, message) {
    if (!statusEl) return;
    statusEl.className = `status ${type}`;
    statusEl.textContent = message;
}

// 初始化：检测当前页面
async function init() {
    try {
        if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
            showNotSupportedPage(null);
            return;
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            showNotSupportedPage(null);
            return;
        }

        currentChannel = getChannelFromUrl(tab.url);

        // 检查是否为支持的平台页面
        if (!currentChannel) {
            showNotSupportedPage(null);
            return;
        }

        // 向 content script 发送消息获取页面信息（不同渠道由 manifest 注入对应脚本）
        let pageInfo = null;
        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
            if (response && response.success) {
                pageInfo = response;
            }
        } catch (e) {
            // content script 可能还未加载，降级为 URL 规则判断
        }

        const isUserPage = pageInfo?.isUserPage ?? isProfileUrl(currentChannel, tab.url);
        const authorName = pageInfo?.authorName || '博主';

        if (isUserPage) {
            showUserPage(authorName, currentChannel);
        } else {
            showNeedProfilePage(currentChannel);
        }

    } catch (error) {
        console.error('初始化失败:', error);
        showNotSupportedPage(null);
    }
}

// 显示非支持页面
function showNotSupportedPage(channel) {
    if (!pageStatus || !mainPanel || !notSupportedTip) return;

    pageStatus.style.display = 'none';
    mainPanel.style.display = 'none';
    notSupportedTip.style.display = 'block';
    if (openDouyinLink) openDouyinLink.style.display = 'inline-block';
    if (openXhsLink) openXhsLink.style.display = 'inline-block';

    if (channel === 'douyin') {
        if (openXhsLink) openXhsLink.style.display = 'none';
    } else if (channel === 'xiaohongshu') {
        if (openDouyinLink) openDouyinLink.style.display = 'none';
    }
}

function showUserPage(authorName, channel) {
    if (!pageStatus || !mainPanel || !notSupportedTip || !extractBtn) return;

    pageStatus.style.display = 'flex';
    pageStatus.classList.remove('error', 'success');
    statusTitle.textContent = `@${authorName} 的主页`;
    statusDesc.textContent = channel === 'xiaohongshu' ? '点击下方按钮整理可见作品' : '点击下方按钮整理可见视频';
    pageStatus.classList.add('success');
    mainPanel.style.display = 'flex';
    notSupportedTip.style.display = 'none';
    extractBtn.disabled = false;
    setButtonText(extractBtn, '开始整理');
}

function showNeedProfilePage(channel) {
    if (!pageStatus || !mainPanel || !notSupportedTip || !extractBtn) return;

    pageStatus.style.display = 'flex';
    pageStatus.classList.remove('error', 'success');
    statusTitle.textContent = '请进入博主主页';
    statusDesc.textContent = channel === 'xiaohongshu' ? '当前页面不是小红书博主主页' : '当前页面不是抖音博主主页';
    pageStatus.classList.add('error');
    mainPanel.style.display = 'flex';
    notSupportedTip.style.display = 'none';
    extractBtn.disabled = true;
    setButtonText(extractBtn, '请进入博主主页');
}

// 验证点赞阈值输入
function validateThreshold() {
    const value = likeThresholdInput.value.trim();
    if (value === '') return true; // 空值允许

    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0 || !Number.isInteger(parseFloat(value))) {
        return false;
    }
    return true;
}

// 开始整理
async function startExtract() {
    // 验证输入
    if (!validateThreshold()) {
        showStatus('error', '请输入有效的正整数');
        return;
    }

    extractBtn.disabled = true;
    setButtonText(extractBtn, '整理中...');
    showStatus('loading', currentChannel === 'xiaohongshu' ? '正在读取当前页面可见笔记点赞数...' : '正在读取当前页面可见视频点赞数...');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 向 content script 发送消息读取当前页面可见作品
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractVideos' });

        if (!response || !response.success) {
            throw new Error(response?.error || '读取作品点赞数失败');
        }

        let videos = response.videos || [];

        // 应用点赞阈值筛选
        const threshold = likeThresholdInput.value.trim();
        if (threshold !== '') {
            const minLikes = parseInt(threshold, 10);
            videos = videos.filter(v => v.likes >= minLikes);
        }

        collectedVideos = videos;

        // 显示结果
        displayResults(videos);

    } catch (error) {
        console.error('整理失败:', error);
        showStatus('error', `整理失败: ${error.message}`);
    } finally {
        extractBtn.disabled = false;
        setButtonText(extractBtn, '开始整理');
    }
}

// 显示整理结果
function displayResults(videos) {
    if (videos.length === 0) {
        showStatus('error', currentChannel === 'xiaohongshu' ? '未找到符合条件的笔记' : '未找到符合条件的视频');
        resultsArea.style.display = 'none';
        actionRow.style.display = 'none';
        return;
    }

    resultsArea.style.display = 'block';
    actionRow.style.display = 'grid';
    resultsCount.textContent = `${videos.length} 个${currentChannel === 'xiaohongshu' ? '笔记' : '视频'}`;

    // 渲染整理结果列表
    resultsList.innerHTML = videos.map((video, index) => `
    <div class="result-item">
      <span class="result-item__title" title="${escapeHtml(video.title || '无标题')}">
        ${index + 1}. ${escapeHtml(video.title || '无标题')}
      </span>
      <span class="result-item__likes">
        ${formatNumber(video.likes)} 赞
      </span>
    </div>
  `).join('');

    showStatus('success', `成功整理 ${videos.length} 个${currentChannel === 'xiaohongshu' ? '笔记' : '视频'}`);
}

// 导出 Excel
function exportToExcel() {
    if (collectedVideos.length === 0) {
        showStatus('error', '没有可导出的结果');
        return;
    }

    const channelName = currentChannel === 'xiaohongshu' ? '小红书' : '抖音';
    const authorName = sanitizeFilenamePart(collectedVideos[0]?.authorName, '未知博主');
    const safeChannelName = sanitizeFilenamePart(channelName, '未知平台');
    const collectDate = formatDateForFilename();
    const filename = `${authorName}-${safeChannelName}-${collectDate}.xls`;
    const content = createExcelDocument(collectedVideos);

    downloadFile(filename, `\ufeff${content}`, 'application/vnd.ms-excel;charset=utf-8');
    showStatus('success', `已导出 ${collectedVideos.length} 条记录`);
}

// 保存到飞书
async function saveToFeishu() {
    if (collectedVideos.length === 0) {
        showStatus('error', '没有可保存的结果');
        return;
    }

    saveBtn.disabled = true;
    setButtonText(saveBtn, '保存中...');
    showStatus('loading', '正在保存到飞书表格...');

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'saveToFeishu',
            videos: collectedVideos
        });

        if (response.success) {
            const savedCount = response.data?.count || collectedVideos.length;
            showStatus('success', `已保存 ${savedCount} 条记录到飞书表格`);
            setButtonText(saveBtn, '已保存');

            // 3秒后恢复
            setTimeout(() => {
                saveBtn.disabled = false;
                setButtonText(saveBtn, '保存到飞书表格');
            }, 3000);
        } else {
            throw new Error(response.error || '保存失败');
        }

    } catch (error) {
        console.error('保存失败:', error);
        showStatus('error', `保存失败: ${error.message}`);
        saveBtn.disabled = false;
        setButtonText(saveBtn, '保存到飞书表格');
    }
}

// 限制输入只能是正整数
likeThresholdInput?.addEventListener('input', (e) => {
    let value = e.target.value;
    // 移除非数字字符
    value = value.replace(/[^\d]/g, '');
    // 移除前导零
    if (value.length > 1 && value.startsWith('0')) {
        value = value.replace(/^0+/, '');
    }
    e.target.value = value;
});

// 绑定事件
extractBtn?.addEventListener('click', startExtract);
exportBtn?.addEventListener('click', exportToExcel);
saveBtn?.addEventListener('click', saveToFeishu);

// 初始化
init();
