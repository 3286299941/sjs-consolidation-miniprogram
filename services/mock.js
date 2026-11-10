// services/mock.js —— 开发态假数据（USE_MOCK = true 时生效）
// ⚠️ 切真实环境请改 utils/config.js 的 USE_MOCK=false。
// 2026-11-06：管理端密码解锁已下线（白名单即管理员），mock 内不再模拟解锁流程。
const config = require('../utils/config');
const { normalizeNature } = require('../utils/format');

// 版本标记：开发态在 Console 打印，用来确认热重载 / 缓存是否已刷新到最新代码
if (config.USE_MOCK) {
  console.log('[SJS][mock] 2026-11-05-1445 loaded, shipments=pending|packed|shipped, freight=customer-level, status=incoming-lifecycle, confirm=on');
}

const customer = {
  id: 12,
  name: '张女士',
  customer_no: 'C202605260001',
  barcode: 'O28550',
  zip_code: '90210',
  is_vip: 1,
  phone_mask: '****6688'
};

// 客户名搜索池：真实环境由 /api/client/customers/search 从 customers 表脱敏返回
// 收货地址只到城市/区域粒度（美西华人区常用叫法），用于按邮编 + 区域匹配
const CUSTOMER_POOL = [
  { id: 12, name: '张女士', customer_no: 'C202605260001', zip_code: '91745', area: '工业市' },
  { id: 18, name: '陈先生', customer_no: 'C202606120007', zip_code: '91754', area: '蒙市' },
  { id: 23, name: '林女士', customer_no: 'C202606150019', zip_code: '91748', area: '罗兰岗' },
  { id: 31, name: '赵先生', customer_no: 'C202606200004', zip_code: '91776', area: '圣盖博' },
  { id: 41, name: '张伟', customer_no: 'C202607010023', zip_code: '91801', area: '阿罕布拉' },
  { id: 42, name: '张敏华', customer_no: 'C202607020031', zip_code: '91745', area: '工业市' }
];

let profile = { bind_status: 2, role: 1, customer };

const batches = [
  { id: 31, batch_no: '150批', zip_code: '90210', batch_type: '普', is_locked: 0, shipment_status: '待打包', customer_count: 2 },
  { id: 32, batch_no: '151批', zip_code: '10001', batch_type: '敏', is_locked: 0, shipment_status: '待打包', customer_count: 0 },
  { id: 30, batch_no: '149批', zip_code: '90210', batch_type: '普', is_locked: 1, shipment_status: '已发货', customer_count: 8 }
];

const intents = {
  31: {
    customer_id: 12, batch_id: 31,
    delivery_type: 'pooled', cargo_scope: 'all', intent_type: 'all',
    address_name: '', address_phone: '', address_line: '', address_zip: '',
    remark: '有两件衣服麻烦单独装袋',
    status: 0, updated_at: '2026-11-05 09:12'
  }
};

const packages = [
  { id: 1001, tracking_number: 'SF<PROD_ADMIN_PWD_HASH>7890123', nature: '普货', status: '已入库', entry_time: '2026-11-02 10:24', batch_id: null, batch_no: '', is_danger: 0, customer_remark: '易碎，请轻放', shelf_slot: 'A-03-02' },
  { id: 1002, tracking_number: 'YT9876543210456', nature: '敏货', status: '已入库', entry_time: '2026-11-02 14:08', batch_id: null, batch_no: '', is_danger: 0, customer_remark: '', shelf_slot: 'A-03-03' },
  { id: 1003, tracking_number: 'JD2026110300881', nature: '普货', status: '已入库', entry_time: '2026-11-03 09:41', batch_id: null, batch_no: '', is_danger: 0, customer_remark: '衣服', shelf_slot: 'A-04-01' },
  // 策划案 13.6：模拟一条脏值，服务端用 packed_packages.nature 兜底为敏货
  { id: 1004, tracking_number: 'EMS1103998877CN', nature: '已入库', packed_nature: '敏货', status: '已入库', entry_time: '2026-11-03 11:20', batch_id: null, batch_no: '', is_danger: 1, customer_remark: '含电池', shelf_slot: 'B-01-05' },
  { id: 1005, tracking_number: 'SF5566778899001', nature: '普货', status: '待打包', entry_time: '2026-10-28 16:02', batch_id: 30, batch_no: '149批', is_danger: 0, customer_remark: '', shelf_slot: '已下架' },
  { id: 1006, tracking_number: 'ZT2026102700456', nature: '敏货', status: '已打包', entry_time: '2026-10-27 13:15', batch_id: 30, batch_no: '149批', is_danger: 0, customer_remark: '', shelf_slot: '已下架' },
  { id: 1007, tracking_number: 'YD9988776655443', nature: '普货', status: '已发货', entry_time: '2026-10-21 08:50', batch_id: 29, batch_no: '148批', is_danger: 0, customer_remark: '书本', shelf_slot: '已下架' },
  { id: 1008, tracking_number: 'SF1112223334445', nature: '敏货', status: '已入库', entry_time: '2026-11-03 17:36', batch_id: null, batch_no: '', is_danger: 0, customer_remark: '', shelf_slot: 'B-02-01' }
];

