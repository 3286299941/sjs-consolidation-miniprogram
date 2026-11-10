# 集运小程序（速捷盛 SJSCM · 客户端）

> 跨境电商集运业务的微信小程序客户端，配套后端见 [`sjs-consolidation-system`](https://github.com/3286299941/sjs-consolidation-system)。本仓库为**脱敏开源版**，已移除服务器地址、AppID、云环境 ID、联系电话等敏感信息，仅保留前端架构与交互逻辑，供技术交流与简历展示。

## 一、项目简介

面向集运客户的微信小程序，提供：包裹查询、入库/待打包/已打包/已发货跟踪、运费账单、VIP 单独地址、发货意向确认、轨迹查看等功能。采用**分包架构**，管理端（packageAdmin）与客户端（packageClient）分离。

## 二、技术栈

- 微信原生小程序（WXML / WXSS / JS）
- 分包：`packageClient`（客户端）、`packageAdmin`（管理端）
- 网络层：`services/client.js` 统一封装，支持三种模式：
  - `USE_MOCK`：本地虚拟数据（开发期不碰真实库）
  - `USE_CLOUD`：走微信云函数 `sjsApi`（生产推荐，前端不直连任何域名）
  - 直连模式：`API_BASE_URL` 指向后端 HTTPS 域名
- 云函数代理 `cloudfunctions/sjsApi`：对 openid 做 HMAC-SHA256 签名，服务端只认签名

## 三、分包结构

```
pages/             # 公共页面（登录、我的、轨迹等）
packageClient/     # 客户端业务：我的货物、账单、单独地址、尺寸确认
packageAdmin/      # 管理端：批次账单、计费设定、尺寸推送
components/        # 复用组件
services/          # 接口封装
utils/             # config.js 等
cloudfunctions/    # sjsApi 安全代理
assets/ styles/    # 资源与样式
```

## 四、关键业务交互

- **VIP 单独地址**：入口在「我的货物」第四个 tab（仅 is_vip 或管理员可见），与常规批次发货相互独立。
- **运费门控**：包裹所属批次已「派发账单」(`batch_bill_dispatch`) 后，客户端才可见运费，否则 `freight_visible=false`。管理端代客视角不受限。
- **尺寸信息推送确认**：管理端推送尺寸信息给客户 → 客户逐单确认 → **未全部确认则卡住账单派发**（与派发账单同机制的闭环）。
- **轨迹**：`batch_tracks` 表按普/敏两组，进度由管理端 `current_node` 决定，客户端默认折叠两级。

---

## 五、重大漏洞与修复（技术亮点）

> 以下为小程序端推进过程中修复的真实高影响问题。

### 漏洞 1：批次计费设定失灵——下标错位改错客户（前端数据绑定 Bug）

- **现象**：管理端「批次账单」里给某客户手填计费重并保存，结果计费落到了**另一个客户**头上，功能形同虚设。
- **根因**：`packageAdmin/batch-bill/batch-bill.js` 用 `wx:for="{{filteredItems}}"` 渲染（筛选后的可见列表），每个 item 绑定 `data-idx` 为**可见下标**；但 JS 在输入/失焦时用该 `idx` 去读写 `this.data.items[idx]`（**全量数组**）。一旦列表被筛选，可见下标与全量下标错位，写入目标错误。同时误读了响应字段 `res.effective`（实际应为 `res.chargeable`）。
- **修复**：
  1. 新增 `_realIdx(cid)`，用客户 ID 反查 `this.data.items` 中的真实索引；
  2. wxml 两个输入框补 `data-cid`，JS 全部改用 `data-cid` 定位；
  3. 修正误读字段。
- **验证**：多选客户、筛选后再逐一修改计费重，落库均精确对应正确客户。

### 漏洞 2：客户端「已打包」列表恒为空（状态字段误用）

- **现象**：客户端「已打包」tab 永远不显示任何包裹。
- **根因**：该 tab 查询用的是 `packed_packages.status`，但打包数据的状态字段实际挂在 `incoming.status`，两表状态语义不同，导致查询条件恒不满足。
- **修复**：改为以 `incoming` 的打包态（已打包/待合箱/已合箱/已发货/已完成）作为过滤口径，与后端 `_FREIGHT_PACKED_STATUSES` 保持一致。

### 漏洞 3：尺寸确认闭环缺失，账单可被提前派发（业务流程 Bug）

- **现象**：管理端在尺寸信息尚未被客户确认的情况下就能派发账单，导致客户对账时尺寸/件数未定稿。
- **修复**：新增尺寸信息推送/确认机制：
  - 表 `batch_dim_push`（是否已推送）、`batch_dim_confirm`（客户逐单确认）
  - 管理端接口 `push-dims` / `recall-dims`；客户端 `GET /batch/<bid>/dims`、`POST confirm-dims`
  - **门控**：`dispatch-bill` 派发前检查 `dim.all_confirmed`，未全确认则拒绝并提示「尚有客户未确认尺寸信息，无法派发账单」
- **收益**：尺寸确认与账单派发形成强一致闭环，避免金额纠纷。

### 漏洞 4：云函数代理伪造身份风险（安全设计）

- **现象**：若前端直连后端并自行传递 openid，攻击者可伪造任意客户身份。
- **修复**：引入云函数 `sjsApi` 作为安全代理——openid 由微信云开发上下文**自动下发**（前端不可篡改），云函数用共享密钥 `SJS_CLOUD_SECRET` 对其做 HMAC-SHA256 签名，通过 `X-Sjs-Cloud-*` 头传给服务端；服务端 `WX_CLOUD_TRUST=1` 只认签名。前端彻底不接触密钥与真实 openid。

---

## 六、脱敏说明

本仓库已做如下替换：服务器 IP → `YOUR_SERVER_IP`、微信 AppID → `<WX_APP_ID>`、云环境 ID → `<CLOUD_ENV_ID>`、联系电话/联系人 → `<CONTACT_PHONE>`/`<CONTACT_NAME>`。生产密钥均走环境变量，不入库。
