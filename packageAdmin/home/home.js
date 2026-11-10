// packageAdmin/home —— 管理端「系统管理端」首页
// 与客户端（个人寄件视角）差异化：全局 KPI + 待办 + 功能入口
const auth = require('../../utils/auth');
const fmt = require('../../utils/format');
const client = require('../../services/client');

const ENTRIES = [
  { key: 'customers', title: '客户总览', desc: '有记录客户 · 邮编筛选', url: '/packageAdmin/customers/customers' },
  { key: 'batches',   title: '批次管理', desc: '批次统计 · 新建 · 轨迹更新', url: '/packageAdmin/batches/batches' },
  { key: 'board',     title: '意向看板', desc: '客户发货方式意向汇总与确认', url: '/packageAdmin/board/board' },
  { key: 'audit',     title: '绑定审核', desc: '审核绑定申请 · 解绑客户', url: '/packageAdmin/audit/audit' },
  { key: 'pool',      title: '意向池', desc: '无收发记录客户 · 新建/删除', url: '/packageAdmin/customers/customers?pool=1' },
  { key: 'orphans',   title: '无主件', desc: '待认领单号 · 归户 / 删除', url: '/packageAdmin/orphans/orphans' },
  { key: 'vip',       title: 'VIP单独发货记录', desc: 'VIP单独地址与发货信息', url: '/packageAdmin/vip-ship/vip-ship' }
];

// 待办项：数字非 0 高亮，点击直达对应页面
const TODOS = [
  { key: 'pending_bind',    label: '待审核绑定', url: '/packageAdmin/audit/audit' },
  { key: 'pending_intent',  label: '待确认意向', url: '/packageAdmin/board/board' },
  { key: 'locked_batches',  label: '已锁定批次', url: '/packageAdmin/batches/batches' },
  { key: 'orphan',          label: '无主件', url: '/packageAdmin/orphans/orphans' }
];

function fmtMoney(n) {
  return '¥' + (Math.round(n || 0)).toLocaleString('zh-CN');
}

Page({
  data: {
    entries: ENTRIES,
    todos: [],
    dash: null,
    loading: true,
    freightDisplay: '¥0',
    weekLabel: ''
  },

  onShow() {
    // 白名单即管理员：只做角色守卫，不再需要输密码解锁
    auth.guardAdminPage().then((ok) => { if (ok) this.load(); });
  },

  // 管理员想看客户看到的样子：切到客户端视角（首页顶部可一键返回）
  goClientView() {
    const app = getApp();
    app.globalData.adminClientView = true;
    wx.switchTab({ url: '/pages/index/index' });
  },

  async load() {
    this.setData({ loading: true });
    try {
      const d = await client.adminDashboard();
      const dash = d || {};
      const todos = TODOS.map((t) => ({
        ...t,
        count: dash[t.key] || 0,
        hot: (dash[t.key] || 0) > 0
      }));
      this.setData({
        dash,
        todos,
        freightDisplay: fmtMoney(dash.pending_freight),
        weekLabel: dash.week_label || '',
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  go(e) {
    const key = e.currentTarget.dataset.key;
    const target = ENTRIES.find((x) => x.key === key);
    if (target && target.url) wx.navigateTo({ url: target.url });
  },

  goPool() {
    wx.navigateTo({ url: '/packageAdmin/customers/customers?pool=1' });
  },

  goTodo(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  }
});