// 第八轮：三态数据。pending 来自入库单；packed/shipped 来自打包记录（仓库确认后写入）
// 第十轮：字段按线上真实结构对齐 ——
//   serial_label 真实值形如 "1-1#8"，对外显示去掉 #id
//   contents_description 是包裹级品名（人工回填，多品名空白分隔）
//   total_packages 是包裹内快递件数；items 只放内含快递单号（品名不逐件）
const shipments = {
  pending: [
    { id: 1001, tracking_number: 'SF<PROD_ADMIN_PWD_HASH>7890123', entry_time: '2026-11-02 10:24', status: '已入库', stage: '待发货' },
    { id: 1002, tracking_number: 'YT9876543210456', entry_time: '2026-11-02 14:08', status: '已入库', stage: '待发货' },
    { id: 1003, tracking_number: 'JD2026110300881', entry_time: '2026-11-03 09:41', status: '已入库', stage: '待发货' },
    { id: 1004, tracking_number: 'EMS1103998899CN', entry_time: '2026-11-01 16:20', status: '待打包', stage: '打包中' }
  ],
  packed: [
    {
      id: 501, batch_no: '131批', serial_label: 'p1-1#8', package_label: '131批 p1-1',
      item_count: 6, nature: '普货', nature_display: '普货', is_full_box: 1,
      contents_description: '鞋子 衣服 饰品',
      actual_weight: 6.8, volume_weight: 7.9,
      dimension_display: '45 × 35 × 30 cm', has_dimension: true,
      goods_names: ['鞋子', '衣服', '饰品'], goods_text: '鞋子 / 衣服 / 饰品', has_goods: true,
      time_at: '2026-11-04 15:20', items_available: true,
      items: [
        { id: 9001, tracking_number: 'YT7700<PROD_ADMIN_PWD_HASH>789' },
        { id: 9002, tracking_number: 'YT7700<PROD_ADMIN_PWD_HASH>790' },
        { id: 9003, tracking_number: 'SF7700<PROD_ADMIN_PWD_HASH>791' },
        { id: 9004, tracking_number: 'JD7700<PROD_ADMIN_PWD_HASH>792' },
        { id: 9005, tracking_number: 'ZT7700<PROD_ADMIN_PWD_HASH>793' },
        { id: 9006, tracking_number: 'YD7700<PROD_ADMIN_PWD_HASH>794' }
      ]
    },
    {
      id: 502, batch_no: '131批', serial_label: 'p1-2#9', package_label: '131批 p1-2',
      item_count: 4, nature: '敏货', nature_display: '敏货', is_full_box: 0,
      contents_description: '蓝牙耳机  电动牙刷  香水',
      actual_weight: 3.2, volume_weight: 4.4,
      dimension_display: '38 × 28 × 25 cm', has_dimension: true,
      goods_names: ['蓝牙耳机', '电动牙刷', '香水'], goods_text: '蓝牙耳机 / 电动牙刷 / 香水',
      has_goods: true, time_at: '2026-11-04 15:26', items_available: true,
      items: [
        { id: 9101, tracking_number: 'SF8800<PROD_ADMIN_PWD_HASH>701' },
        { id: 9102, tracking_number: 'JD8800<PROD_ADMIN_PWD_HASH>702' },
        { id: 9103, tracking_number: 'EMS8800<PROD_ADMIN_PWD_HASH>703' },
        { id: 9104, tracking_number: 'YT8800<PROD_ADMIN_PWD_HASH>704' }
      ]
    }
  ],
  shipped: [
    {
      id: 401, batch_no: '130批', serial_label: 'p1-1#6', package_label: '130批 p1-1',
      item_count: 5, nature: '普货', nature_display: '普货', is_full_box: 1,
      contents_description: '牛仔裤 双肩背包 厨具 床品',
      actual_weight: 12.5, volume_weight: 10.8, chargeable_weight: 12.5,
      dimension_display: '50 × 40 × 35 cm', has_dimension: true,
      goods_names: ['牛仔裤', '双肩背包', '厨具', '床品'], goods_text: '牛仔裤 / 双肩背包 / 厨具 / 床品',
      has_goods: true, time_at: '2026-10-30 11:05',
      items_available: true,
      items: [
        { id: 9201, tracking_number: 'SF6600<PROD_ADMIN_PWD_HASH>701' },
        { id: 9202, tracking_number: 'YT6600<PROD_ADMIN_PWD_HASH>702' },
        { id: 9203, tracking_number: 'JD6600<PROD_ADMIN_PWD_HASH>703' },
        { id: 9204, tracking_number: 'ZT6600<PROD_ADMIN_PWD_HASH>704' },
        { id: 9205, tracking_number: 'YD6600<PROD_ADMIN_PWD_HASH>705' }
      ]
    },
    {
      // 这条故意留空品名：真实场景里建包裹时 contents_description 就是空，等操作端回填
      id: 402, batch_no: '130批', serial_label: 'p2-1#7', package_label: '130批 p2-1',
      item_count: 3, nature: '敏货', nature_display: '敏货', is_full_box: 0,
      contents_description: '',
      goods_names: [], goods_text: '', has_goods: false, time_at: '2026-10-30 11:12',
      actual_weight: 8.2, volume_weight: 9.6, chargeable_weight: 10,
      // 尺寸也故意留空：没量过的包裹就是没有值
      dimension_display: '', has_dimension: false,
      items_available: true,
      items: [
        { id: 9301, tracking_number: 'SF5500<PROD_ADMIN_PWD_HASH>701' },
        { id: 9302, tracking_number: 'JD5500<PROD_ADMIN_PWD_HASH>702' },
        { id: 9303, tracking_number: 'EMS5500<PROD_ADMIN_PWD_HASH>703' }
      ]
    }
  ]
};


