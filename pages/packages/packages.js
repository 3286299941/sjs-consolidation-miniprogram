// pages/packages —— 我的货物（四态：待发货 / 已打包 / 已发货 / VIP发货）
// 数据源不同：
//   待发货  ← incoming_packages（仓库收货，status='已入库'），只展示单号 + 入库时间
//   已打包  ← packed_packages（仓库打包确认后写入），展示包裹号（如 131批 p1-1）+ 件数等
//   已发货  ← packed_packages（status='已发货'），在已打包基础上加计费重与待结算运费
//   VIP发货 ← /api/client/vip-batches 批次维度，标题格式与管理端 VIP 记录一致
const client = require('../../services/client');
const config = require('../../utils/config');
const auth = require('../../utils/auth');
const fmt = require('../../utils/format');

const BASE_TABS = [
  { key: 'pending', label: '待发货' },
  { key: 'packed', label: '已打包' },
  { key: 'shipped', label: '已发货' }
];
// VIP 单独发货（按单独地址）：仅 VIP 客户或管理员可见，加载后追加为第四个 tab
const VIP_TAB = { key: 'vip', label: '单独地址' };

const PLACEHOLDER = {
  pending: '输入快递单号关键字',
  packed: '输入包裹号或批次号，如 131批',
  shipped: '输入包裹号或批次号，如 130批'
};

