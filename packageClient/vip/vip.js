// packageClient/vip —— 客户端：本人 VIP 单独发货记录
// 命名格式与管理端「VIP单独发货记录」完全一致：客户名 + 短日期(YY-MM-DD) + 箱数
// （如「东 26-10-21 · 40箱」），点卡片进账单、轨迹按钮进物流轨迹。
const client = require('../../services/client');
const fmt = require('../../utils/format');
const auth = require('../../utils/auth');
const app = getApp();

Page({
  data: {
    list: [],
    loading: true,
    bound: false,
    isVip: false,
    isAdmin: false,
    adminAll: false
  },

  async onShow() {
    const profile = await app.refreshProfile(false).catch(() => null);
    const bound = auth.isBound(profile);
    const isVip = !!(profile && profile.customer && profile.customer.is_vip);
    const isAdmin = auth.isAdmin(profile);
    // 管理员且非 VIP：预览全部 VIP 批次；VIP 客户：看本人
    const adminAll = isAdmin && !isVip;
    this.setData({ bound, isVip, isAdmin, adminAll });
    if (!bound) {
      this.setData({ list: [], loading: false });
    } else if (isVip || adminAll) {
      this.load(adminAll);
    } else {
      this.setData({ list: [], loading: false });
    }
  },

  async load(all) {
    this.setData({ loading: true });
    try {
      const res = await client.clientVipBatches(all ? { all: 1 } : undefined);
      const all2 = ((res && res.list) || []).map((b) => {
        const day = String(b.vip_day || '');
        const dayShort = day.length >= 10 ? day.slice(2) : day;
        return Object.assign({}, b, {
          // 与管理端完全一致的标题：客户名 + 短日期 + 箱数
          title: (b.customer_name || 'VIP') + ' ' + (dayShort || '——') + ' · ' + (b.package_total || 0) + '箱'
        });
      });
      this.setData({ list: all2, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  // 进账单（与管理端同口径，已派发才可见运费）
  goBill(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageClient/batch-bill/batch-bill?batch_id=' + id });
  },

  // 进物流轨迹
  goTracks(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageClient/tracks/tracks?id=' + id });
  }
});