// 本周选件确认（可变状态，便于开发态验证提交/取消/锁定）
const confirmState = {
  week: '2026-W45',
  item_ids: [],
  status: '',
  confirmed_at: '',
  remark: '',
  locked: false,
  // 合并后的发货方式（原「发货意向」页职责，随 confirm-ship 一并提交）
  delivery_type: '',
  cargo_scope: 'all',
  address: null
};

const bindings = [
  { id: 1, openid: 'oXXXX_demo_001', customer_name: '李先生', customer_no: 'C202606010002', zip_code: '91754', area: '蒙市', address: '蒙市', bind_status: 1, created_at: '2026-11-05 08:40' },
  { id: 2, openid: 'oXXXX_demo_002', customer_name: '王女士', customer_no: 'C202606080011', zip_code: '91745', area: '工业市', address: '工业市', bind_status: 1, created_at: '2026-11-05 09:05' }
];

// 管理端看板保留普敏拆分：内部排期需要，客户端接口才隐藏
const boardRows = [
  {
    customer_id: 12, customer_name: '张女士', customer_no: 'C202605260001',
    delivery_type: 'pooled', cargo_scope: 'all', intent_type: 'all', status: 0,
    package_count: 4, normal_count: 2, sensitive_count: 2, updated_at: '2026-11-05 09:12'
  },
  {
    customer_id: 18, customer_name: '陈先生', customer_no: 'C202606120007',
    delivery_type: 'pooled', cargo_scope: 'normal_only', intent_type: 'normal_only', status: 0,
    package_count: 3, normal_count: 2, sensitive_count: 1, updated_at: '2026-11-05 08:55'
  },
  {
    customer_id: 23, customer_name: '林女士', customer_no: 'C202606150019',
    delivery_type: 'none', cargo_scope: 'all', intent_type: 'none', status: 1,
    package_count: 5, normal_count: 4, sensitive_count: 1, updated_at: '2026-11-04 19:30'
  },
  {
    customer_id: 31, customer_name: '赵先生', customer_no: 'C202606200004',
    delivery_type: 'direct', cargo_scope: 'sensitive_only', intent_type: 'sensitive_only', status: 0,
    package_count: 2, normal_count: 1, sensitive_count: 1, updated_at: '2026-11-05 09:20',
    address_name: '赵先生', address_phone: '13600009012',
    address_line: '1234 S Azusa Ave, City of Industry, CA', address_zip: '91745',
    remark: '客户要求周六前发出，箱子外请标注易碎'
  }
];

