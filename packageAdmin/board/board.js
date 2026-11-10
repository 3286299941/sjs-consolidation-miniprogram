// packageAdmin/board —— 管理端：客户发货意向看板 + 确认
// 硬约束：确认意向只更新 shipment_intents.status，并生成「待打包清单」输入，
// 绝不改写 incoming_packages.status / batches.is_locked（策划案 2.2 / 6.3）
const client = require('../../services/client');
const fmt = require('../../utils/format');
const auth = require('../../utils/auth');

Page({
  data: {
    batchId: '',
    summary: { total: 0, all: 0, normal_only: 0, sensitive_only: 0, none: 0, confirmed: 0, pooled: 0, direct: 0, none_delivery: 0 },
    list: [],
    loading: true,
    confirming: false
  },

  onLoad(options) {
    this.setData({ batchId: options.batch_id || '' });
  },

  onShow() {
    // 白名单即管理员：角色守卫，密码解锁已下线
    auth.guardAdminPage().then((ok) => { if (ok) this.load(); });
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    if (!this.data.batchId) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await client.adminGetIntents(this.data.batchId);
      const rows = ((res && res.list) || []).map((r) => ({
        ...r,
        intentLabel: fmt.intentLabel(r.intent_type),
        intentSummary: fmt.intentSummary(r),
        deliveryLabel: fmt.DELIVERY_LABEL[r.delivery_type || (r.intent_type === 'none' ? 'none' : 'pooled')] || '拼邮发货',
        confirmed: Number(r.status) === 1
      }));
      this.setData({
        summary: (res && res.summary) || this.data.summary,
        list: rows,
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  async onConfirm() {
    if (this.data.confirming) return;
    const pendingIds = this.data.list.filter((r) => !r.confirmed).map((r) => r.customer_id);
    if (pendingIds.length === 0) {
      wx.showToast({ title: '没有待确认的意向', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认客户意向',
      content: '将 ' + pendingIds.length + ' 位客户的意向标记为已确认并生成待打包清单。包裹状态仍由操作端人工流转，不会被改动。',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ confirming: true });
        try {
          const result = await client.adminConfirmIntent({
            batch_id: Number(this.data.batchId),
            customer_ids: pendingIds
          });
          wx.showToast({ title: (result && result.message) || '已确认', icon: 'none', duration: 2500 });
          this.load();
        } catch (err) {
          fmt.showError(err);
        } finally {
          this.setData({ confirming: false });
        }
      }
    });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
