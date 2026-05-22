/**
 * 小红书抖音整理助手 - 设置页逻辑
 */

const form = document.getElementById('settingsForm');
const appIdInput = document.getElementById('appId');
const appSecretInput = document.getElementById('appSecret');
const baseIdInput = document.getElementById('baseId');
const tableIdInput = document.getElementById('tableId');
const statusEl = document.getElementById('status');

// 加载已保存的配置
async function loadSettings() {
    const config = await chrome.storage.local.get([
        'feishuAppId',
        'feishuAppSecret',
        'feishuBaseId',
        'feishuTableId'
    ]);

    if (config.feishuAppId) appIdInput.value = config.feishuAppId;
    if (config.feishuAppSecret) appSecretInput.value = config.feishuAppSecret;
    if (config.feishuBaseId) baseIdInput.value = config.feishuBaseId;
    if (config.feishuTableId) tableIdInput.value = config.feishuTableId;
}

// 显示状态
function showStatus(type, message) {
    statusEl.className = `status ${type}`;
    statusEl.textContent = message;

    setTimeout(() => {
        statusEl.className = 'status';
    }, 3000);
}

// 保存配置
async function saveSettings(e) {
    e.preventDefault();

    const config = {
        feishuAppId: appIdInput.value.trim(),
        feishuAppSecret: appSecretInput.value.trim(),
        feishuBaseId: baseIdInput.value.trim(),
        feishuTableId: tableIdInput.value.trim()
    };

    if (!config.feishuAppId || !config.feishuAppSecret ||
        !config.feishuBaseId || !config.feishuTableId) {
        showStatus('error', '请填写所有配置项');
        return;
    }

    try {
        await chrome.storage.local.set(config);
        showStatus('success', '配置已保存');
    } catch (error) {
        showStatus('error', `保存失败: ${error.message}`);
    }
}

form.addEventListener('submit', saveSettings);
loadSettings();
