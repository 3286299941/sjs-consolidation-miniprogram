// packageClient/tracks —— 客户端物流轨迹（与管理端同一份 batch_tracks 数据）
// 进度由管理端设置的 current_node 决定；顶部进度条按当前节点推进，不显示百分比、不做动画。
// 展示规则（2026-11-06）：
//   1) 「可能异常」节点只有在管理端为它填了日期/备注，或它被设为当前状态时才出现；
//      没发生的查验、延误、派送异常不占用客户视线。
//   2) 节点时间轴默认折叠，点标题栏展开/收起，避免页面过长。
const client = require('../../services/client');
const fmt = require('../../utils/format');
const TN = require('../../utils/trackNodes');

function decorate(row) {
  const cur = TN.indexOfKey(row.current_node);   // -1 = 管理端尚未设置进度
  // 管理端按节点填写的明细 {node_key: {date, note}}；旧四个日期字段兜底兼容历史数据
  const detail = (row.node_data && typeof row.node_data === 'object') ? row.node_data : {};
  const all = TN.NODES.map((n, i) => {
    const done = cur >= 0 && i < cur;
    const current = i === cur;
    const issue = n.kind === 'issue';
    const one = detail[n.key] || {};
    const legacy = n.dateField && row[n.dateField] ? TN.shortDate(row[n.dateField]) : '';
    const date = one.date ? TN.shortDate(one.date) : legacy;
    const note = String(one.note || '');
    return {
      key: n.key,
      label: n.label,
      issue: issue,
      recorded: !!(one.date || one.note),   // 管理端是否为此节点录入了内容
      done: done,
      current: current,
      status: done ? '已完成' : (current ? (issue ? '当前 · 需关注' : '当前 · 进行中') : '待更新'),
      date: date,
      note: note,
      dotClass: done ? 'dot-done' : (current ? (issue ? 'dot-issue' : 'dot-current') : ''),
      nameClass: (done || current) ? 'name-on' : '',
      statusClass: current ? (issue ? 'status-issue' : 'status-current') : ''
    };
  });
  // 异常节点：仅在「管理端有录入」或「正是当前状态」时显示
  const nodes = all.filter((n) => !n.issue || n.recorded || n.current);
  nodes.forEach((n, i) => { n.last = i === nodes.length - 1; });
  const percent = cur < 0 ? 0 : Math.round((cur + 1) / TN.NODES.length * 100);
  return Object.assign({}, row, {
    nodes: nodes,
    visibleCount: nodes.length,
    expanded: false,
    percent: percent,
    currentLabel: cur < 0 ? '暂未更新' : TN.NODES[cur].label,
    currentIssue: cur >= 0 && TN.NODES[cur].kind === 'issue',
    customNote: String(row.progress || '').trim()
  });
}

Page({
  data: { list: [], loading: true, onlyBatchId: 0 },

  // 支持带 batch_id 进入：批次卡点「轨迹」只看该批次（如「单独地址」tab）
  onLoad(options) {
    const bid = parseInt(options && options.id, 10);
    if (bid > 0) {
      this.setData({ onlyBatchId: bid });
      wx.setNavigationBarTitle({ title: '批次轨迹' });
    }
  },

  onShow() { this.load(); },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const q = this.data.onlyBatchId ? { batch_id: this.data.onlyBatchId } : undefined;
      const res = await client.clientTracks(q);
      // 刷新后保留用户已收起的批次
      const prev = {};
      this.data.list.forEach((g) => { prev[g.batch_id] = !!g.collapsed; });
      const list = ((res && res.list) || []).map((grp) => Object.assign({}, grp, {
        collapsed: !!prev[grp.batch_id],
        rows: (grp.rows || []).map(decorate)
      }));
      this.setData({ list: list, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  // 整张批次卡折叠：收起后只剩「批次号 + 邮编」这一行
  onToggleBatch(e) {
    const bi = Number(e.currentTarget.dataset.bi);
    const grp = this.data.list[bi];
    if (!grp) return;
    this.setData({ ['list[' + bi + '].collapsed']: !grp.collapsed });
  },

  // 折叠/展开某一组（批次 + 普敏）的节点时间轴
  onToggleExpand(e) {
    const { bi, gi } = e.currentTarget.dataset;
    const row = this.data.list[bi] && this.data.list[bi].rows[gi];
    if (!row) return;
    this.setData({
      ['list[' + bi + '].rows[' + gi + '].expanded']: !row.expanded
    });
  },

  // 单批次模式下的「查看全部」入口：回到主页全量轨迹（不带 batch_id）
  goAllTracks() {
    wx.redirectTo({ url: '/packageClient/tracks/tracks' });
  }
});
