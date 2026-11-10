// packageAdmin/orphans —— 无主件（系统端 /anonymous 同口径）
// 判定：incoming_packages.is_anonymous=1 AND customer_id IS NULL AND status != '已退货'
// 操作：归户（assign）、退货（return）、删除（delete），逻辑与系统端一致。
const client = require('../../services/client');
const fmt = require('../../utils/format');
const auth = require('../../utils/auth');

Page({
  data: {
    list: [], total: 0, loading: true,
    assignOpen: false, activeId: 0, activeNo: '',
    keyword: '', candidates: [], busy: false
  },

  onShow() {
    auth.guardAdminPage().then((ok) => { if (ok) this.load(); });
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await client.adminOrphans();
      this.setData({
        list: (res && res.list) || [],
        total: (res && res.total) || 0,
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  onAssignOpen(e) {
    const { id, no } = e.currentTarget.dataset;
    this.setData({
      assignOpen: true, activeId: Number(id), activeNo: no,
      keyword: '', candidates: []
    });
  },

  onAssignClose() {
    this.setData({ assignOpen: false, activeId: 0, candidates: [] });
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  async onSearch() {
    const kw = String(this.data.keyword).trim();
    if (!kw) {
      wx.showToast({ title: '请输入客户名/编号', icon: 'none' });
      return;
    }
    try {
      const res = await client.adminCustomerLookup(kw);
      this.setData({ candidates: (res && res.list) || [] });
    } catch (err) {
      fmt.showError(err);
    }
  },

  onPickCustomer(e) {
    const { id, name } = e.currentTarget.dataset;
    if (this.data.busy) return;
    wx.showModal({
      title: '归户确认',
      content: '把单号 ' + this.data.activeNo + ' 归到客户「' + name + '」名下？',
      success: async (r) => {
        if (!r.confirm) return;
        this.setData({ busy: true });
        try {
          await client.adminOrphanAssign(this.data.activeId, Number(id));
          wx.showToast({ title: '已归户', icon: 'none' });
          this.setData({ assignOpen: false, busy: false, activeId: 0, candidates: [] });
          this.load();
        } catch (err) {
          this.setData({ busy: false });
          fmt.showError(err);
        }
      }
    });
  },

  onReturn(e) {
    const { id, no } = e.currentTarget.dataset;
    wx.showModal({
      title: '退货',
      content: '把无主单号 ' + no + ' 标记为已退货？系统端入库明细可恢复。',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await client.adminInboundAction(Number(id), 'return', {});
          wx.showToast({ title: '已退货', icon: 'none' });
          this.load();
        } catch (err) { fmt.showError(err); }
      }
    });
  },

  onDelete(e) {
    const { id, no } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除无主件',
      content: '确认物理删除单号 ' + no + '？与系统端一致，不可恢复。',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await client.adminOrphanDelete(Number(id));
          wx.showToast({ title: '已删除', icon: 'none' });
          this.load();
        } catch (err) { fmt.showError(err); }
      }
    });
  },

  noop() {}
});