Page({
  data: {
    tabs: BASE_TABS,
    tab: 'pending',
    keyword: '',
    placeholder: PLACEHOLDER.pending,
    list: [],
    page: 1,
    total: 0,
    groupCount: 0,
    hasMore: true,
    loading: false,
    bound: false,
    isVip: false,
    isAdmin: false,
    adminAll: false,
    currency: config.CURRENCY_SYMBOL
  },

  async onLoad() {
    try {
      const profile = await auth.getProfile();
      const bound = auth.isBound(profile);
      this.applyVipVisibility(profile);
      this.setData({ bound });
      if (!bound) return;
      this.loadData(true);
    } catch (err) {
      fmt.showError(err);
    }
  },

  // VIP tab 可见性：VIP 客户看本人批次；管理员且非 VIP 预览全部（与 vip 页口径一致）
  applyVipVisibility(profile) {
    const isVip = !!(profile && profile.customer && profile.customer.is_vip);
    const isAdmin = auth.isAdmin(profile);
    const adminAll = isAdmin && !isVip;
    const tabs = (isVip || adminAll) ? BASE_TABS.concat([VIP_TAB]) : BASE_TABS;
    this.setData({ isVip, isAdmin, adminAll, tabs });
  },

  async onShow() {
    // 绑定提交后本地缓存的是"待审核"旧状态；管理员审核通过后回到本页
    // 必须强制刷新一次 profile，否则一直卡在"绑定后查看本人货物"
    if (this.data.bound) return;
    try {
      const profile = await auth.getProfile(true);
      const bound = auth.isBound(profile);
      this.applyVipVisibility(profile);
      this.setData({ bound });
      if (bound) this.loadData(true);
    } catch (err) {
      // 静默失败：onLoad 已有错误提示，网络恢复后下拉刷新兜底
    }
  },

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadData(false);
    }
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.tab) return;
    this.setData({
      tab: key,
      keyword: '',
      placeholder: PLACEHOLDER[key] || '',
      page: 1,
      list: [],
      total: 0,
      groupCount: 0,
      hasMore: true
    });
    this.loadData(true);
  },

  async loadData(isRefresh) {
    if (this.data.loading) return;
    // VIP 发货 tab：批次维度，无分页无搜索，走独立接口
    if (this.data.tab === 'vip') return this.loadVipList();
    // 已发货 tab：批次维度卡片（类似管理端批次卡），按批次分组展示
    if (this.data.tab === 'shipped') return this.loadShippedGrouped(isRefresh);
    if (isRefresh) this.setData({ page: 1, hasMore: true, list: [] });
    this.setData({ loading: true });

    try {
      const res = await client.getShipments({
        tab: this.data.tab,
        keyword: String(this.data.keyword).trim(),
        page: this.data.page,
        size: config.PAGE_SIZE
      });
      const rows = ((res && res.list) || []).map((item) => this.decorate(item));
      const merged = isRefresh ? rows : this.data.list.concat(rows);
      const total = (res && res.total) || 0;
      this.setData({
        list: merged,
        total,
        hasMore: merged.length < total,
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  // VIP 单独发货批次：标题格式与管理端一致（客户名 + 短日期 + 箱数）
  async loadVipList() {
    this.setData({ loading: true });
    try {
      const res = await client.clientVipBatches(this.data.adminAll ? { all: 1 } : undefined);
      const list = ((res && res.list) || []).map((b) => {
        const day = String(b.vip_day || '');
        const dayShort = day.length >= 10 ? day.slice(2) : day;
        return Object.assign({}, b, {
          title: (b.customer_name || 'VIP') + ' ' + (dayShort || '——') + ' · ' + (b.package_total || 0) + '箱'
        });
      });
      // 批次列表一次拉全，无分页
      this.setData({ list, total: list.length, hasMore: false, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  // VIP 批次卡：进账单（与管理端同口径，已派发才可见运费）
  goVipBill(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageClient/batch-bill/batch-bill?batch_id=' + id });
  },

  // VIP 批次卡：进物流轨迹
  goVipTracks(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageClient/tracks/tracks?id=' + id });
  },

  // ---------- 已发货：批次分组卡片 ----------
  // 拉全本人已发货包裹（接口按包裹分页，这里循环取完），再按批次归组。
  // 客户维度数据量有限（几十件量级），一次拉全代价可接受；
  // 搜索关键词由服务端过滤，分组结果即「含命中包裹的批次」。
  async loadShippedGrouped(isRefresh) {
    if (isRefresh) this.setData({ list: [], total: 0, groupCount: 0, hasMore: false });
    this.setData({ loading: true });
    try {
      const size = 50;
      let page = 1;
      let rows = [];
      let total = 0;
      // 最多 20 页兜底，防止异常 total 死循环
      for (; page <= 20; page++) {
        const res = await client.getShipments({
          tab: 'shipped',
          keyword: String(this.data.keyword).trim(),
          page,
          size
        });
        total = (res && res.total) || 0;
        const part = ((res && res.list) || []).map((item) => this.decorate(item));
        rows = rows.concat(part);
        if (rows.length >= total || part.length === 0) break;
      }
      const groups = this.buildShippedGroups(rows);
      this.setData({ list: groups, total, groupCount: groups.length, hasMore: false, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      fmt.showError(err);
    }
  },

  // 按批次归组：组 = 批次卡（批次号 / 最近发货时间 / 包裹数 / 计费重与运费合计），
  // 组内 items 保留原包裹明细，展开后可见。无批次的散件归入「未分批」组。
  buildShippedGroups(rows) {
    const map = new Map();
    rows.forEach((p) => {
      const key = (p.batch_id === null || p.batch_id === undefined) ? 'none' : 'b' + p.batch_id;
      if (!map.has(key)) {
        map.set(key, {
          key,
          batch_id: p.batch_id,
          batch_no: p.batch_no || '',
          items: [],
          latest: 0
        });
      }
      const g = map.get(key);
      g.items.push(p);
      const t = Number(p.time_at || 0);
      if (t > g.latest) g.latest = t;
    });
    const out = [];
    map.forEach((g) => {
      let cwTotal = 0;
      let hasCw = false;
      let freightTotal = 0;
      let freightVisible = false;
      let paidCount = 0;
      g.items.forEach((p) => {
        if (p.chargeable_weight !== null && p.chargeable_weight !== undefined) {
          cwTotal += Number(p.chargeable_weight);
          hasCw = true;
        }
        if (p.freight_visible) {
          freightVisible = true;
          if (p.freight !== null && p.freight !== undefined) freightTotal += Number(p.freight);
        }
        if (p.freight_paid) paidCount++;
      });
      out.push(Object.assign(g, {
        title: g.batch_no || '未分批包裹',
        time_display: g.latest ? fmt.formatTime(g.latest) : '—',
        pkg_count: g.items.length,
        cw_display: hasCw ? cwTotal.toFixed(1) : '—',
        freight_display: freightVisible ? config.CURRENCY_SYMBOL + freightTotal.toFixed(2) : '—',
        freight_visible: freightVisible,
        paid_count: paidCount,
        expanded: false
      }));
    });
    // 有批次的在前，按最近发货时间倒序；「未分批」沉底
    out.sort((a, b) => {
      if ((a.batch_id === null) !== (b.batch_id === null)) return a.batch_id === null ? 1 : -1;
      return b.latest - a.latest;
    });
    return out;
  },

  // 批次卡：展开 / 收起该批次的包裹明细
  onGroupToggle(e) {
    const gi = Number(e.currentTarget.dataset.gindex);
    const patch = {};
    patch['list[' + gi + '].expanded'] = !this.data.list[gi].expanded;
    this.setData(patch);
  },

  // 批次卡内单包裹：展开 / 收起内含单号
  onPkgToggle(e) {
    const gi = Number(e.currentTarget.dataset.gindex);
    const pi = Number(e.currentTarget.dataset.pindex);
    const patch = {};
    patch['list[' + gi + '].items[' + pi + '].expanded'] =
      !this.data.list[gi].items[pi].expanded;
    this.setData(patch);
  },

  // 批次卡：进物流轨迹（单批次模式，与单独地址卡一致）
  goBatchTracks(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageClient/tracks/tracks?id=' + id });
  },

  // 批次卡：进批次账单（未派发时账单页会提示尚未派发）
  goBatchBill(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageClient/batch-bill/batch-bill?batch_id=' + id });
  },

  decorate(item) {
    const tab = this.data.tab;
    const out = Object.assign({}, item);
    if (tab === 'pending') {
      // 待发货：列表只展示单号与入库时间；补上状态字段供详情页复用
      out.entry_time_display = fmt.formatTime(item.entry_time);
      out.status = '已入库';
      out.status_class = 'tag-blue';
      out.nature_display = '待确认';
      out.nature_class = 'tag-gray';
      out.nature_visible = false;
      // 待打包 = 仓库正在打包，此前客户完全看不到，这里给个明确标签
      out.stage = item.stage || '待发货';
      out.is_packing = out.stage === '打包中';
      return out;
    }
    // 已打包 / 已发货：包裹维度
    out.package_label = item.package_label || ('包裹 #' + item.id);
    out.package_note = item.package_note || '';
    out.item_count_display = (item.item_count === null || item.item_count === undefined)
      ? '—' : item.item_count;
    // 已打包看打包时间，已发货看发货时间（服务端按 tab 取 time_at，不混用）
    out.time_label = tab === 'packed' ? '打包于' : '发货于';
    out.time_display = fmt.formatTime(item.time_at);
    out.nature_display = item.nature_display || '';
    out.nature_class = out.nature_display === '普货' ? 'tag-green'
      : out.nature_display === '敏货' ? 'tag-orange' : 'tag-gray';
    out.box_type = item.is_full_box ? '整箱' : '拼箱';
    if (tab === 'shipped') {
      // 计费重 = max(实重, 体积重, 1kg) 进位 0.5，服务端算好直接展示
      const cw = item.chargeable_weight;
      out.chargeable_display = (cw === null || cw === undefined) ? '—' : Number(cw).toFixed(1);
      const aw = item.actual_weight;
      const vw = item.volume_weight;
      out.actual_display = (aw === null || aw === undefined) ? '—' : Number(aw).toFixed(2);
      out.volume_display = (vw === null || vw === undefined) ? '—' : Number(vw).toFixed(2);
      // 体积重大于实重时说明按体积重计费，给客户一个提示，避免以为算错
      out.by_volume = (vw !== null && vw !== undefined && aw !== null && aw !== undefined
        && Number(vw) > Number(aw));
      // 运费 = 计费重 × 单价（普货 25 / 敏货 35），服务端算好直接展示
      const fr = item.freight;
      out.freight_display = (fr === null || fr === undefined) ? '—' : Number(fr).toFixed(2);
      // 运费可见性：仅当包裹所属批次已被管理端派发账单时才展示（未派发整行隐藏）
      out.freight_visible = !!item.freight_visible;
      // 「已付款」标记（手动）：paid 状态 + 标记人 + 日期
      out.freight_paid = !!item.freight_paid;
      out.freight_paid_by = item.freight_paid_by || '';
      out.freight_paid_at_short = (item.freight_paid_at || '').substring(0, 10);
    }

    // 品名：包裹级汇总（packed_packages.contents_description），操作端人工回填，可能为空
    out.goods_names = (item.goods_names || [])
      .map((g) => String(g || '').trim())
      .filter((g) => g);
    out.has_goods = out.goods_names.length > 0;
    out.goods_text = out.goods_names.join(' / ');

    // 尺寸：已打包 / 已发货都要能看出来；没量过就提示待录入，不要留空
    out.dimension_display = String(item.dimension_display || '').trim();
    out.has_dimension = !!out.dimension_display;

    // 内含快递单号：品名是包裹级的，不逐件，这里只列单号
    out.expanded = false;
    out.items_available = item.items_available !== false;
    out.items = (item.items || []).map((it) => ({
      id: it.id,
      tracking_number: String(it.tracking_number || '').trim() || '—'
    }));
    out.items_count = out.items.length;
    const declared = Number(item.item_count);
    let missing = isNaN(declared) ? 0 : Math.max(0, declared - out.items_count);
    if (item.items_truncated) missing = Math.max(missing, 1);
    out.items_missing = missing;
    out.fold_label = '内含 ' + out.items_count + ' 个单号'
      + (missing > 0 ? '，另有 ' + missing + ' 个待回写' : '');
    return out;
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.loadData(true);
  },

  onClearFilter() {
    this.setData({ keyword: '' });
    this.loadData(true);
  },

  // 展开 / 收起包裹内含明细：只更新单个字段，避免整表 setData（E-02）
  onToggleExpand(e) {
    const id = Number(e.currentTarget.dataset.id);
    const index = this.data.list.findIndex((row) => Number(row.id) === id);
    if (index < 0) return;
    const patch = {};
    patch['list[' + index + '].expanded'] = !this.data.list[index].expanded;
    this.setData(patch);
  },

  // 待发货可进详情（详情页字段与入库单一致）；已打包/已发货信息已在卡片呈现
  onPendingTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find((row) => row.id === id);
    if (!item) return;
    wx.setStorageSync('sjs_current_package', item);
    wx.navigateTo({ url: '/packageClient/package-detail/package-detail' });
  },

  goBind() {
    wx.navigateTo({ url: '/packageClient/bind/bind' });
  }
});
