// packageAdmin/audit —— 管理端：绑定申请审核（防冒绑的关键一环）
const client = require('../../services/client');
const fmt = require('../../utils/format');
const auth = require('../../utils/auth');

Page({
  data: {
    list: [],
    pendingCount: 0,
    loading: true,
    auditingId: 0
  },

  onShow() {
    // 白名单即管理员：角色守卫，密码解锁已下线
    auth.guardAdminPage().then((ok) => { if (ok) this.load(); });
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await client.adminGetBindings();
      this.setData({
        list: (res && res.list) || [],
        pendingCount: (res && res.pending_count) || 0,
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  onAudit(e) {
    const { id, action } = e.currentTarget.dataset;
    if (this.data.auditingId) return;
    const CONFIRM = {
      approve: ['通过绑定', '通过后该微信号即可查看对应客户的货物与发货意向，请确认客户档案与手机尾号已核对。', '已通过'],
      reject: ['驳回绑定', '驳回后客户需重新提交绑定申请。', '已驳回'],
      unbind: ['解绑客户', '解绑后该微信号将失去客户视角，客户可重新提交绑定申请。确定解绑？', '已解绑']
    };
    const cfg = CONFIRM[action];
    if (!cfg) return;
    wx.showModal({
      title: cfg[0],
      content: cfg[1],
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ auditingId: Number(id) });
        try {
          await client.adminAuditBind({ user_id: Number(id), action });
          wx.showToast({ title: cfg[2], icon: 'none' });
          this.load();
        } catch (err) {
          fmt.showError(err);
        } finally {
          this.setData({ auditingId: 0 });
        }
      }
    });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
