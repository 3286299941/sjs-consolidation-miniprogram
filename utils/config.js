// utils/config.js —— 环境配置
// ⚠️ 提审前必做（E-12 环境核对）：
//   1. USE_MOCK 改为 false
//   2. API_BASE_URL 换成已 ICP 备案、已配置到「服务器域名」的 HTTPS 域名
//   3. project.config.json 的 appid 换成正式 AppID，urlCheck 改回 true
//   4. 确认后端连的是正式库而非测试库
const ENV = {
  // 开发态：走 services/mock.js 虚拟数据，不动任何真实库；提审前改 false 并换正式 HTTPS 域名
  // 2026-11-05：已对接生产环境 YOUR_SERVER_IP（开发者工具勾选「不校验合法域名」后可直连）
  USE_MOCK: false,

  // 微信云开发模式：前端只走 wx.cloud.callFunction，不再直连任何域名（无需 ICP 备案/证书）
  // 前置：开发者工具开通云开发 → 上传 cloudfunctions/sjsApi → 配置云函数环境变量 SJS_CLOUD_SECRET
  //       → 填好 CLOUD_ENV → 把 USE_CLOUD 改 true。与 USE_MOCK 互斥，USE_MOCK 优先。
  // 2026-11-06：云开发环境 sigyl 已就绪（sjsApi 已部署 + SJS_CLOUD_SECRET 已配），
  // 正式切云函数模式：前端全部走 wx.cloud.callFunction，真机无需备案域名/HTTPS/调试模式
  USE_CLOUD: true,
  CLOUD_ENV: '<CLOUD_ENV_ID>',  // 微信开发者工具「云开发」控制台的环境 ID（2026-11-06 用户复制核对：sjgyl-，非 sigyl-）
  CLOUD_FUNC: 'sjsApi',

  // 已对接生产环境（微信开发者工具需勾选「不校验合法域名」；提审前换已备案 HTTPS 域名）
  API_BASE_URL: 'http://YOUR_SERVER_IP/wechat',

  TOKEN_KEY: 'sjs_token',
  PROFILE_KEY: 'sjs_profile',
  REQUEST_TIMEOUT: 10000,

  // 2 万+ 入库单：列表必须分页（策划案 13.5）
  PAGE_SIZE: 20,

  // onShow 刷新节流，30 秒内不重复拉同一份数据（E-07）
  REFRESH_THROTTLE_MS: 30 * 1000,

  // 需求变更 2026-11-05：包裹「已入库 / 待确认」时客户端不展示普/敏属性。
  // 服务端同样会在接口层过滤该字段，这里只控制交互层（想恢复展示改 false，前后端同步）
  HIDE_NATURE_UNTIL_CONFIRMED: true,

  // 管理端鉴权 2026-11-06：白名单即管理员，密码二重验证已下线
  // （openid 白名单由服务端 WX_ADMIN_OPENIDS 环境变量控制）

  // 客户名搜索输入防抖
  SEARCH_DEBOUNCE_MS: 300,

  // ---------- 发货意向（第四轮） ----------
  // 单独地址发货的最低重量门槛（公斤），后端 WX_DIRECT_MIN_WEIGHT 需保持一致
  DIRECT_MIN_WEIGHT_KG: 12,

  // 运费展示币种符号（待结算运费用）
  CURRENCY_SYMBOL: '¥',

  // 拼邮取货点信息：由仓库提供，后续可改成后端下发的配置
  PICKUP_POINT: {
    name: '速捷供应链 · 工业市取货点',
    address: '工业市（详细门牌由仓库补充）',
    hours: '周一至周六 10:00 - 18:00'
  },

  // 电商购物收货地址模板：新客户建档时一键复制（仓库自提点/中转仓信息，由仓库提供）
  // 模板结构：{address}  {company}  【客户名】【收货地址】【邮编】 / {contact}  {phone}
  WAREHOUSE: {
    address: '<WAREHOUSE_ADDR>',
    company: '速捷供应链',
    contact: '<CONTACT_NAME>',
    phone: '<CONTACT_PHONE>'
  }
};

module.exports = ENV;
