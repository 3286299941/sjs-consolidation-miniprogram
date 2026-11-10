// packageAdmin/customers —— 客户总览 / 意向池
// 2026-11-06：筛选项只保留「按邮编」；默认隐藏没有任何入库/发货记录的客户，
// 这批客户统一放进「意向池」，一旦有货物入库会被动态 SQL 自动摘出，无需标记。
const client = require('../../services/client');
const fmt = require('../../utils/format');
const auth = require('../../utils/auth');
const config = require('../../utils/config');

const PAGE_SIZE = 30;

function avatarOf(name) {
  if (!name) return '?';
  return String(name).trim().charAt(0).toUpperCase();
}

const EMPTY_FORM = {
  name: '', zip_code: '', address: '', phone: '',
  remark: '', is_vip: false, invoice_contact: ''
};

Page({
  data: {
    currency: config.CURRENCY_SYMBOL,
    poolMode: false,
    zipList: [],            // [{zip, n}]
    zipFilter: '',
    batchLoaded: false,
    keyword: '',
    list: [],
    view: [],
    page: 1,
    total: 0,
    hasMore: false,
    loading: false,
    summary: { active_total: 0, pool_count: 0, total: 0, bound: 0, pending_audit: 0 },
    weekLabel: '',
    formOpen: false,
    submitting: false,
    form: Object.assign({}, EMPTY_FORM)
  },

  onLoad(options) {
    const pool = !!(options && options.pool === '1');
    this.setData({ poolMode: pool });
    wx.setNavigationBarTitle({ title: pool ? '意向池' : '客户总览' });
  },

  onShow() {
    auth.guardAdminPage().then((ok) => {
      if (!ok) return;
      if (!this.data.batchLoaded) this.loadBatches();
      this.load(true);
    });
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.load(false);
    }
  },

  // 只取批次列表用于生成「邮编」筛选 chips
  async loadBatches() {
    try {
      const res = await client.adminGetBatches();
      const zmap = {};
      ((res && res.list) || []).forEach((b) => {
        const z = String(b.zip_code || '未知');
        if (!zmap[z]) zmap[z] = { zip: z, n: 0 };
        zmap[z].n += 1;
      });
      const zipList = Object.keys(zmap)
        .sort((a, b) => zmap[b].n - zmap[a].n)
        .map((z) => zmap[z]);
      this.setData({ zipList, batchLoaded: true });
    } catch (err) {
      fmt.showError(err);
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.load(true);
  },

  onZipTap(e) {
    const zip = e.currentTarget.dataset.zip;
    this.setData({ zipFilter: this.data.zipFilter === zip ? '' : zip });
    this.load(true);
  },

  onTogglePool() {
    const pool = !this.data.poolMode;
    this.setData({ poolMode: pool, keyword: '', zipFilter: '' });
    wx.setNavigationBarTitle({ title: pool ? '意向池' : '客户总览' });
    this.load(true);
  },

  async load(isRefresh) {
    if (this.data.loading) return;
    if (isRefresh) this.setData({ page: 1, hasMore: false, loading: true });
    else this.setData({ loading: true });
    try {
      const params = {
        keyword: String(this.data.keyword).trim(),
        page: this.data.page,
        size: PAGE_SIZE,
        pool: this.data.poolMode ? 1 : 0
      };
      if (this.data.zipFilter) params.zip_code = this.data.zipFilter;
      const res = await client.adminCustomers(params);
      const rows = ((res && res.list) || []).map((r) => this.decorate(r));
      const merged = isRefresh ? rows : this.data.list.concat(rows);
      this.setData({
        list: merged,
        view: merged,
        total: (res && res.total) || 0,
        hasMore: !!(res && res.has_more),
        summary: (res && res.summary) || this.data.summary,
        weekLabel: (res && res.week_label) || '',
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  decorate(r) {
    const out = Object.assign({}, r);
    out.avatar = avatarOf(r.name);
    out.freight_display = Number(r.pending_freight || 0).toFixed(2);
    out.bind_class = r.bound ? 'tag-green'
      : r.bind_status === 1 ? 'tag-orange'
      : r.bind_status === 3 ? 'tag-red' : 'tag-gray';
    const wi = r.week_intent || {};
    out.intent_label = wi.locked ? '已锁定' : (wi.confirmed ? '已确认' : '未确认');
    out.intent_class = wi.locked ? 'tag-blue' : (wi.confirmed ? 'tag-green' : 'tag-gray');
    return out;
  },

  onClearKeyword() {
    this.setData({ keyword: '', zipFilter: '' });
    this.load(true);
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageAdmin/customer-detail/customer-detail?id=' + id });
  },

  noop() {},

  // ---------- 新建客户（写系统 customers 表，与系统端同步） ----------
  onToggleForm() {
    this.setData({ formOpen: !this.data.formOpen, form: Object.assign({}, EMPTY_FORM) });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onVipChange(e) {
    this.setData({ 'form.is_vip': !!e.detail.value });
  },

  async onCreateCustomer() {
    if (this.data.submitting) return;
    const f = this.data.form;
    if (!String(f.name).trim()) {
      wx.showToast({ title: '请填写客户名', icon: 'none' });
      return;
    }
    if (!String(f.address).trim()) {
      wx.showToast({ title: '请填写收货地址', icon: 'none' });
      return;
    }
    if (f.is_vip && !String(f.invoice_contact).trim()) {
      wx.showToast({ title: 'VIP 请填发票联系人', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await client.adminCreateCustomer({
        name: String(f.name).trim(),
        address: String(f.address).trim(),
        zip_code: String(f.zip_code).trim(),
        phone: String(f.phone).trim(),
        remark: String(f.remark).trim(),
        is_vip: f.is_vip ? 1 : 0,
        invoice_contact: String(f.invoice_contact).trim()
      });
      wx.showToast({ title: '已创建，系统同步', icon: 'none' });
      this.setData({ formOpen: false, submitting: false, form: Object.assign({}, EMPTY_FORM) });
      this.load(true);
    } catch (err) {
      this.setData({ submitting: false });
      fmt.showError(err);
    }
  },

  // ---------- 删除客户（仅意向池客户，服务端复用系统端校验） ----------
  onDeleteCustomer(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除客户',
      content: '确认删除「' + name + '」？与系统端一致：只有没有任何入库/打包/运费记录的客户才能删除，删除后系统端同步生效。',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '删除中' });
        try {
          await client.adminDeleteCustomer(Number(id));
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'none' });
          this.load(true);
        } catch (err) {
          wx.hideLoading();
          fmt.showError(err);
        }
      }
    });
  }
});
