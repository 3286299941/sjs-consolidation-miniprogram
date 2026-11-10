// pages/mine —— 个人中心 / 绑定信息 / 管理端入口
const app = getApp();
const auth = require('../../utils/auth');
const fmt = require('../../utils/format');
const config = require('../../utils/config');
const client = require('../../services/client');

Page({
  data: {
    profile: null,
    bound: false,
    isAdmin: false,
    version: '1.0.0-mvp'
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const profile = await app.refreshProfile(false);
      const avatarUrl = profile.avatar ? config.API_BASE_URL + profile.avatar : '';
      this.setData({
        profile,
        avatarUrl,
        bound: auth.isBound(profile),
        isAdmin: auth.isAdmin(profile)
      });
    } catch (err) {
      fmt.showError(err);
    }
  },

  goBind() {
    wx.navigateTo({ url: '/packageClient/bind/bind' });
  },

  // 尺寸确认：管理端推送的包裹尺寸，客户核对后确认
  goDimConfirm() {
    wx.navigateTo({ url: '/packageClient/dim-confirm/dim-confirm' });
  },

  // VIP 单独发货记录入口已迁移至「我的货物」页第四个 tab（VIP发货），此处不再保留

  // 解绑涉及客户归属，策划案 5.5 明确「走管理端审核」；
  // 当前 API 草案未定义解绑接口，这里只做说明，不擅自新增后端调用
  onUnbind() {
    wx.showModal({
      title: '解绑 / 切换客户',
      content: '为保证货物数据安全，解绑与换绑需由管理端审核。请联系仓库操作员在管理端处理。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  onLogout() {
    wx.showModal({
      title: '重新登录',
      content: '将清除本机登录态并重新进行微信静默登录，已绑定关系不会改变。',
      success: (res) => {
        if (!res.confirm) return;
        auth.logout();
        app.globalData.profile = null;
        app.globalData.lastHomeRefreshAt = 0;
        wx.reLaunch({ url: '/pages/index/index' });
      }
    });
  },

  // 管理端入口：白名单即管理员，直达驾驶舱（密码解锁已下线）
  goAdmin(target) {
    const routes = {
      home: '/packageAdmin/home/home',
      customers: '/packageAdmin/customers/customers',
      batches: '/packageAdmin/batches/batches',
      board: '/packageAdmin/board/board',
      audit: '/packageAdmin/audit/audit'
    };
    wx.navigateTo({ url: routes[target || 'home'] || routes.home });
  },
  goAdminHome() { this.goAdmin('home'); },
  goAdminCustomers() { this.goAdmin('customers'); },
  goAdminBatches() { this.goAdmin('batches'); },
  goAdminBoard() { this.goAdmin('board'); },
  goAdminAudit() { this.goAdmin('audit'); },

  onAbout() {
    wx.showModal({
      title: '关于速捷供应链',
      content: '客户端提供入库单查询与发货意向确认；货物状态、批次锁定与打包发货仍由仓库操作端按周流程执行。',
      showCancel: false
    });
  },

  // 微信头像：chooseAvatar 选中后上传到服务器，返回可访问 URL
  async onChooseAvatar(e) {
    const filePath = e.detail && e.detail.avatarUrl;
    if (!filePath) return;
    try {
      wx.showLoading({ title: '上传头像中' });
      const data = await client.uploadAvatar(filePath);
      wx.hideLoading();
      this.applyProfilePatch({ avatar: data.avatar });
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      fmt.showError(err);
    }
  },

  // 微信昵称：input type=nickname 拿到微信昵称后保存
  async onNickInput(e) {
    const nick = ((e.detail && (e.detail.value || e.detail.nickname)) || '').trim();
    if (!nick) return;
    if (this.data.profile && nick === this.data.profile.nickname) return;
    try {
      const data = await client.saveNickname(nick);
      this.applyProfilePatch({ nickname: data.nickname });
      wx.showToast({ title: '昵称已更新', icon: 'success' });
    } catch (err) {
      fmt.showError(err);
    }
  },

  // 把头像/昵称补丁写回本地缓存与页面，并拼接头像完整 URL
  applyProfilePatch(patch) {
    const profile = Object.assign({}, this.data.profile, patch);
    wx.setStorageSync(config.PROFILE_KEY, profile);
    app.globalData.profile = profile;
    const avatarUrl = profile.avatar ? config.API_BASE_URL + profile.avatar : '';
    this.setData({ profile, avatarUrl });
  }
});
