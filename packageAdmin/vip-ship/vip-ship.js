// packageAdmin/vip-ship —— 管理端：VIP 单独发货记录
// 逻辑同批次管理：每位 VIP 客户「当天」的单独发货件自动归为一个 VIP 批次，
// 与常规批次完全一致（可建账单、可更轨迹）。本页即 VIP 批次列表，点卡片进账单。
const client = require('../../services/client');
const fmt = require('../../utils/format');
const auth = require('../../utils/auth');
const config = require('../../utils/config');

Page({
  data: {
    list: [],
    loading: true,
    keyword: '',
    searching: false
  },

  onShow() {
    // 白名单即管理员：角色守卫
    auth.guardAdminPage().then((ok) => { if (ok) this.load(); });
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await client.adminGetBatches({ vip: 1, size: 200 });
      const all = ((res && res.list) || []).map((b) => {
        // 卡片标题：客户名 + 日期（YY-MM-DD）+ 总箱数，如「东 26-10-21 · 3箱」
        const day = String(b.vip_day || '');
        const dayShort = day.length >= 10 ? day.slice(2).replace(/-/g, '-') : day;
        return Object.assign({}, b, {
          title: (b.customer_name || 'VIP') + ' ' + (dayShort || '——') + ' · ' + (b.package_total || 0) + '箱'
        });
      });
      this._raw = all;
      this.setData({ list: this._filter(all), loading: false });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  _filter(all) {
    const kw = String(this.data.keyword || '').trim().toLowerCase();
    if (!kw) return all;
    return all.filter((b) =>
      (b.customer_name || '').toLowerCase().includes(kw) ||
      (b.customer_no || '').toLowerCase().includes(kw) ||
      (b.batch_no || '').toLowerCase().includes(kw));
  },

  onSearchInput(e) {
    const v = String(e.detail.value || '').trim();
    this.setData({ keyword: v });
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.setData({ list: this._filter(this._all()) }), config.SEARCH_DEBOUNCE_MS || 400);
  },

  // 缓存全量以便搜索客户端过滤
  _all() {
    // load() 已把全量存在 list，但搜索时需保留原始全量：存一份到 _raw
    return this._raw || this.data.list;
  },

  onClearSearch() {
    this.setData({ keyword: '', list: this._raw || this.data.list });
  },

  // 进入批次账单（与常规批次一致：分普/敏、按客户逐组结清）
  goBill(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageAdmin/batch-bill/batch-bill?batch_id=' + id });
  },

  // 进入批次物流轨迹
  goTracks(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageAdmin/tracks/tracks?id=' + id });
  }
});
