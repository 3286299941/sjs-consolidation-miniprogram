// packageAdmin/batches —— 管理端：批次列表 + 建立批次
// 业务规则（策划案 2.2）：同邮编同时只允许一个未锁定批次，前端做提示，服务端做硬校验
const client = require('../../services/client');
const fmt = require('../../utils/format');
const auth = require('../../utils/auth');
const config = require('../../utils/config');

Page({
  data: {
    batches: [],
    loading: true,
    showForm: false,
    submitting: false,
    currency: config.CURRENCY_SYMBOL,
    form: {
      batch_no: '',
      zip_code: '',
      normal_channel: '',
      sensitive_channel: ''
    }
  },

  onShow() {
    // 白名单即管理员：角色守卫，密码解锁已下线
    auth.guardAdminPage().then((ok) => { if (ok) this.load(); });
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await client.adminGetBatches();
      this.setData({ batches: (res && res.list) || [], loading: false });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  toggleForm() {
    this.setData({ showForm: !this.data.showForm });
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  async onCreateBatch() {
    if (this.data.submitting) return;
    const form = this.data.form;
    if (!String(form.batch_no).trim() || !String(form.zip_code).trim()) {
      wx.showToast({ title: '批次号和邮编不能为空', icon: 'none' });
      return;
    }
    // 前端预校验：同邮编已有未锁定批次时先提示，避免无效请求
    const dup = this.data.batches.find(
      (b) => String(b.zip_code) === String(form.zip_code).trim() && !b.is_locked
    );
    if (dup) {
      wx.showModal({
        title: '该邮编已有未锁定批次',
        content: '「' + dup.batch_no + '」尚未锁定。按现有周流程，同一邮编同时只允许一个未锁定批次，请先锁定或发货后再建。',
        showCancel: false
      });
      return;
    }

    this.setData({ submitting: true });
    try {
      await client.adminCreateBatch({
        batch_no: String(form.batch_no).trim(),
        zip_code: String(form.zip_code).trim(),
        normal_channel: form.normal_channel,
        sensitive_channel: form.sensitive_channel
      });
      wx.showToast({ title: '批次已建立', icon: 'none' });
      this.setData({
        showForm: false,
        submitting: false,
        form: { batch_no: '', zip_code: '', normal_channel: '', sensitive_channel: '' }
      });
      this.load();
    } catch (err) {
      this.setData({ submitting: false });
      fmt.showError(err);
    }
  },

  goBoard(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageAdmin/board/board?batch_id=' + id });
  },

  goTracks(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageAdmin/tracks/tracks?id=' + id });
  },

  goAudit() {
    wx.navigateTo({ url: '/packageAdmin/audit/audit' });
  },

  // 进入批次账单独立页（分普/敏、按客户逐组结清）
  goBill(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageAdmin/batch-bill/batch-bill?batch_id=' + id });
  }
  // 2026-11-06：批次锁定/解锁已从小程序移除，只能在系统操作端完成
});
