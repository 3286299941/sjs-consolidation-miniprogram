// components/package-card —— 入库单卡片
// 输入：item（页面层已做 nature 清洗与样式映射）；输出：cardtap / cardcopy 事件
// 注意：自定义事件不要命名为 tap，否则会和原生点击冒泡叠加导致父页面收到两次
Component({
  properties: {
    item: {
      type: Object,
      value: {},
      observer(val) {
        if (!val || !val.id) return;
        // 页面未预处理时兜底计算，避免 WXML 里出现未定义类名
        const patch = {};
        if (!val.status_class) {
          patch['status_class'] = val.status === '已入库' ? 'tag-blue'
            : val.status === '待打包' ? 'tag-orange'
              : (val.status === '已退货' || val.status === '已丢失') ? 'tag-red' : 'tag-green';
        }
        if (!val.nature_display) patch['nature_display'] = val.nature || '待核实';
        if (!val.nature_class) {
          patch['nature_class'] = val.nature_display === '普货' ? 'tag-green'
            : val.nature_display === '敏货' ? 'tag-orange' : 'tag-gray';
        }
        if (Object.keys(patch).length) {
          // 只改组件内部渲染副本，不回写父页面数据
          this.setData({ viewItem: Object.assign({}, val, {
            status_class: patch['status_class'] || val.status_class,
            nature_display: patch['nature_display'] || val.nature_display,
            nature_class: patch['nature_class'] || val.nature_class
          }) });
        } else {
          this.setData({ viewItem: val });
        }
      }
    }
  },
  data: { viewItem: {} },
  methods: {
    onTap() {
      this.triggerEvent('cardtap', { id: this.data.viewItem.id });
    },
    onCopy() {
      const no = this.data.viewItem.tracking_number || '';
      if (!no) return;
      wx.setClipboardData({ data: no });
      this.triggerEvent('cardcopy', { tracking_number: no });
    }
  }
});
