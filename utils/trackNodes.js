// utils/trackNodes.js —— 国际集运物流节点（中国出库 → 目的国自提点）
// kind: normal 主干节点 / issue 可能遇到的问题节点（查验、延误、派送异常）
// 异常节点按发生阶段插在主干里：当前状态停在该节点时用橙色提示。
// dateField 复用管理端已录入的四个预计日期，客户端在对应节点显示。
const NODES = [
  { key: 'shipped',          label: '已发货',              kind: 'normal', dateField: '' },
  { key: 'cn_customs',       label: '国内出口报关',        kind: 'normal', dateField: '' },
  { key: 'cn_inspection',    label: '国内海关查验中',      kind: 'issue',  dateField: '' },
  { key: 'departed',         label: '已开船',              kind: 'normal', dateField: 'sail_date' },
  { key: 'in_transit',       label: '运输中',              kind: 'normal', dateField: '' },
  { key: 'delay',            label: '船期延误 / 中转滞留', kind: 'issue',  dateField: '' },
  { key: 'arrived_port',     label: '到港待清关',          kind: 'normal', dateField: 'arrive_date' },
  { key: 'dest_inspection',  label: '目的国清关查验中',    kind: 'issue',  dateField: '' },
  { key: 'cleared',          label: '清关放行',            kind: 'normal', dateField: '' },
  { key: 'out_for_delivery', label: '待派送',              kind: 'normal', dateField: 'pickup_date' },
  { key: 'delivery_issue',   label: '派送异常待处理',      kind: 'issue',  dateField: '' },
  { key: 'ready_pickup',     label: '已到达自提点请取货',  kind: 'normal', dateField: 'sign_date' }
];

const LABELS = NODES.map((n) => n.label);

function indexOfKey(key) {
  const i = NODES.findIndex((n) => n.key === key);
  return i < 0 ? -1 : i;
}

function shortDate(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const p = s.split('-');
  if (p.length >= 3) return Number(p[1]) + '月' + Number(p[2]) + '日';
  return s;
}

module.exports = { NODES: NODES, LABELS: LABELS, indexOfKey: indexOfKey, shortDate: shortDate };
