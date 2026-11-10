// utils/auth.js —— 微信静默登录 + 自定义登录态
// 安全红线（E-03）：wx.login 的 code 只能发给服务端换 openid；
// session_key 与 appsecret 永远不出现在前端，前端只保存服务端签发的 token。
const config = require('./config');
const request = require('./request');
const client = require('../services/client');

/** 回调式 wx.login，兼容性最好；Promise 化不依赖特定基础库版本 */
function getWxCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => (res.code ? resolve(res.code) : reject(new Error('微信登录失败'))),
      fail: () => reject(new Error('微信登录失败'))
    });
  });
}

/** 确保本地有有效 token；force=true 时强制重新登录 */
async function ensureLogin(force = false) {
  if (!force) {
    const cached = wx.getStorageSync(config.TOKEN_KEY);
    if (cached) return cached;
  }
  const code = config.USE_MOCK ? 'mock_code' : (config.USE_CLOUD ? '' : await getWxCode());
  const res = await client.login(code);
  if (!res || !res.token) throw new Error('登录凭证获取失败');

  wx.setStorageSync(config.TOKEN_KEY, res.token);
  if (res.profile) wx.setStorageSync(config.PROFILE_KEY, res.profile);
  return res.token;
}

/** 读取用户资料（绑定状态、客户信息、角色），带本地缓存 */
async function getProfile(force = false) {
  if (!force) {
    const cached = wx.getStorageSync(config.PROFILE_KEY);
    if (cached) return cached;
  }
  await ensureLogin();
  const profile = await client.getProfile();
  wx.setStorageSync(config.PROFILE_KEY, profile);
  return profile;
}

/** 绑定/解绑后必须清缓存，否则页面会一直读到旧状态 */
function clearProfileCache() {
  wx.removeStorageSync(config.PROFILE_KEY);
}

function isBound(profile) {
  return !!profile && profile.bind_status === 2;
}

function isAdmin(profile) {
  return !!profile && Number(profile.role) === 1;
}

/** 管理页守卫：白名单管理员直接放行；非管理员提示并回首页。
 *  2026-11-06：二重验证密码已下线，白名单是唯一门槛（服务端 require_admin 同步收紧）。 */
async function guardAdminPage() {
  try {
    const app = getApp();
    const profile = await app.refreshProfile();
    if (isAdmin(profile)) return true;
  } catch (e) { /* 资料拉取失败时按无权限处理 */ }
  wx.showToast({ title: '无管理端权限', icon: 'none' });
  setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 600);
  return false;
}

function logout() {
  wx.removeStorageSync(config.TOKEN_KEY);
  wx.removeStorageSync(config.PROFILE_KEY);
}

// 401 时自动清掉登录态，下一次页面请求会重新走静默登录
request.setOnUnauthorized(() => logout());

module.exports = {
  ensureLogin,
  getProfile,
  clearProfileCache,
  isBound,
  isAdmin,
  guardAdminPage,
  logout
};
