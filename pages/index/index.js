// pages/index —— 首页：身份卡 / 待决策概览 / 快捷入口 / 周流程说明
const app = getApp();
const client = require('../../services/client');
const config = require('../../utils/config');
const auth = require('../../utils/auth');
const fmt = require('../../utils/format');

Page({
  data: {
    profile: null,
    bound: false,
    loading: true,
    stats: { inStock: 0, pendingBatches: 0, toDecide: 0 },
    pendingBatches: [],
    isAdmin: false,
    clientView: false,   // 管理员主动切换到客户端视角时为 true
    myBills: []          // 已派发的批次账单列表
  },

  onLoad() {
    // 数据统一在 onShow 拉取，保证 tab 切换回来能看到最新状态
  },

  onShow() {
    const now = Date.now();
    const last = app.globalData.lastHomeRefreshAt || 0;
    // E-07：30 秒内切回页面只做轻量状态刷新，不重复打请求
    if (now - last < config.REFRESH_THROTTLE_MS && app.globalData.profile) {
      this.applyProfile(app.globalData.profile);
      return;
    }
    app.globalData.lastHomeRefreshAt = now;
    this.loadAll();
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const profile = await app.refreshProfile(true);
      this.applyProfile(profile);

      // 白名单管理员：进小程序直接进管理端驾驶舱，不走客户绑定/浏览流程
      if (auth.isAdmin(profile) && !app.globalData.adminClientView) return;

      if (!auth.isBound(profile)) {
        // 未绑定不请求业务数据，避免无意义的网络与越权读取
        this.setData({ loading: false, stats: { inStock: 0, pendingBatches: 0, toDecide: 0 }, pendingBatches: [], myBills: [] });
        return;
      }

      // 并行拉取：在库数量 + 待决策批次 + 已派发账单
      const [stockRes, pendingRes, billsRes] = await Promise.all([
        client.getPackages({ status: '已入库', page: 1, size: 1 }),
        client.getPendingBatches(),
        client.getMyBills()
      ]);
      const batches = (pendingRes && pendingRes.batches) || [];
      const toDecide = batches.reduce((sum, b) => sum + (Number(b.package_count) || 0), 0);

      this.setData({
        loading: false,
        // 一次性合并 setData，只传变化字段（E-02）
        stats: {
          inStock: (stockRes && stockRes.total) || 0,
          pendingBatches: batches.length,
          toDecide
        },
        pendingBatches: batches.slice(0, 3),
        myBills: (billsRes && billsRes.items) || []
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  applyProfile(profile) {
    const admin = auth.isAdmin(profile);
    this.setData({
      profile,
      bound: auth.isBound(profile),
      isAdmin: admin,
      clientView: admin && !!app.globalData.adminClientView
    });
    // 管理员直进管理端（客户端视角模式下停留在本页并展示返回入口）
    if (admin && !app.globalData.adminClientView) {
      wx.reLaunch({ url: '/packageAdmin/home/home' });
    }
  },

  // 管理端入口：白名单即管理员，直达驾驶舱，不再经过解锁页
  goAdmin() { wx.navigateTo({ url: '/packageAdmin/home/home' }); },

  // 客户端物流轨迹：与管理端同一份批次轨迹数据
  goTracks() { wx.navigateTo({ url: '/packageClient/tracks/tracks' }); },

  // 管理员在客户端视角预览完，一键返回管理端
  backToAdmin() {
    app.globalData.adminClientView = false;
    wx.reLaunch({ url: '/packageAdmin/home/home' });
  },

  goBind() { wx.navigateTo({ url: '/packageClient/bind/bind' }); },
  goBill(e) {
    const bid = e.currentTarget.dataset.bid;
    wx.navigateTo({ url: '/packageClient/batch-bill/batch-bill?batch_id=' + bid });
  },
  goPackages() { wx.switchTab({ url: '/pages/packages/packages' }); },
  goIntent() { wx.switchTab({ url: '/pages/confirm/confirm' }); },
  goMyPackages() { wx.switchTab({ url: '/pages/packages/packages' }); },
  goAudit() { wx.navigateTo({ url: '/packageAdmin/audit/audit' }); },

  onPullDownRefresh() {
    app.globalData.lastHomeRefreshAt = 0;
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  }
});
