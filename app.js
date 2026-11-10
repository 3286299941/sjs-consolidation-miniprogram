// app.js —— 全局入口
// 设计要点：
// 1. 静默登录只在启动时做一次，页面内统一走 auth.ensureLogin() 复用登录态
// 2. 不在 onLaunch 里塞业务请求，避免拖慢首屏（性能优化手册：按需注入 + 首屏轻量化）
const auth = require('./utils/auth');
const config = require('./utils/config');

App({
  globalData: {
    token: '',
    profile: null,          // { bind_status, customer, role }
    lastHomeRefreshAt: 0    // 首页 onShow 节流用（E-07：避免切回页面就打请求）
  },

  onLaunch() {
    this.checkPrivacy();

    // 云开发模式：初始化云环境（必须在首次 callFunction 之前）
    if (config.USE_CLOUD && config.CLOUD_ENV && typeof wx.cloud !== 'undefined') {
      try { wx.cloud.init({ env: config.CLOUD_ENV, traceUser: true }); } catch (e) {}
    }

    // 启动只做登录态准备，不等待业务数据
    auth.ensureLogin()
      .then(() => auth.getProfile(true))
      .then((profile) => {
        this.globalData.profile = profile;
      })
      .catch((err) => {
        // 启动失败不阻塞，页面 onShow 会再次尝试
        console.warn('[SJS] 初始化登录未完成，页面内将重试：', err);
      });
  },

  /**
   * 隐私授权检查
   * 说明：隐私相关接口有基础库版本要求，且平台政策会调整，
   * 具体版本与配置要求「需以微信官方文档核实」（见 README 合规章节）。
   * 低版本基础库没有这些接口时静默跳过，避免启动即报错。
   */
  checkPrivacy() {
    if (!wx.canIUse || !wx.canIUse('getPrivacySetting')) return;
    try {
      wx.getPrivacySetting({
        success: (res) => {
          if (res.needAuthorization && wx.canIUse('requirePrivacyAuthorize')) {
            wx.requirePrivacyAuthorize({ fail: () => {} });
          }
        },
        fail: () => {}
      });
    } catch (e) {
      console.warn('[SJS] 隐私校验跳过：', e);
    }
  },

  /** 供各页面读取/刷新当前用户资料，带内存缓存 */
  async refreshProfile(force = false) {
    if (!force && this.globalData.profile) return this.globalData.profile;
    const profile = await auth.getProfile(force);
    this.globalData.profile = profile;
    return profile;
  }
});
