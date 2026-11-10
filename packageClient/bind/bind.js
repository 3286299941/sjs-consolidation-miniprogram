// packageClient/bind —— 微信身份与仓库客户绑定
// 需求变更 2026-11-05（第三轮）：
//   1. 不再校验手机号
//   2. 下拉展示「收货名 + 邮编 + 掩码地址」，由客户自行匹配
//   3. 仍必须经管理端审核后才生效（防冒绑最后一道）
// 2026-11-06：新增「新客户建档」模式——新客户自行填写客户名/邮编/地址（可选单独发货），
//   实时同步到系统 customers 表并立即绑定，同时生成可一键复制的电商平台收货地址模板。
const app = getApp();
const client = require('../../services/client');
const config = require('../../utils/config');
const auth = require('../../utils/auth');
const fmt = require('../../utils/format');

const emptyForm = () => ({
  name: '', zip_code: '', address: '', phone: '', remark: '',
  is_vip: false,
  invoice_contact: '', invoice_phone: '', invoice_address: '', invoice_zip: '',
  company_name: ''
});

Page({
  data: {
    mode: 'existing',          // 'existing' 已有客户 | 'new' 新客户建档
    directMinKg: config.DIRECT_MIN_WEIGHT_KG,  // 单独地址发货最低重量门槛
    keyword: '',
    results: [],
    showResults: false,
    searching: false,
    searched: false,
    selected: null,
    agreed: false,
    submitting: false,
    bound: false,
    profile: null,
    result: null,
    // 新客户表单
    nc: emptyForm(),
    canSubmit: false,
    submitText: '提交绑定申请',
    tplLine1: '',
    tplLine2: ''
  },

  async onLoad() {
    try {
      const profile = await app.refreshProfile(false);
      this.setData({ profile, bound: auth.isBound(profile) });
    } catch (err) {
      fmt.showError(err);
    }
  },

  onUnload() {
    // E-09：搜索防抖定时器必须清理
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  },

  // ---------- 模式切换 ----------
  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this.setData({ mode, result: null });
    this._recalc();
  },

  // ---------- 已有客户：搜索 + 下拉 ----------
  onKeywordInput(e) {
    const v = String(e.detail.value || '').trim();
    this.setData({ keyword: v, selected: null, showResults: false });
    if (this._timer) clearTimeout(this._timer);
    if (!v) {
      this.setData({ results: [], searched: false, searching: false });
      return;
    }
    this._timer = setTimeout(() => this.search(v), config.SEARCH_DEBOUNCE_MS);
  },

  async search(keyword) {
    this.setData({ searching: true });
    try {
      const res = await client.searchCustomers(keyword);
      const list = (res && res.list) || [];
      this.setData({ results: list, showResults: true, searching: false, searched: true });
    } catch (err) {
      this.setData({ results: [], showResults: true, searching: false, searched: true });
      fmt.showError(err);
    }
  },

  onPickCustomer(e) {
    const id = Number(e.currentTarget.dataset.id);
    const hit = this.data.results.find((r) => Number(r.id) === id);
    if (!hit) return;
    this.setData({ selected: hit, showResults: false, keyword: hit.name });
    this._recalc();   // 选中后重算 canSubmit，否则按钮一直禁用
  },

  onClearSelection() {
    this.setData({ selected: null, keyword: '', results: [], showResults: false, searched: false });
    this._recalc();   // 取消选择后重算，按钮回到禁用
  },

  // ---------- 新客户：表单 ----------
  onNewInput(e) {
    const field = e.currentTarget.dataset.field;
    const v = String(e.detail.value || '');
    this.setData({ ['nc.' + field]: v });
    this._recalc();
  },

  onToggleSolo(e) {
    // switch 的 bindchange 带布尔值；整行 bindtap 不带值则翻转当前状态
    const v = (typeof e.detail.value === 'boolean') ? e.detail.value : !this.data.nc.is_vip;
    this.setData({ 'nc.is_vip': v });
    this._recalc();
  },

  noop() {},

  // 组装电商平台收货地址模板文本（含占位符兜底）
  _buildTemplate(nc) {
    const W = config.WAREHOUSE;
    const ph = (v, p) => '【' + ((v && v.trim()) ? v.trim() : p) + '】';
    const line1 = W.address + '  ' + W.company + '  ' +
      ph(nc.name, '客户名') + ph(nc.address, '收货地址') + ph(nc.zip_code, '邮编');
    const line2 = W.contact + '  ' + W.phone;
    return line1 + '\n' + line2;
  },

  // 实时计算：提交可用性、按钮文案、模板预览
  _recalc() {
    const nc = this.data.nc;
    const name = nc.name.trim();
    const zip = nc.zip_code.trim();
    const addr = nc.address.trim();
    let canSubmit = false;
    if (this.data.mode === 'existing') {
      canSubmit = !!this.data.selected;
    } else {
      canSubmit = name && zip && addr &&
        (!nc.is_vip || (nc.invoice_contact.trim() && nc.invoice_address.trim() && nc.invoice_zip.trim()));
    }
    const txt = this._buildTemplate(nc).split('\n');
    this.setData({
      canSubmit,
      submitText: this.data.mode === 'new' ? '提交建档并绑定' : '提交绑定申请',
      tplLine1: txt[0],
      tplLine2: txt[1]
    });
  },

  onCopyTemplate() {
    const text = this._buildTemplate(this.data.nc);
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '地址模板已复制', icon: 'success' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
    });
  },

  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  // ---------- 提交 ----------
  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意说明', icon: 'none' });
      return;
    }
    if (this.data.mode === 'existing') {
      return this._submitExisting();
    }
    return this._submitNew();
  },

  async _submitExisting() {
    if (!this.data.selected) {
      wx.showToast({ title: '请先搜索并选择客户名', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const res = await client.bind({ customer_id: this.data.selected.id });
      auth.clearProfileCache();
      app.globalData.profile = null;
      app.globalData.lastHomeRefreshAt = 0;
      this.setData({ result: res, submitting: false });
      wx.showToast({ title: '已提交，等待仓库审核', icon: 'none' });
    } catch (err) {
      this.setData({ submitting: false });
      fmt.showError(err);
    }
  },

  async _submitNew() {
    const nc = this.data.nc;
    if (!nc.name.trim()) { wx.showToast({ title: '请填写客户名', icon: 'none' }); return; }
    if (!nc.zip_code.trim()) { wx.showToast({ title: '请填写收货邮编', icon: 'none' }); return; }
    if (!nc.address.trim()) { wx.showToast({ title: '请填写收货地址', icon: 'none' }); return; }
    if (nc.is_vip) {
      if (!nc.invoice_contact.trim()) { wx.showToast({ title: '单独发货请填写收货人姓名', icon: 'none' }); return; }
      if (!nc.invoice_address.trim()) { wx.showToast({ title: '单独发货请填写详细地址', icon: 'none' }); return; }
      if (!nc.invoice_zip.trim()) { wx.showToast({ title: '单独发货请填写详细地址邮编', icon: 'none' }); return; }
    }
    this.setData({ submitting: true });
    try {
      const payload = {
        name: nc.name.trim(),
        zip_code: nc.zip_code.trim(),
        address: nc.address.trim(),
        phone: nc.phone.trim(),
        remark: nc.remark.trim(),
        is_vip: nc.is_vip,
        invoice_contact: nc.invoice_contact.trim(),
        invoice_phone: nc.invoice_phone.trim(),
        invoice_address: nc.invoice_address.trim(),
        invoice_zip: nc.invoice_zip.trim(),
        company_name: nc.company_name.trim()
      };
      const res = await client.clientRegister(payload);
      auth.clearProfileCache();
      app.globalData.profile = null;
      app.globalData.lastHomeRefreshAt = 0;
      this.setData({ result: res, submitting: false });
      wx.showToast({ title: '已建档，等待仓库审核', icon: 'none' });
    } catch (err) {
      this.setData({ submitting: false });
      fmt.showError(err);
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
