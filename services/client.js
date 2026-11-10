// services/client.js —— 后端接口唯一出口
// 接口契约变更已登记到《小程序项目档案》；新增：客户名搜索、管理端解锁
const { request, uploadFile } = require('../utils/request');
const { toQuery } = require('../utils/format');

const C = '/api/client';
const A = '/api/admin';

module.exports = {
  // ---------- 客户端 ----------
  login: (code) => request(C + '/login', { method: 'POST', data: { code }, auth: false }),
  // 绑定改为「按客户名搜索 → 下拉选择」，payload = { customer_id, phone_last4 }
  bind: (payload) => request(C + '/bind', { method: 'POST', data: payload }),
  // 新客户自助建档：payload = { name, zip_code, address, phone, remark, is_vip,
  //   invoice_contact, invoice_phone, invoice_address, invoice_zip, company_name }
  // 写入系统 customers 表并立即绑定当前微信（待仓库审核）
  clientRegister: (payload) => request(C + '/customer/register', { method: 'POST', data: payload }),
  searchCustomers: (keyword) => request(C + '/customers/search' + toQuery({ keyword })),
  getProfile: () => request(C + '/profile'),
  getPackages: (query) => request(C + '/packages' + toQuery(query)),
  // 三态：pending（待发货）/ packed（已打包）/ shipped（已发货）
  getShipments: (query) => request(C + '/shipments' + toQuery(query)),
  getPendingBatches: () => request(C + '/batches/pending'),
  getIntent: () => request(C + '/intent'),
  // 客户端「我的账单」：已派发的批次账单列表
  getMyBills: () => request(C + '/bills'),
  // 单个批次账单详情（仅已派发可见）
  getBatchBill: (bid) => request(C + '/batch/' + bid + '/bill'),
  // 客户端：尺寸确认列表（已推送且含本人包裹的批次）
  clientDimConfirms: () => request(C + '/dim-confirms'),
  // 客户端：查看某批次已推送的尺寸信息（仅本人包裹）
  clientBatchDims: (bid) => request(C + '/batch/' + bid + '/dims'),
  // 客户端：确认本批次尺寸信息无误
  clientConfirmDims: (bid) => request(C + '/batch/' + bid + '/confirm-dims', { method: 'POST', data: {} }),
  // 客户端：本人 VIP 单独发货批次列表；管理员传 {all:1} 看全部（预览）
  clientVipBatches: (opts) => request(C + '/vip-batches' + (opts && opts.all ? '?all=1' : '')),
  submitIntent: (payload) => request(C + '/intent', { method: 'POST', data: payload }),
  // 本周选件确认（远程确认待打包）
  confirmCandidates: () => request(C + '/confirm-candidates'),
  confirmShip: (payload) => request(C + '/confirm-ship', { method: 'POST', data: payload }),
  confirmCancel: () => request(C + '/confirm-cancel', { method: 'POST', data: {} }),

  // ---------- 管理端 ----------
  adminGetBatches: (query) => request(A + '/batches' + toQuery(query || {})),
  adminDashboard: () => request(A + '/dashboard'),
  adminCreateBatch: (payload) => request(A + '/batch', { method: 'POST', data: payload }),
  adminSettleFreight: (cid) => request(A + '/customer/' + cid + '/settle-freight', { method: 'POST', data: {} }),
  adminFreightDetail: (cid) => request(A + '/customer/' + cid + '/freight-detail'),
  // 批次账单：批次内客户罗列（分普/敏）+ 按客户结清
  adminBatchBill: (bid) => request(A + '/batch/' + bid + '/bill'),
  // nature 可省略（结清该客户本批次全部）或传 'normal' / 'sensitive'（按普/敏分开结清）
  adminBatchCustomerSettleFreight: (bid, cid, nature) =>
    request(A + '/batch/' + bid + '/customer/' + cid + '/settle-freight',
      { method: 'POST', data: nature ? { nature } : {} }),
  // 设置/清除某客户在某批次、指定普/敏组的手动计费重（chargeable 传 null/空 = 恢复系统计算值）
  adminFreightOverride: (bid, cid, nature, chargeable) =>
    request(A + '/batch/' + bid + '/freight-override',
      { method: 'POST', data: { customer_id: cid, nature, chargeable_weight: chargeable } }),
  // 派发批次账单给客户端查看
  adminDispatchBill: (bid) =>
    request(A + '/batch/' + bid + '/dispatch-bill', { method: 'POST', data: {} }),
  // 撤回已派发的批次账单（客户端立即看不到）
  adminRecallBill: (bid) =>
    request(A + '/batch/' + bid + '/recall-bill', { method: 'POST', data: {} }),
  // 尺寸信息推送确认：管理端推送批次包裹尺寸给客户，客户确认后才允许派发账单
  adminPushDims: (bid) =>
    request(A + '/batch/' + bid + '/push-dims', { method: 'POST', data: {} }),
  adminRecallDims: (bid) =>
    request(A + '/batch/' + bid + '/recall-dims', { method: 'POST', data: {} }),
  adminIssueCoupon: (cid, payload) => request(A + '/customer/' + cid + '/issue-coupon', { method: 'POST', data: payload }),
  adminCouponList: (cid) => request(A + '/customer/' + cid + '/coupons'),
  adminRedeemCoupon: (cid, code) => request(A + '/customer/' + cid + '/redeem-coupon', { method: 'POST', data: { code } }),
  adminGetIntents: (batchId) => request(A + '/intents' + toQuery({ batch_id: batchId })),
  adminConfirmIntent: (payload) => request(A + '/intent/confirm', { method: 'POST', data: payload }),
  adminGetBindings: () => request(A + '/bindings'),
  adminAuditBind: (payload) => request(A + '/bind/audit', { method: 'POST', data: payload }),
  adminShipmentIntents: (weekLabel) => request(A + '/shipment_intents' + toQuery({ week_label: weekLabel })),
  adminLockIntent: (payload) => request(A + '/intent/lock', { method: 'POST', data: payload }),
  // 客户总览：绑定状态 + 包裹统计 + 待付运费（query: keyword/page/size）
  adminCustomers: (query) => request(A + '/customers' + toQuery(query || {})),
  // 按客户查看包裹：与客户端 getShipments 同一实现（tab: pending/packed/shipped）
  adminCustomerPackages: (cid, query) => request(A + '/customer/' + cid + '/packages' + toQuery(query || {})),
  // 代客户提交本周发货确认（payload 同客户端 confirmShip）
  adminConfirmShipFor: (cid, payload) => request(A + '/customer/' + cid + '/confirm-ship', { method: 'POST', data: payload }),
  // 代客户取消本周确认
  adminCancelConfirmFor: (cid) => request(A + '/customer/' + cid + '/confirm-cancel', { method: 'POST', data: {} }),

  // ---------- 2026-11-06 管理端增强 ----------
  // 客户新建/删除（写系统 customers 表，与系统端同步）
  adminCreateCustomer: (payload) => request(A + '/customer/create', { method: 'POST', data: payload }),
  adminDeleteCustomer: (cid) => request(A + '/customer/' + cid + '/delete', { method: 'POST', data: {} }),
  adminCustomerLookup: (keyword) => request(A + '/customer/lookup' + toQuery({ keyword })),
  // 入库单号操作：action = delete / return / restore / mark-orphan
  adminInboundAction: (pid, action, payload) =>
    request(A + '/inbound/' + pid + '/' + action, { method: 'POST', data: payload || {} }),
  // 无主件（系统 is_anonymous 口径）：列表 / 归户 / 删除
  adminOrphans: () => request(A + '/orphans'),
  adminOrphanAssign: (pid, customerId) =>
    request(A + '/orphan/' + pid + '/assign', { method: 'POST', data: { customer_id: customerId } }),
  adminOrphanDelete: (pid) => request(A + '/orphan/' + pid + '/delete', { method: 'POST', data: {} }),
  // 批次物流轨迹（管理端编辑 / 客户端同步查看）
  adminBatchTracks: (bid) => request(A + '/batch/' + bid + '/tracks'),
  adminSaveBatchTracks: (bid, rows) =>
    request(A + '/batch/' + bid + '/tracks', { method: 'POST', data: { rows } }),
  // 物流轨迹：不传参=本人全部批次；传 {batch_id} 只看该批次（单独地址批次卡入口）
  clientTracks: (opts) => request(C + '/tracks' + toQuery(opts || {})),

  // ---------- 运费「已付款」标记（仅管理端可操作；客户端只读同步） ----------
  adminTogglePaid: (pid) => request(A + '/package/' + pid + '/toggle-paid', { method: 'POST', data: {} }),

  // ---------- 微信资料（头像 / 昵称） ----------
  uploadAvatar: (filePath) => uploadFile('/api/client/avatar', filePath),
  saveNickname: (nickname) => request(C + '/nickname', { method: 'POST', data: { nickname } })
};
