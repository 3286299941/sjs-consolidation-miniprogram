// utils/format.js —— 展示层清洗与映射
// 策划案 13.6：incoming_packages.nature 含少量「已打包/已入库」脏值，
// 前端做保守兜底，权威清洗在服务端（优先取 packed_packages.nature）。
const STATUS_CLASS = {
  '已入库': 'tag-blue',
  '待打包': 'tag-orange',
  '已打包': 'tag-green',
  '已发货': 'tag-green',
  '已完成': 'tag-gray',
  '已退货': 'tag-red',
  '已丢失': 'tag-red'
};

const NATURE_CLASS = {
  '普货': 'tag-green',
  '敏货': 'tag-orange',
  '待核实': 'tag-gray',
  '待确认': 'tag-gray'
};

// 第一层：配送方式（第三轮需求变更：三大类）
const DELIVERY_OPTIONS = [
  { key: 'pooled', label: '拼邮发货', desc: '' },
  { key: 'direct', label: '单独地址发货', desc: '满 12 公斤，发到您的个人地址' },
  { key: 'none', label: '本周暂不发货', desc: '货物继续留在仓库，下周再选' }
];

// 第二层：货物范围（仅拼邮 / 单独地址时需要选）
const CARGO_OPTIONS = [
  { key: 'all', label: '全发', desc: '普货 + 敏货都发' },
  { key: 'normal_only', label: '只发普货', desc: '敏货留仓，等下次批次' },
  { key: 'sensitive_only', label: '只发敏货', desc: '普货留仓，等下次批次' }
];

const DELIVERY_LABEL = {
  pooled: '拼邮发货',
  direct: '单独地址发货',
  none: '本周暂不发货'
};

const CARGO_LABEL = {
  all: '全发',
  normal_only: '只发普货',
  sensitive_only: '只发敏货'
};

// 兼容旧四选一（历史数据 intent_type 里可能还有旧值）
const INTENT_OPTIONS = [
  { key: 'all', label: '全发', desc: '普货 + 敏货本周都发' },
  { key: 'none', label: '不发货', desc: '整批攒着，货物继续留在仓库' },
  { key: 'normal_only', label: '只发普货', desc: '敏货留仓，等下次批次' },
  { key: 'sensitive_only', label: '只发敏货', desc: '普货留仓，等下次批次' }
];

const INTENT_LABEL = CARGO_LABEL;

/** 普敏归一化：脏值不猜、不乱标，统一显示「待核实」 */
function normalizeNature(raw, packedNature) {
  const s = String(raw || '').trim();
  if (/敏/.test(s)) return '敏货';
  if (/普/.test(s)) return '普货';
  if (packedNature) return normalizeNature(packedNature);
  return '待核实';
}

function statusClass(status) {
  return STATUS_CLASS[status] || 'tag-gray';
}

function natureClass(nature) {
  return NATURE_CLASS[nature] || 'tag-gray';
}

function intentLabel(key) {
  return INTENT_LABEL[key] || '未提交';
}

/** 把一条意向记录概括成一句话：配送方式 · 货物范围 */
function intentSummary(intent) {
  if (!intent) return '未提交';
  const delivery = intent.delivery_type || (intent.intent_type === 'none' ? 'none' : 'pooled');
  if (delivery === 'none') return DELIVERY_LABEL.none;
  const scope = intent.cargo_scope || intent.intent_type || 'all';
  return (DELIVERY_LABEL[delivery] || '拼邮发货') + ' · ' + (CARGO_LABEL[scope] || '全发');
}

/** 后端返回 2026-11-05T09:12:00 / 2026-11-05 09:12:00 都兼容 */
function formatTime(value) {
  if (!value) return '—';
  return String(value).replace('T', ' ').slice(0, 16);
}

function toQuery(params) {
  const parts = [];
  Object.keys(params || {}).forEach((key) => {
    const v = params[key];
    if (v === undefined || v === null || v === '') return;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

function showError(err) {
  wx.showToast({ title: (err && err.message) || '操作失败，请重试', icon: 'none', duration: 2000 });
}

/** wx.showModal 的 Promise 版，兼容旧基础库 */
function confirmModal(options) {
  return new Promise((resolve) => {
    wx.showModal(Object.assign({}, options, {
      success: (res) => resolve(res),
      fail: () => resolve({ confirm: false, cancel: true })
    }));
  });
}

module.exports = {
  STATUS_CLASS,
  DELIVERY_OPTIONS,
  CARGO_OPTIONS,
  DELIVERY_LABEL,
  CARGO_LABEL,
  INTENT_OPTIONS,
  INTENT_LABEL,
  normalizeNature,
  statusClass,
  natureClass,
  intentLabel,
  intentSummary,
  formatTime,
  toQuery,
  showError,
  confirmModal
};
