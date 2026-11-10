// packageClient/package-detail —— 入库单详情
// 数据来源：列表页通过本地缓存传入，不新增后端接口（接口清单以策划案第 8 节为准）
const fmt = require('../../utils/format');

Page({
  data: { item: null, missing: false },

  onLoad() {
    const raw = wx.getStorageSync('sjs_current_package');
    if (!raw || !raw.id) {
      this.setData({ missing: true });
      return;
    }
    const hidden = raw.nature_visible === false;
    const nature = hidden ? '待确认' : fmt.normalizeNature(raw.nature, raw.packed_nature);
    this.setData({
      item: Object.assign({}, raw, {
        nature_display: nature,
        nature_class: hidden ? 'tag-gray' : fmt.natureClass(nature),
        status_class: fmt.statusClass(raw.status),
        entry_time_display: fmt.formatTime(raw.entry_time)
      })
    });
  },

  onCopy() {
    if (!this.data.item) return;
    wx.setClipboardData({
      data: this.data.item.tracking_number,
      success: () => wx.showToast({ title: '单号已复制', icon: 'none' })
    });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  onUnload() {
    // 详情数据是一次性传递，离开即清理，避免缓存里长期留存客户单号
    wx.removeStorageSync('sjs_current_package');
  }
});
