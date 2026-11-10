// packageClient/dim-confirm —— 客户端：尺寸信息确认（管理端推送后，客户核对包裹尺寸）
const client = require('../../services/client');
const fmt = require('../../utils/format');
const config = require('../../utils/config');

Page({
  data: {
    loading: true,
    list: [],
    currency: config.CURRENCY_SYMBOL,
    currentBid: 0,
    current: null,        // { batch_no, confirmed, confirmed_at, packages:[] }
    detailLoading: false
  },

  onShow() { this.load(); },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await client.clientDimConfirms();
      const list = ((res && res.items) || []).map((it) => ({
        ...it,
        pushed_at_disp: (it.pushed_at || '').slice(0, 10)
      }));
      const cb = this.data.currentBid;
      const still = cb && list.find((x) => x.batch_id === cb);
      this.setData({
        loading: false,
        list,
        currentBid: still ? cb : 0,
        current: still ? this.data.current : null
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  async onTapBatch(e) {
    const bid = Number(e.currentTarget.dataset.bid);
    if (this.data.currentBid === bid) {
      this.setData({ currentBid: 0, current: null });
      return;
    }
    this.setData({ currentBid: bid, detailLoading: true, current: null });
    try {
      const d = await client.clientBatchDims(bid);
      if (!d || !d.pushed) {
        this.setData({ currentBid: 0, current: null });
        wx.showToast({ title: '该批次尺寸尚未推送', icon: 'none' });
        return;
      }
      const packages = (d.packages || []).map((p) => ({
        ...p,
        natureLabel: p.nature === 'sensitive' ? '敏货' : '普货',
        dimText: (p.length != null && p.width != null && p.height != null)
          ? (p.length + ' × ' + p.width + ' × ' + p.height + ' cm')
          : '—',
        weightText: (p.weight != null ? p.weight.toFixed(1) : '0') + 'kg',
        vwText: (p.volume_weight != null ? p.volume_weight.toFixed(3) : '0') + 'kg'
      }));
      this.setData({
        detailLoading: false,
        current: {
          batch_no: d.batch_no,
          confirmed: d.confirmed,
          confirmed_at: d.confirmed_at,
          packages
        }
      });
    } catch (err) {
      this.setData({ detailLoading: false });
      fmt.showError(err);
    }
  },

  async onConfirm(e) {
    const bid = Number(e.currentTarget.dataset.bid);
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '确认尺寸无误',
        content: '确认后该批次尺寸信息即视为核对无误，管理端随后方可派发账单。',
        success: (r) => resolve(r.confirm)
      });
    });
    if (!ok) return;
    wx.showLoading({ title: '确认中' });
    try {
      await client.clientConfirmDims(bid);
      wx.showToast({ title: '已确认', icon: 'success' });
      this.setData({ current: Object.assign({}, this.data.current, { confirmed: true, confirmed_at: '刚刚' }) });
      this.load();
    } catch (err) {
      fmt.showError(err);
    } finally {
      wx.hideLoading();
    }
  }
});
