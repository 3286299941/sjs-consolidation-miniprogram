// packageAdmin/tracks —— 批次物流轨迹更新（普货/敏货两组）
// 字段按客户端 12 节点组织：每个节点可填日期 + 备注，另设「当前物流状态」。
// node_data = {node_key: {date, note}}，与客户端节点一一对应；系统端不同步。
const client = require('../../services/client');
const fmt = require('../../utils/format');
const auth = require('../../utils/auth');
const TN = require('../../utils/trackNodes');

Page({
  data: {
    batchId: 0,
    batch: {},
    rows: [],
    nodeLabels: TN.LABELS,
    nodeCount: TN.NODES.length,
    loading: true,
    saving: false
  },

  onLoad(options) {
    this.setData({ batchId: Number(options && options.id) || 0 });
  },

  onShow() {
    auth.guardAdminPage().then((ok) => { if (ok) this.load(); });
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    if (!this.data.batchId) { this.setData({ loading: false }); return; }
    this.setData({ loading: true });
    try {
      const res = await client.adminBatchTracks(this.data.batchId);
      const rows = ((res && res.rows) || []).map((r) => {
        const saved = (r.node_data && typeof r.node_data === 'object') ? r.node_data : {};
        const nodes = TN.NODES.map((n) => {
          const one = saved[n.key] || {};
          return {
            key: n.key,
            label: n.label,
            issue: n.kind === 'issue',
            date: String(one.date || ''),
            note: String(one.note || '')
          };
        });
        const idx = TN.indexOfKey(r.current_node);
        return Object.assign({}, r, {
          nodes: nodes,
          nodeIndex: idx < 0 ? 0 : idx,
          nodeLabel: idx < 0 ? '暂未设置' : TN.NODES[idx].label
        });
      });
      this.setData({ batch: (res && res.batch) || {}, rows: rows, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  onFieldInput(e) {
    const { idx, field } = e.currentTarget.dataset;
    this.setData({ ['rows[' + idx + '].' + field]: e.detail.value });
  },

  onNodeChange(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const pos = Number(e.detail.value);
    if (!TN.NODES[pos]) return;
    this.setData({
      ['rows[' + idx + '].current_node']: TN.NODES[pos].key,
      ['rows[' + idx + '].nodeIndex']: pos,
      ['rows[' + idx + '].nodeLabel']: TN.NODES[pos].label
    });
  },

  // 按节点填日期
  onNodeDateChange(e) {
    const { idx, key } = e.currentTarget.dataset;
    const nodes = this.data.rows[idx].nodes;
    const n = nodes.findIndex((x) => x.key === key);
    if (n < 0) return;
    this.setData({ ['rows[' + idx + '].nodes[' + n + '].date']: e.detail.value });
  },

  // 按节点填备注
  onNodeInput(e) {
    const { idx, key } = e.currentTarget.dataset;
    const nodes = this.data.rows[idx].nodes;
    const n = nodes.findIndex((x) => x.key === key);
    if (n < 0) return;
    this.setData({ ['rows[' + idx + '].nodes[' + n + '].note']: e.detail.value });
  },

  async onSave() {
    if (this.data.saving) return;
    const rows = this.data.rows.map((r) => {
      const nd = {};
      (r.nodes || []).forEach((n) => {
        if (n.date || n.note) nd[n.key] = { date: n.date, note: n.note };
      });
      return {
        group_name: r.group_name,
        internal_no: r.internal_no,
        transfer_no: r.transfer_no,
        // 旧字段原样回传，避免覆盖历史轨迹数据（后端亦有缺键兜底）
        carton_count: r.carton_count,
        sail_date: r.sail_date,
        arrive_date: r.arrive_date,
        pickup_date: r.pickup_date,
        sign_date: r.sign_date,
        progress: r.progress,
        current_node: r.current_node || '',
        node_data: nd
      };
    });
    this.setData({ saving: true });
    try {
      await client.adminSaveBatchTracks(this.data.batchId, rows);
      wx.showToast({ title: '轨迹已同步客户端', icon: 'none' });
      this.load();
    } catch (err) {
      fmt.showError(err);
    } finally {
      this.setData({ saving: false });
    }
  },

  noop() {}
});