function parse(path) {
  const [p, qs] = String(path).split('?');
  const query = {};
  (qs || '').split('&').forEach((pair) => {
    if (!pair) return;
    const [k, v] = pair.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return { p, query };
}

function ok(data) {
  return new Promise((resolve) => setTimeout(() => resolve(data), 220));
}

function fail(message) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), 220));
}

// (脱敏函数已移除：客户匹配不再隐藏信息)

// 与服务端 _display_address 保持一致：区域级原样返回，只做长度上限
function displayArea(area) {
  return String(area || '').trim().slice(0, 40);
}

/** 客户端列表：待确认（已入库）包裹不下发普敏原始字段，只给「待确认」 */
function decorate(list) {
  const hide = config.HIDE_NATURE_UNTIL_CONFIRMED;
  return list.map((item) => {
    // 打包前（已入库 / 待打包）普敏属性未知；这是业务硬规则，不受开关影响
    const hidden = ['已入库', '待打包'].indexOf(item.status) >= 0;
    const nature = hidden ? '待确认' : normalizeNature(item.nature, item.packed_nature);
    const out = {
      ...item,
      nature_display: nature,
      nature_class: hidden ? 'tag-gray'
        : nature === '普货' ? 'tag-green'
          : nature === '敏货' ? 'tag-orange' : 'tag-gray',
      nature_visible: !hidden,
      status_class: item.status === '已入库' ? 'tag-blue'
        : item.status === '待打包' ? 'tag-orange'
          : item.status === '已退货' || item.status === '已丢失' ? 'tag-red'
            : 'tag-green'
    };
    if (hidden) {
      delete out.nature;
      delete out.packed_nature;
    }
    return out;
  });
}

