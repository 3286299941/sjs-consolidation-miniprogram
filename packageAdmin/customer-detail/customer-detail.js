// packageAdmin/customer-detail —— 按客户查看包裹 + 代客操作
// 包裹三态与客户端「我的货物」完全同一套后端实现（_shipments_payload）；
// 代客确认发货 / 取消确认与客户端 confirm-ship / confirm-cancel 同一实现与约束。
const client = require('../../services/client');
const fmt = require('../../utils/format');
const auth = require('../../utils/auth');
const config = require('../../utils/config');

const TABS = [
  { key: 'pending', label: '待发货' },
  { key: 'packed', label: '已打包' },
  { key: 'shipped', label: '已发货' }
];

const DELIVERY_OPTIONS = [
  { key: 'pooled', label: '拼邮（随批次发货）' },
  { key: 'direct', label: '单独地址（VIP 直发）' },
  { key: 'none', label: '本周暂不发货' }
];

const SCOPE_OPTIONS = [
  { key: 'all', label: '全部货物' },
  { key: 'normal_only', label: '只发普货' },
  { key: 'sensitive_only', label: '只发敏货' }
];

Page({
  data: {
    currency: config.CURRENCY_SYMBOL,
    cid: 0,
    customer: null,
    tabs: TABS,
    tab: 'pending',
    list: [],
    total: 0,
    page: 1,
    hasMore: false,
    loading: false,
    keyword: '',
    pendingFreight: 0,
    weekIntent: null,
    // —— 运费收款 / 明细 ——
    freightDetailOpen: false,
    freightItems: [],
    freightTotal: 0,
    settling: false,
    // —— 优惠券 ——
    // —— 优惠券 ——
    couponFormOpen: false,
    couponForm: { ctype: 'amount', value: '', note: '', expire_days: 30 },
    coupons: [],
    couponBusy: false,
    // —— 代客确认面板 ——
    panelOpen: false,
    submitting: false,
    deliveryOptions: DELIVERY_OPTIONS,
    scopeOptions: SCOPE_OPTIONS,
    deliveryType: 'pooled',
    cargoScope: 'all',
    candidates: [],
    selectedIds: {},
    selectedCount: 0,
    remark: '',
    address: { name: '', phone: '', line: '', zip: '' }
  },

  onLoad(options) {
    this.setData({ cid: Number(options.id) || 0 });
  },

  onShow() {
    // 白名单即管理员：角色守卫，密码解锁已下线
    auth.guardAdminPage().then((ok) => { if (ok) this.load(true); });
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

  async load(isRefresh) {
    if (this.data.loading) return;
    if (isRefresh) this.setData({ page: 1, hasMore: false, list: [] });
    this.setData({ loading: true });
    try {
      const res = await client.adminCustomerPackages(this.data.cid, {
        tab: this.data.tab,
        keyword: String(this.data.keyword).trim(),
        page: this.data.page,
        size: 20
      });
      const rows = ((res && res.list) || []).map((item) => this.decorate(item));
      const merged = isRefresh ? rows : this.data.list.concat(rows);
      this.setData({
        list: merged,
        total: (res && res.total) || 0,
        hasMore: merged.length < ((res && res.total) || 0),
        loading: false,
        customer: (res && res.customer) || this.data.customer,
        pendingFreight: Number((res && res.pending_freight) || 0)
      });
      if (isRefresh) this.loadIntent();
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  // 本周确认状态：pending 列表即候选，从意向接口没有客户维度单查，
  // 这里用 pending_freight + confirm-candidates 的意图信息由代客面板补齐；
  // 简化：用客户列表接口同一周确认字段不单独请求，改由面板打开时获取。
  async loadIntent() {
    // 无独立的按客户周确认查询接口：面板打开时会拉取候选并显示锁定状态
  },

  decorate(item) {
    const tab = this.data.tab;
    const out = Object.assign({}, item);
    if (tab === 'pending') {
      out.entry_time_display = fmt.formatTime(item.entry_time);
      out.stage = item.stage || '待发货';
      out.is_packing = out.stage === '打包中';
      return out;
    }
    out.package_label = item.package_label || ('包裹 #' + item.id);
    out.item_count_display = (item.item_count === null || item.item_count === undefined)
      ? '—' : item.item_count;
    out.time_label = tab === 'packed' ? '打包于' : '发货于';
    out.time_display = fmt.formatTime(item.time_at);
    out.nature_display = item.nature_display || '';
    out.nature_class = out.nature_display === '普货' ? 'tag-green'
      : out.nature_display === '敏货' ? 'tag-orange' : 'tag-gray';
    out.box_type = item.is_full_box ? '整箱' : '拼箱';
    if (tab === 'shipped') {
      const cw = item.chargeable_weight;
      out.chargeable_display = (cw === null || cw === undefined) ? '—' : Number(cw).toFixed(1);
      out.freight_display = (item.freight === null || item.freight === undefined)
        ? '—' : Number(item.freight).toFixed(2);
      // 「已付款」手动标记
      out.freight_paid = !!item.freight_paid;
      out.freight_paid_by = item.freight_paid_by || '';
      out.freight_paid_at_short = (item.freight_paid_at || '').substring(0, 10);
      const aw = item.actual_weight;
      const vw = item.volume_weight;
      out.actual_display = (aw === null || aw === undefined) ? '—' : Number(aw).toFixed(2);
      out.volume_display = (vw === null || vw === undefined) ? '—' : Number(vw).toFixed(2);
      out.by_volume = (vw !== null && vw !== undefined && aw !== null && aw !== undefined
        && Number(vw) > Number(aw));
    }
    out.dimension_display = String(item.dimension_display || '').trim();
    out.has_dimension = !!out.dimension_display;
    out.expanded = false;
    out.items = (item.items || []).map((it) => ({
      id: it.id,
      tracking_number: String(it.tracking_number || '').trim() || '—'
    }));
    out.items_count = out.items.length;
    out.fold_label = '内含 ' + out.items_count + ' 个单号';
    return out;
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.tab) return;
    this.setData({ tab: key, keyword: '', page: 1, list: [], total: 0, hasMore: true });
    this.load(true);
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.load(true);
  },

  onToggleExpand(e) {
    const id = Number(e.currentTarget.dataset.id);
    const index = this.data.list.findIndex((row) => Number(row.id) === id);
    if (index < 0) return;
    const patch = {};
    patch['list[' + index + '].expanded'] = !this.data.list[index].expanded;
    this.setData(patch);
  },

  // —— 代客确认发货 ——
  async openPanel() {
    this.setData({ panelOpen: true, candidates: [], submitting: false });
    try {
      const res = await client.adminCustomerPackages(this.data.cid, { tab: 'pending', size: 50 });
      const candidates = ((res && res.list) || []).map((p) => ({
        id: p.id,
        tracking_number: p.tracking_number,
        is_packing: p.stage === '打包中',
        checked: false
      }));
      this.setData({ candidates });
    } catch (err) {
      fmt.showError(err);
    }
  },

  closePanel() {
    this.setData({ panelOpen: false });
  },

  noop() {},

  onDeliveryTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ deliveryType: key });
  },

  onScopeTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ cargoScope: key });
  },

  onCandidateTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    const selected = Object.assign({}, this.data.selectedIds);
    selected[id] = !selected[id];
    const count = Object.keys(selected).filter((k) => selected[k]).length;
    this.setData({ selectedIds: selected, selectedCount: count });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  onAddrInput(e) {
    const field = e.currentTarget.dataset.field;
    const address = Object.assign({}, this.data.address);
    address[field] = e.detail.value;
    this.setData({ address });
  },

  async submitPanel() {
    if (this.data.submitting) return;
    const ids = Object.keys(this.data.selectedIds)
      .filter((k) => this.data.selectedIds[k])
      .map(Number);
    const none = this.data.deliveryType === 'none';
    if (!none && ids.length === 0) {
      wx.showToast({ title: '请勾选要发的包裹', icon: 'none' });
      return;
    }
    if (none) {
      const okgo = await new Promise((resolve) => {
        wx.showModal({
          title: '本周全部留仓？',
          content: '将忽略已勾选的包裹，本周该客户全部留仓。',
          success: (r) => resolve(r.confirm)
        });
      });
      if (!okgo) return;
    }
    const payload = {
      item_ids: none ? [] : ids,
      delivery_type: this.data.deliveryType
    };
    if (this.data.deliveryType !== 'none') {
      payload.cargo_scope = this.data.cargoScope;
    }
    if (this.data.deliveryType === 'direct') {
      payload.address = this.data.address;
    }
    if (String(this.data.remark).trim()) {
      payload.remark = String(this.data.remark).trim();
    }
    this.setData({ submitting: true });
    try {
      const res = await client.adminConfirmShipFor(this.data.cid, payload);
      wx.showToast({ title: (res && res.message) || '已代客确认', icon: 'none' });
      this.setData({
        panelOpen: false, submitting: false,
        selectedIds: {}, selectedCount: 0, remark: ''
      });
      this.load(true);
    } catch (err) {
      this.setData({ submitting: false });
      fmt.showError(err);
    }
  },

  async onCancelConfirm() {
    const okgo = await new Promise((resolve) => {
      wx.showModal({
        title: '取消本周确认',
        content: '将回滚该客户本周确认同步到仓库的改动（仅限仍处于待打包的件），确定？',
        success: (r) => resolve(r.confirm)
      });
    });
    if (!okgo) return;
    try {
      const res = await client.adminCancelConfirmFor(this.data.cid);
      wx.showToast({ title: (res && res.message) || '已取消', icon: 'none' });
      this.load(true);
    } catch (err) {
      fmt.showError(err);
    }
  },

  // —— 运费收款 / 明细 ——
  async onSettleFreight() {
    if (this.data.settling) return;
    if (this.data.pendingFreight <= 0) {
      wx.showToast({ title: '当前无待付运费', icon: 'none' });
      return;
    }
    const okgo = await new Promise((resolve) => {
      wx.showModal({
        title: '确认全部已付款',
        content: '将把该客户所有未付款订单标记为已付款（合计 ' +
          this.data.currency + this.data.pendingFreight.toFixed(2) +
          '），已付过的不受影响。',
        success: (r) => resolve(r.confirm)
      });
    });
    if (!okgo) return;
    this.setData({ settling: true });
    try {
      const res = await client.adminSettleFreight(this.data.cid);
      const n = (res && res.settled_count) || 0;
      wx.showToast({ title: '已标记 ' + n + ' 个订单', icon: 'none' });
      this.setData({ pendingFreight: Number((res && res.remaining) || 0) });
      if (this.data.freightDetailOpen) await this.onShowFreight();
      this.load(true);
    } catch (err) {
      fmt.showError(err);
    } finally {
      this.setData({ settling: false });
    }
  },

  async onShowFreight() {
    try {
      const res = await client.adminFreightDetail(this.data.cid);
      this.setData({
        freightDetailOpen: true,
        freightItems: (res && res.items) || [],
        freightTotal: Number((res && res.total) || 0),
        pendingFreight: Number((res && res.total) || 0)
      });
    } catch (err) {
      fmt.showError(err);
    }
  },

  onCloseFreight() {
    this.setData({ freightDetailOpen: false });
  },

  // 标记/取消「已付款」（管理端，逐包）
  async onMarkPaid(e) {
    const id = Number(e.currentTarget.dataset.id);
    const index = this.data.list.findIndex((row) => Number(row.id) === id);
    if (index < 0) return;
    wx.showLoading({ title: '处理中' });
    try {
      const res = await client.adminTogglePaid(id);
      const idx = this.data.list.findIndex((row) => Number(row.id) === id);
      if (idx >= 0) {
        const patch = {};
        patch['list[' + idx + '].freight_paid'] = !!res.freight_paid;
        patch['list[' + idx + '].freight_paid_by'] = res.freight_paid_by || '';
        patch['list[' + idx + '].freight_paid_at_short'] = (res.freight_paid_at || '').substring(0, 10);
        this.setData(patch);
      }
      this.setData({ pendingFreight: Number((res && res.pending_freight) || 0) });
      wx.showToast({ title: res.freight_paid ? '已标记为已付款' : '已取消标记', icon: 'none' });
    } catch (err) {
      fmt.showError(err);
    } finally {
      wx.hideLoading();
    }
  },

  // 运费明细弹层内的逐包开关
  async onFreightTogglePaid(e) {
    const id = Number(e.currentTarget.dataset.id);
    wx.showLoading({ title: '处理中' });
    try {
      await client.adminTogglePaid(id);
      await this.onShowFreight();
    } catch (err) {
      fmt.showError(err);
    } finally {
      wx.hideLoading();
    }
  },

  // —— 入库单号操作（删除 / 退货 / 转无主件），状态口径与系统端一致 ——
  async onInboundAction(e) {
    const { id, action, no } = e.currentTarget.dataset;
    const CONFIRM = {
      'delete': ['删除单号', '确认删除 ' + no + '？与系统端一致：物理删除、货位随记录释放，不可恢复。'],
      'return': ['退货', '确认把 ' + no + ' 标记为「已退货」？系统端入库明细可恢复。'],
      'mark-orphan': ['转无主件', '确认把 ' + no + ' 转为无主件？该单号将从客户名下摘出，可在「无主件」页归户。']
    };
    const cfg = CONFIRM[action];
    if (!cfg) return;
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: cfg[0], content: cfg[1],
        success: (r) => resolve(!!r.confirm), fail: () => resolve(false)
      });
    });
    if (!ok) return;
    wx.showLoading({ title: '处理中' });
    try {
      await client.adminInboundAction(Number(id), action, {});
      wx.hideLoading();
      wx.showToast({ title: '操作成功', icon: 'none' });
      this.load(true);
    } catch (err) {
      wx.hideLoading();
      fmt.showError(err);
    }
  },

  // —— 优惠券 ——
  async onShowCouponForm() {
    const open = !this.data.couponFormOpen;
    this.setData({
      couponFormOpen: open,
      couponForm: { ctype: 'amount', value: '', note: '', expire_days: 30 }
    });
    if (open) this.loadCoupons();
  },

  onCouponTypeTap(e) {
    this.setData({ 'couponForm.ctype': e.currentTarget.dataset.key });
  },

  onCouponInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['couponForm.' + field]: e.detail.value });
  },

  async loadCoupons() {
    try {
      const res = await client.adminCouponList(this.data.cid);
      this.setData({ coupons: (res && res.list) || [] });
    } catch (err) {
      fmt.showError(err);
    }
  },

  async onIssueCoupon() {
    if (this.data.couponBusy) return;
    const form = this.data.couponForm;
    const value = parseFloat(String(form.value || '0'));
    if (!(value > 0)) {
      wx.showToast({ title: '请填写有效面额', icon: 'none' });
      return;
    }
    this.setData({ couponBusy: true });
    try {
      const res = await client.adminIssueCoupon(this.data.cid, {
        type: form.ctype,
        value: value,
        note: form.note,
        expire_days: parseInt(form.expire_days, 10) || 30
      });
      wx.showToast({ title: '已发放 ' + (res && res.code || ''), icon: 'none' });
      this.setData({ couponFormOpen: false });
      this.loadCoupons();
    } catch (err) {
      fmt.showError(err);
    } finally {
      this.setData({ couponBusy: false });
    }
  },

  async onRedeemCoupon(e) {
    const code = e.currentTarget.dataset.code;
    const okgo = await new Promise((resolve) => {
      wx.showModal({
        title: '用券抵扣',
        content: '将用此券抵扣该客户当前待付运费。',
        success: (r) => resolve(r.confirm)
      });
    });
    if (!okgo) return;
    try {
      const res = await client.adminRedeemCoupon(this.data.cid, code);
      wx.showToast({ title: '已抵扣 ' + this.data.currency + (res && res.redeemed_amount || 0), icon: 'none' });
      this.setData({ pendingFreight: Number((res && res.remaining) || 0) });
      this.loadCoupons();
      this.load(true);
    } catch (err) {
      fmt.showError(err);
    }
  }
});
