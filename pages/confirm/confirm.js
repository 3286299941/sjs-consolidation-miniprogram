// pages/confirm —— 本周发货确认（唯一发货入口，合并原「发货意向」页）
// ① 选择发货方式（拼邮 / 单独地址 / 暂不发货）→ ② 在库货件（默认全部发出，无需勾选）
// → ③ 备注（特殊要求写备注，仓库按备注操作），一次提交写 shipment_intents。
// 批次归属由仓库按邮编自动处理，页面对客户不展示批次概念；操作端确认后锁定。
const client = require('../../services/client');
const auth = require('../../utils/auth');
const config = require('../../utils/config');
const fmt = require('../../utils/format');

const REMARK_MAX = 200;

/** 兼容只存了旧 intent_type 的历史数据 */
function mapDelivery(intent) {
  if (!intent) {
    return {
      deliveryType: '', cargoScope: 'all',
      addrName: '', addrPhone: '', addrLine: '', addrZip: ''
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
    addrZip: intent.address_zip || ''
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
    bound: false,
    loading: true,
    weekLabel: '',
    deadline: '',
    deliveryOptions: fmt.DELIVERY_OPTIONS,
    cargoOptions: fmt.CARGO_OPTIONS,
    minWeight: config.DIRECT_MIN_WEIGHT_KG,
    deliveryType: '',
    cargoScope: 'all',
    addrName: '', addrPhone: '', addrLine: '', addrZip: '',
    vipAddress: null,          // 系统推送的 VIP 单独发货地址（is_vip 且有维护时才有值）
    vipAddrSynced: false,      // 当前 direct 表单地址是否来自 VIP 档案预填
    items: [],
    total: 0,
    intent: null,
    locked: false,
    remark: '',
    remarkCount: 0,
    submitting: false
  },

  async onLoad() {
    try {
      const profile = await auth.getProfile();
      const bound = auth.isBound(profile);
      this.setData({
        bound,
        vipAddress: (profile && profile.customer && profile.customer.vip_address) || null
      });
      if (!bound) {
        this.setData({ loading: false });
        return;
      }
      this.load();
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  async onShow() {
    // 与 packages 页同理：审核通过后回到本页需强制刷新一次 profile，
    // 否则本地缓存的"待审核/未绑定"旧状态会让页面一直卡在绑定引导
    if (this.data.bound) return;
    try {
      const profile = await auth.getProfile(true);
      const bound = auth.isBound(profile);
      this.setData({
        bound,
        vipAddress: (profile && profile.customer && profile.customer.vip_address) || null
      });
      if (bound) this.load();
    } catch (err) {
      // 静默失败：下拉/重进页面兜底
    }
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await client.confirmCandidates();
      const list = (res && res.list) || [];
      const items = this.buildItems(list);
      const intent = (res && res.intent) || null;
      const locked = !!(intent && intent.locked);

      // 发货方式草稿：优先取 scope=1 意向（合并前意向页写入的），否则留空让客户选
      let deliveryDraft = { deliveryType: '', cargoScope: 'all', addrName: '', addrPhone: '', addrLine: '', addrZip: '' };
      try {
        const gi = await client.getIntent();
        deliveryDraft = mapDelivery((gi && gi.intent) || null);
        if (deliveryDraft.deliveryType === 'none' && intent && intent.item_count > 0) {
          // 旧意向是「暂不发货」但本周已有选件确认：以选件为准，让客户重新选方式
          deliveryDraft.deliveryType = '';
        }
      } catch (e) { /* 发货方式缺失不阻塞页面 */ }

      // 选了「单独地址发货」且历史未存地址时，用系统推送的 VIP 档案地址预填
      let vipSynced = false;
      const vip = this.data.vipAddress;
      if (deliveryDraft.deliveryType === 'direct' && vip) {
        const hasStored = !!(deliveryDraft.addrName || deliveryDraft.addrPhone ||
                             deliveryDraft.addrLine || deliveryDraft.addrZip);
        if (!hasStored) {
          deliveryDraft.addrName = vip.name || '';
          deliveryDraft.addrPhone = vip.phone || '';
          deliveryDraft.addrLine = vip.line || '';
          deliveryDraft.addrZip = vip.zip || '';
          vipSynced = true;
        }
      }

      this.setData({
        loading: false,
        weekLabel: (res && res.week_label) || '',
        deadline: (res && res.deadline) || '',
        total: list.length,
        items,
        intent,
        locked,
        deliveryType: deliveryDraft.deliveryType,
        cargoScope: deliveryDraft.cargoScope || 'all',
        addrName: deliveryDraft.addrName,
        addrPhone: deliveryDraft.addrPhone,
        addrLine: deliveryDraft.addrLine,
        addrZip: deliveryDraft.addrZip,
        vipAddrSynced: vipSynced,
        remark: (intent && intent.remark) || '',
        remarkCount: ((intent && intent.remark) || '').length
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  // 扁平列表：全部是系统里的「已入库」包裹，无批次分组；默认全部发出，无勾选态
  buildItems(list) {
    return list.map((it) => ({
      id: it.id,
      tracking_number: it.tracking_number || '—',
      entry_time_display: fmt.formatTime(it.entry_time),
      status: it.status || '已入库'
    }));
  },

  onPickDelivery(e) {
    if (this.data.locked) {
      wx.showToast({ title: '仓库已接单，无法修改', icon: 'none' });
      return;
    }
    const key = e.currentTarget.dataset.key;
    const patch = { deliveryType: key, vipAddrSynced: false };
    // 选「单独地址发货」且当前无地址时，用系统推送的 VIP 档案地址预填
    if (key === 'direct') {
      const vip = this.data.vipAddress;
      const empty = !this.data.addrName && !this.data.addrPhone &&
                    !this.data.addrLine && !this.data.addrZip;
      if (vip && empty) {
        patch.addrName = vip.name || '';
        patch.addrPhone = vip.phone || '';
        patch.addrLine = vip.line || '';
        patch.addrZip = vip.zip || '';
        patch.vipAddrSynced = true;
      }
    }
    this.setData(patch);
  },

  onPickScope(e) {
    if (this.data.locked) {
      wx.showToast({ title: '仓库已接单，无法修改', icon: 'none' });
      return;
    }
    this.setData({ cargoScope: e.currentTarget.dataset.key });
  },

  onAddrInput(e) {
    const field = e.currentTarget.dataset.field;
    if (field) this.setData({ [field]: e.detail.value });
  },

  onRemarkInput(e) {
    const value = String(e.detail.value || '');
    this.setData({ remark: value, remarkCount: value.length });
  },

  // 默认全部在库货件发出；客户不勾选，特殊要求走备注
  collectIds() {
    return this.data.items.map((it) => it.id);
  },

  onSubmit() {
    if (this.data.locked || this.data.submitting) return;

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

    const ids = this.data.deliveryType === 'none' ? [] : this.collectIds();
    this.doSubmit(ids, address);
  },

  async doSubmit(ids, address) {
    this.setData({ submitting: true });
    try {
      const res = await client.confirmShip({
        item_ids: ids,
        remark: String(this.data.remark || '').trim(),
        delivery_type: this.data.deliveryType,
        cargo_scope: this.data.deliveryType === 'none' ? 'all' : this.data.cargoScope,
        address
      });
      wx.showToast({ title: (res && res.message) || '已提交', icon: 'none' });
      await this.load();
    } catch (err) {
      fmt.showError(err);
    }
    this.setData({ submitting: false });
  },

  onCancel() {
    if (this.data.locked) return;
    wx.showModal({
      title: '取消本周确认？',
      content: '取消后仓库看不到你的发货选择，货件继续留仓。',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await client.confirmCancel();
          wx.showToast({ title: '已取消', icon: 'none' });
          await this.load();
        } catch (err) {
          fmt.showError(err);
        }
      }
    });
  },

  goBind() {
    wx.navigateTo({ url: '/packageClient/bind/bind' });
  }
});