function handle(path, method, data, headers) {
  const { p, query } = parse(path);
  const M = String(method || 'GET').toUpperCase();

  // ---------- 客户端 ----------
  if (p === '/api/client/login' && M === 'POST') {
    return ok({ token: 'mock_token', profile });
  }
  if (p === '/api/client/profile') return ok(profile);

  // 按客户名搜索：直接返回真实信息，最多 10 条
  if (p === '/api/client/customers/search' && M === 'GET') {
    const kw = String(query.keyword || '').trim();
    if (!kw.length) return fail('请输入客户名或客户号');
    const list = CUSTOMER_POOL.filter((c) => c.name.indexOf(kw) >= 0)
      .slice(0, 10)
      .map((c) => ({
        id: c.id,
        name: c.name,
        customer_no: c.customer_no,
        zip_code: c.zip_code,
        area: displayArea(c.area),
        address: displayArea(c.area),
        address_masked: false
      }));
    return ok({ list });
  }

  // 绑定：只接受搜索选中的 customer_id + 手机尾号
  if (p === '/api/client/bind' && M === 'POST') {
    // 第三轮：不再校验手机号，最终由管理端审核兜底
    const hit = CUSTOMER_POOL.find((c) => Number(c.id) === Number(data.customer_id));
    if (!hit) return fail('请先搜索并选择客户名');
    profile = {
      bind_status: 1,
      role: 1,
      customer: Object.assign({}, customer, {
        id: hit.id, name: hit.name, customer_no: hit.customer_no
      })
    };
    return ok({ bind_status: 1, message: '已提交，等待仓库审核' });
  }

  if (p === '/api/client/shipments' && M === 'GET') {
    const tab = String(query.tab || 'pending');
    const src = shipments[tab];
    if (!src) return fail('未知的状态分类');
    let list = src.slice();
    const kw = String(query.keyword || '').toLowerCase();
    if (kw) {
      list = list.filter((i) => {
        const text = tab === 'pending' ? i.tracking_number : i.package_label;
        return String(text || '').toLowerCase().indexOf(kw) >= 0;
      });
    }
    const page = Number(query.page || 1);
    const size = Number(query.size || 20);
    return ok({
      tab, list: list.slice((page - 1) * size, page * size), total: list.length, page, size,
      // 待付运费合计：线上取 customers.pending_freight
      pending_freight: 662.5,
      // 运费账单（客户级，carton_id 线上全为 NULL，不归因到包裹）
      unsettled_total: 662.5,
      bills: tab === 'shipped'
        ? [
          { id: 2, amount: 350, status: '待结算', created_at: '2026-10-30 11:20' },
          { id: 1, amount: 312.5, status: '待结算', created_at: '2026-10-30 11:10' }
        ]
        : []
    });
  }

  if (p === '/api/client/confirm-candidates' && M === 'GET') {
    // 与服务端一致：只返回「已入库」包裹，无批次概念
    const list = shipments.pending
      .filter((i) => i.status === '已入库')
      .map((i) => ({
        id: i.id,
        tracking_number: i.tracking_number,
        entry_time: i.entry_time,
        status: '已入库',
        selected: confirmState.item_ids.indexOf(i.id) >= 0
      }));
    return ok({
      week_label: confirmState.week,
      deadline: '11-11 24:00',
      list,
      total: list.length,
      intent: confirmState.status
        ? {
          status: confirmState.status,
          confirmed_at: confirmState.confirmed_at,
          item_count: confirmState.item_ids.length,
          remark: confirmState.remark,
          locked: confirmState.locked,
          locked_at: ''
        }
        : null
    });
  }

  if (p === '/api/client/confirm-ship' && M === 'POST') {
    if (confirmState.locked) return fail('仓库已接单，如需修改请联系仓库');
    const ids = (data.item_ids || [])
      .map((x) => Number(x))
      .filter((n) => n > 0);
    // 合并入口：发货方式随本次确认一并提交（none = 全部留仓）
    const dt = String(data.delivery_type || '');
    if (!dt) return fail('请选择发货方式');
    if (['pooled', 'direct', 'none'].indexOf(dt) < 0) return fail('请选择发货方式');
    confirmState.delivery_type = dt;
    confirmState.cargo_scope = dt === 'none' ? 'all' : String(data.cargo_scope || 'all');
    confirmState.address = dt === 'direct' ? (data.address || null) : null;
    confirmState.item_ids = dt === 'none' ? [] : ids;
    confirmState.status = 'active';
    confirmState.confirmed_at = '2026-11-05 14:40';
    confirmState.remark = String(data.remark || '');
    return ok({
      week_label: confirmState.week,
      item_count: confirmState.item_ids.length,
      sync: { applied: confirmState.item_ids.length, delivery_type: dt },
      message: dt === 'none' ? '本周全部留仓'
        : (confirmState.item_ids.length ? '本周已确认 ' + confirmState.item_ids.length + ' 件，已同步仓库' : '本周全部留仓')
    });
  }

  if (p === '/api/client/confirm-cancel' && M === 'POST') {
    if (confirmState.locked) return fail('仓库已接单，无法取消');
    confirmState.status = 'cancelled';
    confirmState.item_ids = [];
    return ok({ message: '已取消本周确认' });
  }

  if (p === '/api/admin/shipment_intents' && M === 'GET') {
    const pending = shipments.pending.length;
    const list = confirmState.status
      ? [{
        id: 1,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_no: customer.customer_no,
        zip_code: customer.zip_code,
        week_label: confirmState.week,
        item_ids: JSON.stringify(confirmState.item_ids),
        item_id_list: confirmState.item_ids,
        item_count: confirmState.item_ids.length,
        pending_count: pending,
        intent_status: confirmState.status,
        confirmed_at: confirmState.confirmed_at,
        remark: confirmState.remark,
        operator_locked_at: confirmState.locked ? '2026-11-05 15:00' : '',
        locked: confirmState.locked,
        is_all: confirmState.item_ids.length >= pending
      }]
      : [];
    return ok({ week_label: confirmState.week, list, ready: true });
  }

  if (p === '/api/admin/intent/lock' && M === 'POST') {
    const cids = data.customer_ids || [];
    if (!cids.length) return fail('请指定客户');
    confirmState.locked = true;
    if (confirmState.status) confirmState.status = 'locked';
    return ok({ locked: cids.length });
  }

  if (p === '/api/client/packages') {
    let list = packages.slice();
    if (query.status) list = list.filter((i) => i.status === query.status);
    // 隐藏期内忽略普敏筛选：否则筛选结果本身会泄露属性
    if (query.nature && !config.HIDE_NATURE_UNTIL_CONFIRMED) {
      list = list.filter((i) => normalizeNature(i.nature, i.packed_nature) === query.nature);
    }
    if (query.batch_id) list = list.filter((i) => String(i.batch_id) === String(query.batch_id));
    if (query.keyword) {
      const kw = String(query.keyword).toLowerCase();
      list = list.filter((i) => String(i.tracking_number).toLowerCase().indexOf(kw) >= 0);
    }
    const page = Number(query.page || 1);
    const size = Number(query.size || 20);
    return ok({ list: decorate(list.slice((page - 1) * size, page * size)), total: list.length, page, size });
  }

  // 按包裹备注（虚拟数据：仅回写内存里的 packages，不落库）
  if (p === '/api/client/package/remark' && M === 'POST') {
    const pid = Number(data.package_id);
    const remark = String(data.remark || '').slice(0, 200);
    const hit = packages.find((i) => i.id === pid);
    if (!hit) return fail('包裹不存在');
    hit.customer_remark = remark;
    return ok({ package_id: pid, remark, message: '备注已保存（虚拟数据）' });
  }

  if (p === '/api/client/batches/pending') {
    const pending = batches
      .filter((b) => b.zip_code === customer.zip_code && !b.is_locked)
      .map((b) => {
        const pool = packages.filter((i) => i.status === '已入库');
        // 打包前属性未知：只给件数，不做普/敏拆分
        const counts = { package_count: pool.length, counts_hidden: true, nature_known: false };
        // 未打包的包裹没有重量/尺寸：不返回重量，等仓库打包称重后核验 12kg
        return Object.assign({}, b, counts, {
          intent: intents[b.id] || null
        });
      });
    return ok({ zip_code: customer.zip_code, batches: pending });
  }

  if (p === '/api/client/intent' && M === 'GET') {
    // 合并后确认页读取发货方式草稿：无 batch_id 时返回 confirmState 里存的
    if (!query.batch_id) {
      if (!confirmState.delivery_type) return ok({ intent: null });
      const a = confirmState.address || {};
      return ok({
        intent: {
          customer_id: customer.id,
          delivery_type: confirmState.delivery_type,
          cargo_scope: confirmState.cargo_scope,
          intent_type: confirmState.delivery_type === 'none' ? 'none' : confirmState.cargo_scope,
          address_name: a.name || '',
          address_phone: a.phone || '',
          address_line: a.line || '',
          address_zip: a.zip || '',
          remark: confirmState.remark,
          status: 0
        }
      });
    }
    return ok({ intent: intents[Number(query.batch_id)] || null });
  }
  if (p === '/api/client/intent' && M === 'POST') {
    const delivery = String(data.delivery_type || '');
    if (['pooled', 'direct', 'none'].indexOf(delivery) < 0) return fail('请选择发货方式');
    let scope = String(data.cargo_scope || 'all');
    if (delivery === 'none') scope = 'all';
    if (['all', 'normal_only', 'sensitive_only'].indexOf(scope) < 0) return fail('请选择货物范围');
    const addr = data.address || {};
    if (delivery === 'direct' && (!addr.name || !addr.phone || !addr.line || !addr.zip)) {
      return fail('请完整填写收货地址');
    }
    intents[Number(data.batch_id)] = {
      customer_id: customer.id,
      batch_id: Number(data.batch_id),
      delivery_type: delivery,
      cargo_scope: scope,
      // 兼容旧字段：intent_type 只表达货物范围
      intent_type: delivery === 'none' ? 'none' : scope,
      address_name: delivery === 'direct' ? addr.name : '',
      address_phone: delivery === 'direct' ? addr.phone : '',
      address_line: delivery === 'direct' ? addr.line : '',
      address_zip: delivery === 'direct' ? addr.zip : '',
      // 客户备注：操作端读同一张表即可拿到
      remark: String(data.remark || '').slice(0, 200),
      status: 0,
      updated_at: '2026-11-05 09:40'
    };
    return ok({ intent: intents[Number(data.batch_id)], message: '已提交，等待仓库确认' });
  }

  // ---------- 管理端（2026-11-06：白名单即管理员，密码解锁已下线） ----------

  if (p === '/api/admin/batches' && M === 'GET') return ok({ list: batches });

  if (p === '/api/admin/batch' && M === 'POST') {
    if (!data.batch_no || !data.zip_code) return fail('批次号和邮编不能为空');
    const dup = batches.find((b) => b.zip_code === data.zip_code && !b.is_locked);
    if (dup) return fail('该邮编已有未锁定批次（' + dup.batch_no + '），请先锁定或发货');
    const created = {
      id: Date.now(), batch_no: data.batch_no, zip_code: data.zip_code,
      batch_type: data.batch_type || '', normal_channel: data.normal_channel || '',
      sensitive_channel: data.sensitive_channel || '', is_locked: 0,
      shipment_status: '待打包', customer_count: 0
    };
    batches.unshift(created);
    return ok({ batch: created });
  }

  if (p === '/api/admin/intents' && M === 'GET') {
    const rows = boardRows.map((r) => ({ ...r, batch_id: Number(query.batch_id || 31) }));
    const summary = {
      total: rows.length,
      all: rows.filter((r) => r.intent_type === 'all').length,
      normal_only: rows.filter((r) => r.intent_type === 'normal_only').length,
      sensitive_only: rows.filter((r) => r.intent_type === 'sensitive_only').length,
      none: rows.filter((r) => r.intent_type === 'none').length,
      confirmed: rows.filter((r) => r.status === 1).length,
      pooled: rows.filter((r) => r.delivery_type === 'pooled').length,
      direct: rows.filter((r) => r.delivery_type === 'direct').length,
      none_delivery: rows.filter((r) => r.delivery_type === 'none').length
    };
    return ok({ summary, list: rows });
  }

  if (p === '/api/admin/intent/confirm' && M === 'POST') {
    rows_confirm();
    return ok({ confirmed: data.customer_ids ? data.customer_ids.length : 1, message: '已确认，待打包清单已生成（未改动包裹状态）' });
  }

  if (p === '/api/admin/bindings') return ok({ list: bindings, pending_count: bindings.filter((b) => b.bind_status === 1).length });

  if (p === '/api/admin/bind/audit' && M === 'POST') {
    const row = bindings.find((b) => b.id === Number(data.user_id));
    if (!row) return fail('绑定申请不存在');
    row.bind_status = data.action === 'approve' ? 2 : 3;
    return ok({ bind_status: row.bind_status });
  }

  return fail('mock 未覆盖该接口：' + M + ' ' + p);
}

function rows_confirm() {
  boardRows.forEach((r) => { if (r.status === 0) r.status = 1; });
}

module.exports = { handle };
