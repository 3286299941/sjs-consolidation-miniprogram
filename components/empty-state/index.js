// components/empty-state —— 空状态
// 输入：text / buttonText / mark；输出：action 事件（点击底部按钮时触发）
Component({
  properties: {
    text: { type: String, value: '暂无数据' },
    buttonText: { type: String, value: '' },
    mark: { type: String, value: '□' }
  },
  methods: {
    onAction() {
      this.triggerEvent('action');
    }
  }
});
