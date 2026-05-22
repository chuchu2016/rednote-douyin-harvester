/**
 * 小红书抖音整理助手 - 后台服务
 * 负责与飞书 API 交互，批量保存用户主动整理的结果
 */

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

// 默认配置为空，用户需要在设置页填写自己的飞书信息
const DEFAULT_CONFIG = {
    feishuAppId: '',
    feishuAppSecret: '',
    feishuBaseId: '',
    feishuTableId: ''
};

// 首次安装时初始化配置结构
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['feishuAppId'], (result) => {
        if (!result.feishuAppId) {
            chrome.storage.local.set(DEFAULT_CONFIG);
            console.log('已设置默认配置');
        }
    });
});

/**
 * 获取飞书租户访问凭证
 */
async function getTenantAccessToken(appId, appSecret) {
    const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret })
    });

    const data = await response.json();
    if (data.code === 0) {
        return data.tenant_access_token;
    } else {
        throw new Error(`获取 Token 失败: ${data.msg}`);
    }
}

/**
 * 构建单条记录的字段数据
 */
function buildRecordFields(video) {
    const collectedAt = video.collectTime ? new Date(video.collectTime).getTime() : Date.now();

    return {
        "视频标题": video.title || "",
        "视频链接": {
            link: video.videoUrl || "",
            text: video.title || "视频链接"
        },
        "博主名称": video.authorName || "",
        "博主主页": {
            link: video.authorUrl || "",
            text: video.authorName || "博主主页"
        },
        "点赞数": video.likes || 0,
        "整理时间": Number.isNaN(collectedAt) ? Date.now() : collectedAt
    };
}

/**
 * 批量创建记录（飞书 API 单次最多 500 条）
 */
async function batchCreateRecords(token, baseId, tableId, videos) {
    const records = videos.map(video => ({
        fields: buildRecordFields(video)
    }));

    const response = await fetch(
        `${FEISHU_API_BASE}/bitable/v1/apps/${baseId}/tables/${tableId}/records/batch_create`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ records })
        }
    );

    const data = await response.json();
    console.log('[飞书API] 批量创建响应:', data);

    if (data.code === 0) {
        return data.data?.records?.length || videos.length;
    } else {
        throw new Error(data.msg || `错误码: ${data.code}`);
    }
}

/**
 * 分批保存整理结果到飞书表格
 */
async function addRecords(token, baseId, tableId, videos) {
    const BATCH_SIZE = 500;  // 飞书 API 单次最多 500 条
    let totalSuccess = 0;

    // 分批处理
    for (let i = 0; i < videos.length; i += BATCH_SIZE) {
        const batch = videos.slice(i, i + BATCH_SIZE);
        console.log(`[飞书API] 正在保存第 ${i + 1}-${i + batch.length} 条，共 ${videos.length} 条`);

        try {
            const count = await batchCreateRecords(token, baseId, tableId, batch);
            totalSuccess += count;
        } catch (e) {
            console.error(`[飞书API] 批次保存失败:`, e.message);
        }
    }

    if (totalSuccess === 0) {
        throw new Error('全部保存失败，请检查表格字段是否正确');
    }

    return { success: true, count: totalSuccess };
}

/**
 * 保存整理结果到飞书表格
 */
async function saveVideosToFeishu(videos) {
    const config = await chrome.storage.local.get([
        'feishuAppId', 'feishuAppSecret', 'feishuBaseId', 'feishuTableId'
    ]);

    if (!config.feishuAppId || !config.feishuAppSecret ||
        !config.feishuBaseId || !config.feishuTableId) {
        throw new Error('请先在设置页面配置飞书应用信息');
    }

    const token = await getTenantAccessToken(config.feishuAppId, config.feishuAppSecret);
    const result = await addRecords(token, config.feishuBaseId, config.feishuTableId, videos);

    return result;
}

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveToFeishu') {
        saveVideosToFeishu(request.videos)
            .then(result => sendResponse({ success: true, data: result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

// 保持 Service Worker 活跃
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        console.log('Service Worker heartbeat');
    }
});

console.log('rednote-douyin-organizer Service Worker 已启动');
