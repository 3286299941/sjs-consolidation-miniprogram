// packageClient/batch-bill —— 客户端：查看已派发的批次账单（只读）
const client = require('../../services/client');
const fmt = require('../../utils/format');
const config = require('../../utils/config');

Page({
  data: {
    batchId: 0,
    batchNo: '',
    dispatched: false,
    dispatched_at: '',
    loading: true,
    currency: config.CURRENCY_SYMBOL,
    items: [],
    total_freight: 0,
    paid_total: 0,
    total_pending: 0
  },

  onLoad(options) {
    this.setData({ batchId: Number(options.batch_id) || 0 });
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await client.getBatchBill(this.data.batchId);
      if (!res || !res.dispatched) {
        this.setData({ loading: false, dispatched: false });
        return;
      }
      const items = (res.items || []).map((it) => ({
        ...it,
        nature: it.nature,
        weight: Number(it.weight).toFixed(1),
        volume_weight: Number(it.volume_weight).toFixed(3),
        chargeable: Number(it.chargeable).toFixed(1)
      }));
      this.setData({
        loading: false,
        dispatched: true,
        batchNo: res.batch_no || '',
        dispatched_at: res.dispatched_at || '',
        items,
        total_freight: res.total_freight || 0,
        paid_total: items.reduce((s, x) => s + Number(x.paid_freight || 0), 0),
        total_pending: res.total_pending || 0
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  }
});
