// pages/intent —— 发货意向（MVP 核心功能）
// 单周视图：页面只读展示「本周发往批次」（由归属邮编自动匹配），
// 客户只选配送方式 + 货物范围 + 备注；批次由后端按邮编自动归入，
// 单独地址发货（VIP）无需批次。提交只写 shipment_intents，绝不回写 incoming_packages。
const app = getApp();
const client = require('../../services/client');
const config = require('../../utils/config');
const auth = require('../../utils/auth');
const fmt = require('../../utils/format');

const REMARK_MAX = 200;

/** 把后端意向记录映射成页面草稿，兼容只存了旧 intent_type 的历史数据 */
function mapIntent(intent) {
  if (!intent) {
    return {
      deliveryType: '', cargoScope: 'all',
      addrName: '', addrPhone: '', addrLine: '', addrZip: '', remark: ''
    };
  }
  const delivery = intent.delivery_type || (intent.intent_type === 'none' ? 'none' : 'pooled');
  const scope = intent.cargo_scope || (intent.intent_type === 'none' ? 'all' : (intent.intent_type || 'all'));
  return {
    deliveryType: delivery,
    cargoScope: scope,
    addrName: intent.address_name || '',
    addrPhone: intent.address_phone || '',
    addrLine: intent.address_line || '',
    addrZip: intent.address_zip || '',
    remark: intent.remark || ''
  };
}

function validateAddress(d) {
  if (!String(d.addrName || '').trim()) return '请填写收件人姓名';
  if (!/^\d{7,}$/.test(String(d.addrPhone || '').replace(/\D/g, ''))) return '请填写有效联系电话';
  if (!String(d.addrLine || '').trim()) return '请填写详细收货地址';
  if (!String(d.addrZip || '').trim()) return '请填写邮编';
  return '';
}

Page({
  data: {
    deliveryOptions: fmt.DELIVERY_OPTIONS,
    cargoOptions: fmt.CARGO_OPTIONS,
    minWeight: config.DIRECT_MIN_WEIGHT_KG,
    remarkMax: REMARK_MAX,
    zipCode: '',
    weekBatch: null,
    pendingCount: 0,
    bound: false,
    loading: true,
    confirmed: false,
    submitting: false,
    // 当前意向草稿（页面级，不再按批次循环）
    deliveryType: '',
    cargoScope: 'all',
    addrName: '', addrPhone: '', addrLine: '', addrZip: '',
    remark: '',
    intent: null,
    intentSummary: ''
  },

  onShow() {
    const now = Date.now();
    // E-07：切回 tab 30 秒内且已有数据时不重复请求；下拉刷新可强制刷新
    if (this._lastLoadAt && now - this._lastLoadAt < config.REFRESH_THROTTLE_MS && this.data.intent !== undefined && this.data.zipCode) {
      return;
    }
    this._lastLoadAt = now;
    this.load();
  },

  onPullDownRefresh() {
    this._lastLoadAt = Date.now();
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const profile = await app.refreshProfile(false);
      const bound = auth.isBound(profile);
      if (!bound) {
        this.setData({
          bound: false, loading: false,
          weekBatch: null, deliveryType: '', cargoScope: 'all',
          addrName: '', addrPhone: '', addrLine: '', addrZip: '', remark: '',
          intent: null, intentSummary: '', confirmed: false
        });
        return;
      }

      const res = await client.getPendingBatches();
      const weekBatch = (res && res.week_batch) || null;
      const pendingCount = (res && res.pending_count) || 0;
      const gi = await client.getIntent();
      const intentRow = (gi && gi.intent) || null;
      const draft = mapIntent(intentRow);

      this.setData({
        bound: true,
        zipCode: (res && res.zip_code) || '',
        weekBatch, pendingCount,
        deliveryType: draft.deliveryType,
        cargoScope: draft.cargoScope,
        addrName: draft.addrName, addrPhone: draft.addrPhone,
        addrLine: draft.addrLine, addrZip: draft.addrZip,
        remark: draft.remark,
        intent: intentRow,
        intentSummary: intentRow ? fmt.intentSummary(intentRow) : '',
        confirmed: !!(intentRow && Number(intentRow.status) === 1),
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  onPickDelivery(e) {
    if (this.data.confirmed) {
      wx.showToast({ title: '仓库已确认，不能再修改', icon: 'none' });
      return;
    }
    this.setData({ deliveryType: e.currentTarget.dataset.key });
  },

  onPickScope(e) {
    if (this.data.confirmed) {
      wx.showToast({ title: '仓库已确认，不能再修改', icon: 'none' });
      return;
    }
    this.setData({ cargoScope: e.currentTarget.dataset.key });
  },

  onAddrInput(e) {
    const field = e.currentTarget.dataset.field;
    if (field) this.setData({ [field]: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: String(e.detail.value || '').slice(0, REMARK_MAX) });
    return e.detail.value;
  },

  async onSubmit() {
    if (this.data.submitting || this.data.confirmed) return;
    if (!this.data.deliveryType) {
      wx.showToast({ title: '请先选择发货方式', icon: 'none' });
      return;
    }

    let address = null;
    if (this.data.deliveryType === 'direct') {
      const msg = validateAddress(this.data);
      if (msg) {
        wx.showToast({ title: msg, icon: 'none' });
        return;
      }
      address = {
        name: String(this.data.addrName).trim(),
        phone: String(this.data.addrPhone).replace(/\D/g, ''),
        line: String(this.data.addrLine).trim(),
        zip: String(this.data.addrZip).trim()
      };
    }

    const payload = {
      // 不再由前端传 batch_id：后端按归属邮编自动匹配未锁定批次
      delivery_type: this.data.deliveryType,
      cargo_scope: this.data.deliveryType === 'none' ? 'all' : this.data.cargoScope,
      address,
      remark: String(this.data.remark || '').trim().slice(0, REMARK_MAX)
    };

    const previous = this.data.intent;
    const previousSummary = this.data.intentSummary;
    this.setData({
      submitting: true,
      intent: {
        delivery_type: payload.delivery_type,
        cargo_scope: payload.cargo_scope,
        remark: payload.remark,
        status: 0
      },
      intentSummary: fmt.intentSummary(payload)
    });

    try {
      const res = await client.submitIntent(payload);
      const saved = (res && res.intent) || payload;
      this.setData({
        intent: saved,
        intentSummary: fmt.intentSummary(saved),
        confirmed: !!(saved && Number(saved.status) === 1)
      });
      wx.showToast({ title: '已提交，等待仓库确认', icon: 'none' });
    } catch (err) {
      this.setData({ intent: previous, intentSummary: previousSummary });
      fmt.showError(err);
    } finally {
      this.setData({ submitting: false });
    }
  },

  goBind() {
    wx.navigateTo({ url: '/packageClient/bind/bind' });
  }
});
