// packageAdmin/batch-bill —— 管理端：批次账单独立页（分普/敏、按客户逐组结清、可改计费重、可派发）
const client = require('../../services/client');
const fmt = require('../../utils/format');
const auth = require('../../utils/auth');
const config = require('../../utils/config');

Page({
  data: {
    batchId: 0,
    batchNo: '',
    loading: true,
    currency: config.CURRENCY_SYMBOL,
    items: [],
    filteredItems: [],
    filterMode: 'all',   // all | unpaid | paid
    keyword: '',
    totals: { normal_pending: 0, sensitive_pending: 0, paid_total: 0, pending_total: 0 },
    dispatched: false,
    dispatched_at: '',
    dim: { pushed: false, pushed_at: '', all_confirmed: false, confirmed_count: 0, total: 0, confirms: [] },
    dimBlocked: false
  },

  onLoad(options) {
    const bid = Number(options.batch_id) || 0;
    this.setData({ batchId: bid });
    // 白名单即管理员：角色守卫，密码解锁已下线
    auth.guardAdminPage().then((ok) => { if (ok) this.load(); });
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  // 按 筛选(全部/未付款/已付款) + 客户名搜索 过滤
  _applyFilter(items) {
    const mode = this.data.filterMode;
    const kw = (this.data.keyword || '').trim().toLowerCase();
    return items.filter((it) => {
      if (mode === 'unpaid' && !(it.pending_total > 0)) return false;
      if (mode === 'paid' && !(it.paid_total > 0)) return false;
      if (kw && (it.name || '').toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
  },

  onFilterTap(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ filterMode: mode });
    this.setData({ filteredItems: this._applyFilter(this.data.items) });
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
    this.setData({ filteredItems: this._applyFilter(this.data.items) });
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await client.adminBatchBill(this.data.batchId);
      // 重量展示：实重 1 位、体积重 3 位、计费重（可编辑，显示在输入框）
      const wdisp = (g) => {
        const w = Number(g.weight || 0), vw = Number(g.volume_weight || 0);
        if (w <= 0 && vw <= 0) return '';
        return '实重 ' + w.toFixed(1) + 'kg · 体积重 ' + vw.toFixed(3) + 'kg';
      };
      // 尺寸明细行：如「2-1  32*11*11」= 共2件中的第1件
      const dimsLines = (g) => (g.dims || []).map((d, i) => g.count + '-' + (i + 1) + '  ' + d);
      const cardTotal = (it) => Math.round(
        (Number(it.normal.pending_freight || 0) + Number(it.sensitive.pending_freight || 0)) * 100) / 100;
      const items = ((res && res.items) || []).map((it) => ({
        ...it,
        item_total: cardTotal(it),
        normal_weight_display: wdisp(it.normal || {}),
        sensitive_weight_display: wdisp(it.sensitive || {}),
        normal_dims: dimsLines(it.normal || {}),
        sensitive_dims: dimsLines(it.sensitive || {})
      }));
      this.setData({
        loading: false,
        batchNo: (res && res.batch_no) || '',
        items,
        filteredItems: this._applyFilter(items),
        totals: (res && res.totals) || { normal_pending: 0, sensitive_pending: 0, paid_total: 0, pending_total: 0 },
        dispatched: !!(res && res.dispatched),
        dispatched_at: (res && res.dispatched_at) || '',
        dim: (res && res.dim) || { pushed: false, pushed_at: '', all_confirmed: false, confirmed_count: 0, total: 0, confirms: [] },
        dimBlocked: !!(res && res.dim && res.dim.pushed && !res.dim.all_confirmed)
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  // 实时重算：编辑计费重 → 该组运费总额变化，待付 = 总额 - 已付部分
  _recomputeGroup(items, idx, nature, freightTotal) {
    const g = items[idx][nature];
    const paid = Number(g.paid_freight || 0);
    return Math.max(0, Math.round((freightTotal - paid) * 100) / 100);
  },

  // 由 customer_id 定位其在 this.data.items 中的真实下标。
  // 关键修复：列表用筛选后（filteredItems）遍历，data-idx 是「可见下标」，
  // 但数据存于 items；直接用 data-idx 读写 items 会在筛选/搜索后错位（改到别的客户）。
  // 统一以 customer_id 反查，避免下标错位导致的「失灵」。
  _realIdx(cid, fallbackIdx) {
    if (cid) {
      const i = this.data.items.findIndex((it) => it.customer_id === Number(cid));
      if (i >= 0) return i;
    }
    return fallbackIdx;
  },

  // 输入即按单价实时重算运费（不落库，失焦才保存）
  // 注意：绝不 setData 回 chargeable，否则输入「8.」会被重置成 8（受控 input 经典问题）。
  onChargeableInput(e) {
    const nature = e.currentTarget.dataset.nature;
    const cid = e.currentTarget.dataset.cid;
    const idx = this._realIdx(cid, Number(e.currentTarget.dataset.idx));
    if (idx < 0) return;
    let val = parseFloat(e.detail.value);
    if (isNaN(val) || val < 0) val = 0;
    const g = this.data.items[idx][nature];
    const freightTotal = Math.round(val * g.rate * 100) / 100;
    const pending = this._recomputeGroup(this.data.items, idx, nature, freightTotal);
    const it = this.data.items[idx];
    const other = nature === 'normal' ? 'sensitive' : 'normal';
    const total = (nature === 'normal' ? pending : Number(it[other].pending_freight || 0)) +
      (nature === 'sensitive' ? pending : Number(it[other].pending_freight || 0));
    const updates = {};
    updates['items[' + idx + '].' + nature + '.freight'] = freightTotal;
    updates['items[' + idx + '].' + nature + '.pending_freight'] = pending;
    updates['items[' + idx + '].item_total'] = Math.round(total * 100) / 100;
    this.setData(updates);
    this._recalcTotals(this.data.items);
    this.setData({ totals: this.data.totals, filteredItems: this._applyFilter(this.data.items) });
  },

  // 失焦保存：写入手动计费重覆盖（空值=恢复系统计算值）
  // 数字保存走「局部路径更新」——不转圈、不重建列表，页面不会跳回顶部；
  // 只有清空恢复系统值（前端没有系统计算值，需后端重算）才整页重载。
  onChargeableBlur(e) {
    const nature = e.currentTarget.dataset.nature;
    const cid = Number(e.currentTarget.dataset.cid);
    const idx = this._realIdx(cid, Number(e.currentTarget.dataset.idx));
    if (idx < 0) return;
    const raw = (e.detail.value || '').trim();
    const val = raw === '' ? null : parseFloat(raw);
    if (val !== null && (isNaN(val) || val < 0)) {
      wx.showToast({ title: '计费重无效', icon: 'none' });
      this.load();
      return;
    }
    client.adminFreightOverride(this.data.batchId, cid, nature, val)
      .then((res) => {
        // 清空 → 恢复系统值，必须整页重载才能拿到后端算出的计费重/运费
        if (val === null) {
          this.load();
          return;
        }
        // 数字保存：用返回的有效计费重局部更新，不打断当前浏览位置
        // 后端返回字段名为 chargeable（与 bill 接口一致）
        const eff = (res && res.chargeable != null) ? Number(res.chargeable) : val;
        const rate = this.data.items[idx][nature].rate;
        const freightTotal = Math.round(eff * rate * 100) / 100;
        const pending = this._recomputeGroup(this.data.items, idx, nature, freightTotal);
        const it = this.data.items[idx];
        const other = nature === 'normal' ? 'sensitive' : 'normal';
        const total = (nature === 'normal' ? pending : Number(it[other].pending_freight || 0)) +
          (nature === 'sensitive' ? pending : Number(it[other].pending_freight || 0));
        const updates = {
          ['items[' + idx + '].' + nature + '.chargeable']: eff,
          ['items[' + idx + '].' + nature + '.freight']: freightTotal,
          ['items[' + idx + '].' + nature + '.pending_freight']: pending,
          ['items[' + idx + '].item_total']: Math.round(total * 100) / 100
        };
        this.setData(updates);
        this._recalcTotals(this.data.items);
        this.setData({ totals: this.data.totals, filteredItems: this._applyFilter(this.data.items) });
        wx.showToast({ title: '已保存', icon: 'none' });
      })
      .catch((err) => { fmt.showError(err); this.load(); });
  },

  _recalcTotals(items) {
    let n = 0, s = 0, np = 0, sp = 0;
    for (const it of items) {
      n += Number(it.normal.pending_freight || 0);
      s += Number(it.sensitive.pending_freight || 0);
      np += Number(it.normal.paid_freight || 0);
      sp += Number(it.sensitive.paid_freight || 0);
    }
    this.data.totals.normal_pending = Math.round(n * 100) / 100;
    this.data.totals.sensitive_pending = Math.round(s * 100) / 100;
    this.data.totals.paid_total = Math.round((np + sp) * 100) / 100;
    this.data.totals.pending_total = Math.round((n + s) * 100) / 100;
  },

  // 按客户结清：标记该客户在本批次普+敏全部未付款订单（已付过的不动）
  async onSettle(e) {
    const cid = Number(e.currentTarget.dataset.cid);
    const bid = this.data.batchId;
    const item = this.data.items.find((it) => it.customer_id === cid);
    const due = item ? (Number(item.normal.pending_freight || 0) + Number(item.sensitive.pending_freight || 0)) : 0;
    if (due <= 0) {
      wx.showToast({ title: '该客户在本批次没有待付运费', icon: 'none' });
      return;
    }
    const okgo = await new Promise((resolve) => {
      wx.showModal({
        title: '确认结清该客户',
        content: '将把「' + (item ? item.name : '客户') + '」在本批次的未付款订单标记为已付款（合计 ¥' +
          due.toFixed(2) + '），已付过的不受影响。',
        success: (r) => resolve(r.confirm)
      });
    });
    if (!okgo) return;
    wx.showLoading({ title: '处理中' });
    try {
      const res = await client.adminBatchCustomerSettleFreight(bid, cid, undefined);
      const n = (res && res.settled_count) || 0;
      wx.showToast({ title: '已结清 ' + n + ' 件', icon: 'none' });
      this.load();
    } catch (err) {
      fmt.showError(err);
    } finally {
      wx.hideLoading();
    }
  },

  // 派发 / 撤回派发 账单给客户端：已派发时按钮变「撤回派发」，可随时回退
  async onDispatch() {
    const dispatched = this.data.dispatched;
    // 门控：已推送尺寸信息但尚有客户未确认 → 禁止派发（与后端双重保险）
    if (!dispatched && this.data.dimBlocked) {
      wx.showToast({ title: '尚有客户未确认尺寸信息', icon: 'none' });
      return;
    }
    const okgo = await new Promise((resolve) => {
      wx.showModal({
        title: dispatched ? '撤回派发' : '派发账单',
        content: dispatched
          ? '撤回后客户端将立即看不到本批次账单与运费（仍可再次派发）。是否继续？'
          : '派发后客户端即可在「我的账单」查看本批次账单（含当前手动调整的计费重与运费）。是否继续？',
        confirmText: dispatched ? '撤回' : '派发',
        success: (r) => resolve(r.confirm)
      });
    });
    if (!okgo) return;
    wx.showLoading({ title: dispatched ? '撤回中' : '派发中' });
    try {
      if (dispatched) {
        await client.adminRecallBill(this.data.batchId);
        wx.showToast({ title: '已撤回', icon: 'none' });
      } else {
        await client.adminDispatchBill(this.data.batchId);
        wx.showToast({ title: '已派发', icon: 'success' });
      }
      this.load();
    } catch (err) {
      fmt.showError(err);
    } finally {
      wx.hideLoading();
    }
  },

  // 推送 / 撤回推送 批次尺寸信息给客户（确认完才允许派发账单）
  async onPushDims() {
    if (this.data.dim.pushed) {
      const okgo = await new Promise((resolve) => {
        wx.showModal({
          title: '撤回推送',
          content: '撤回后客户端将看不到尺寸信息（已确认状态保留，可再次推送）。是否继续？',
          confirmText: '撤回',
          success: (r) => resolve(r.confirm)
        });
      });
      if (!okgo) return;
      wx.showLoading({ title: '撤回中' });
      try {
        const d = await client.adminRecallDims(this.data.batchId);
        this.setData({ dim: d, dimBlocked: false });
        wx.showToast({ title: '已撤回', icon: 'none' });
      } catch (err) { fmt.showError(err); } finally { wx.hideLoading(); }
      return;
    }
    const okgo = await new Promise((resolve) => {
      wx.showModal({
        title: '推送尺寸信息',
        content: '将把本批次各包裹的尺寸（长宽高）推送给相关客户，客户需在「尺寸确认」中点「确认尺寸无误」后，才能派发账单。是否推送？',
        confirmText: '推送',
        success: (r) => resolve(r.confirm)
      });
    });
    if (!okgo) return;
    wx.showLoading({ title: '推送中' });
    try {
      const d = await client.adminPushDims(this.data.batchId);
      this.setData({
        dim: d,
        dimBlocked: !!(d && d.pushed && !d.all_confirmed)
      });
      wx.showToast({ title: '已推送', icon: 'success' });
    } catch (err) { fmt.showError(err); } finally { wx.hideLoading(); }
  }
});
