/* ============================================================
   来钱花 · Supabase 数据访问层
   - profiles / transactions / customers / inventory 四张表的读写
   - 数据库行 → 前端视图模型的映射
   - 演示数据一键导入（方便空账号答辩演示）
   ============================================================ */
const Store = (function () {
  'use strict';

  /* ---------------- 通用工具 ---------------- */
  const DAY_MS = 86400000;
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const pad2 = n => String(n).padStart(2, '0');
  function hm(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function daysAgo(d) {
    const a = startOfToday(), b = new Date(d); b.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((a - b) / DAY_MS));
  }
  function dayLabel(d) {
    const n = daysAgo(d);
    const base = (d.getMonth() + 1) + '月' + d.getDate() + '日（周' + WEEK[d.getDay()] + '）';
    if (n === 0) return '今天 ' + base;
    if (n === 1) return '昨天 ' + base;
    return base;
  }
  function errMsg(e) { return (e && e.message) || '网络异常'; }

  /* ---------------- profiles ---------------- */
  async function getProfile() {
    const { data, error } = await window.sb.from('profiles').select('*').limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }
  async function saveProfile(patch) {
    const existing = await getProfile();
    if (existing) {
      const { data, error } = await window.sb.from('profiles').update(patch).eq('id', existing.id).select().single();
      if (error) throw error;
      return data;
    }
    const { data: authData } = await window.sb.auth.getUser();
    const { data, error } = await window.sb.from('profiles')
      .insert({ user_id: authData.user.id, shop_name: patch.shop_name || '我的小店' })
      .select().single();
    if (error) throw error;
    return data;
  }

  /* ---------------- transactions ---------------- */
  async function listTransactions() {
    const { data, error } = await window.sb.from('transactions')
      .select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    return data || [];
  }
  async function addTransaction(input) {
    const { data, error } = await window.sb.from('transactions').insert(input).select().single();
    if (error) throw error;
    return data;
  }

  /* 数据库行 → 流水视图模型（note 约定：「项目」或「项目｜客户名」） */
  function toTxView(r) {
    const d = new Date(r.created_at);
    const note = r.note || '';
    const bar = note.indexOf('｜');
    const title = bar >= 0 ? note.slice(0, bar) : note;
    const cust = bar >= 0 ? note.slice(bar + 1) : '';
    const isOut = r.type === '支出';
    const amount = Number(r.amount) || 0;
    return {
      id: r.id, _date: d,
      title: title || (isOut ? '支出' : '记账'),
      sub: hm(d) + ' · ' + (r.payment_method || '未填') + (cust ? ' · ' + cust : ''),
      cat: r.category || (isOut ? 'expense' : 'haircut'),
      amount: isOut ? -amount : amount,
      type: isOut ? 'out' : 'in'
    };
  }
  function groupTransactions(rows) {
    const groups = [];
    (rows || []).forEach(r => {
      const v = toTxView(r);
      const key = v._date.getFullYear() + '-' + v._date.getMonth() + '-' + v._date.getDate();
      let g = groups[groups.length - 1];
      if (!g || g._key !== key) {
        g = { _key: key, day: dayLabel(v._date), items: [] };
        groups.push(g);
      }
      g.items.push(v);
    });
    return groups;
  }
  function computeStats(rows) {
    const now = new Date();
    const t0 = startOfToday();
    const y0 = new Date(t0.getTime() - DAY_MS);
    const m0 = new Date(now.getFullYear(), now.getMonth(), 1);
    const s = { todayIncome: 0, todayCount: 0, yesterdayIncome: 0, monthIncome: 0, monthExpense: 0, monthCount: 0 };
    (rows || []).forEach(r => {
      const d = new Date(r.created_at);
      const amt = Number(r.amount) || 0;
      const isOut = r.type === '支出';
      if (d >= m0) { s.monthCount++; if (isOut) s.monthExpense += amt; else s.monthIncome += amt; }
      if (d >= t0) { if (!isOut) { s.todayIncome += amt; s.todayCount++; } }
      else if (d >= y0 && !isOut) { s.yesterdayIncome += amt; }
    });
    return s;
  }

  /* ---------------- customers ---------------- */
  async function listCustomers() {
    const { data, error } = await window.sb.from('customers')
      .select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }
  const TAG_TEXT = { vip: '熟客', risk: '流失预警', new: '新客' };
  /* 近 6 个月消费趋势：从流水 note 中匹配客户名 */
  function customerTrend(name, txRows) {
    const now = new Date();
    const buckets = [0, 0, 0, 0, 0, 0];
    (txRows || []).forEach(r => {
      if (r.type === '支出') return;
      if (!(r.note || '').includes(name)) return;
      const d = new Date(r.created_at);
      const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (diff >= 0 && diff < 6) buckets[5 - diff] += Number(r.amount) || 0;
    });
    return buckets.map(Math.round);
  }
  function toCustomerView(r, txRows) {
    const tags = Array.isArray(r.tags) ? r.tags : [];
    return {
      id: r.id,
      name: r.name,
      phone: r.phone || '',
      tags: tags,
      tagTxt: tags.map(t => TAG_TEXT[t] || t),
      last: r.last_visit ? daysAgo(new Date(r.last_visit)) : null,
      visits: r.visit_count || 0,
      total: Number(r.total_spent) || 0,
      trend: customerTrend(r.name, txRows),
      prefs: [],
      advice: tags.includes('risk')
        ? '该客户较久未到店，建议先微信问候并附一张小额关怀券，低成本测试意向，暂不建议大额折扣或电话打扰。'
        : ''
    };
  }

  /* ---------------- inventory ---------------- */
  async function listInventory() {
    const { data, error } = await window.sb.from('inventory')
      .select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }
  function toInventoryView(r) {
    const qty = Number(r.current_qty) || 0;
    const min = Number(r.min_qty) || 0;
    const unit = r.unit || '';
    const level = qty <= min ? 'danger' : (qty <= min * 1.6 ? 'warn' : 'ok');
    const pct = Math.max(4, Math.min(100, Math.round(qty / Math.max(min * 3, 1) * 100)));
    return {
      id: r.id,
      name: r.name,
      cat: r.category || 'wash',
      spec: qty + unit + ' · 安全库存 ' + min + unit,
      qty: qty, min: min, unit: unit,
      cost: Number(r.cost_per_unit) || 0,
      pct: pct, days: null, level: level
    };
  }

  /* ---------------- 演示数据导入（空账号也能演示客户/库存页） ----------------
     客户种子直接复用 data.js 中的 CUSTOMERS 演示数据（store.js 先于 app.js
     执行，此时全局 CUSTOMERS 尚未被真实数据替换，立即快照一份） */
  const DEMO_CUSTOMERS = (typeof CUSTOMERS !== 'undefined')
    ? CUSTOMERS.map(c => ({ name: c.name, total: c.total, visits: c.visits, last: c.last, tags: c.tags.slice() }))
    : [];
  const SEED_INVENTORY = [
    { name: '染发膏（自然黑）', category: 'dye', current_qty: 2, unit: '支', min_qty: 3, cost_per_unit: 32 },
    { name: '电推剪刀头', category: 'tool', current_qty: 1, unit: '个', min_qty: 2, cost_per_unit: 45 },
    { name: '烫发药水', category: 'dye', current_qty: 1, unit: '套', min_qty: 2, cost_per_unit: 68 },
    { name: '一次性毛巾', category: 'wash', current_qty: 1, unit: '包', min_qty: 2, cost_per_unit: 28 },
    { name: '剃须膏', category: 'wash', current_qty: 3, unit: '瓶', min_qty: 2, cost_per_unit: 39 },
    { name: '卡诗护发素', category: 'wash', current_qty: 6, unit: '瓶', min_qty: 2, cost_per_unit: 128 },
    { name: '护发精油', category: 'care', current_qty: 5, unit: '瓶', min_qty: 2, cost_per_unit: 88 },
    { name: '染发膏（栗棕）', category: 'dye', current_qty: 5, unit: '支', min_qty: 3, cost_per_unit: 32 },
    { name: '专业洗发水', category: 'wash', current_qty: 8, unit: '瓶', min_qty: 3, cost_per_unit: 58 },
    { name: '围布 / 披肩', category: 'tool', current_qty: 12, unit: '条', min_qty: 4, cost_per_unit: 15 }
  ];
  async function seedCustomers() {
    const rows = DEMO_CUSTOMERS.map(c => ({
      name: c.name,
      total_spent: c.total,
      visit_count: c.visits,
      last_visit: new Date(Date.now() - (c.last || 0) * DAY_MS).toISOString(),
      tags: c.tags
    }));
    if (!rows.length) throw new Error('演示数据未加载');
    const { error } = await window.sb.from('customers').insert(rows);
    if (error) throw error;
  }
  async function seedInventory() {
    const { error } = await window.sb.from('inventory').insert(SEED_INVENTORY);
    if (error) throw error;
  }

  return {
    errMsg,
    getProfile, saveProfile,
    listTransactions, addTransaction, groupTransactions, computeStats, toTxView,
    listCustomers, toCustomerView, seedCustomers,
    listInventory, toInventoryView, seedInventory
  };
})();
