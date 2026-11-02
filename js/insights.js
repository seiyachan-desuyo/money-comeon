/* ============================================================
   来钱花 · 经营洞察计算（纯函数，全部基于 Supabase 真实数据）
   输入：transactions 原始行、客户视图、库存视图、待办
   输出：首页话术、经营参谋（健康分/KPI/营收同比/三大报表/建议）
   数据为空时一律返回 0 / 空数组，由渲染层显示空状态
   ============================================================ */
const Insights = (function () {
  'use strict';

  const DAY = 86400000;
  const isIn = r => r.type !== '支出';
  const amt = r => Number(r.amount) || 0;
  const sum = (rows, f) => rows.reduce((s, r) => s + (f ? f(r) : amt(r)), 0);
  const round2 = v => Math.round(v * 100) / 100;

  /* 收入分类 → 利润表科目 */
  const INCOME_GROUP = {
    haircut: '剪发收入', child: '剪发收入', wash: '剪发收入',
    dye: '染烫收入', perm: '染烫收入', care: '护理收入'
  };

  function inRange(rows, from, to) {
    return rows.filter(r => { const d = new Date(r.created_at); return d >= from && d < to; });
  }
  function monthStart(y, m) { return new Date(y, m, 1); }

  /* ---------- 期间定义 ---------- */
  function periodRange(period, now) {
    const y = now.getFullYear(), m = now.getMonth();
    const end = new Date(y, m + 1, 1);
    if (period === 'quarter') return { from: monthStart(y, m - 2), to: end, label: `近 3 月（${new Date(y, m - 2, 1).getMonth() + 1}–${m + 1}月）` };
    if (period === 'year') return { from: monthStart(y, m - 11), to: end, label: '近一年' };
    return { from: monthStart(y, m), to: end, label: `本月（${m + 1}月）` };
  }

  /* ---------- 利润表 ---------- */
  function buildPL(rows, period, now) {
    const { from, to, label } = periodRange(period, now);
    const list = inRange(rows, from, to);
    const incMap = new Map(), costMap = new Map();
    list.forEach(r => {
      if (isIn(r)) {
        const k = INCOME_GROUP[r.category] || '其他收入';
        incMap.set(k, (incMap.get(k) || 0) + amt(r));
      } else {
        const note = (r.note || '').split('｜')[0];
        const k = /房租|租金/.test(note) ? '房租' : /工资|人工|提成/.test(note) ? '人工' : '耗材及其他支出';
        costMap.set(k, (costMap.get(k) || 0) + amt(r));
      }
    });
    const toArr = m => [...m.entries()].map(([name, amount]) => ({ name, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount);
    return { label, income: toArr(incMap), cost: toArr(costMap) };
  }

  /* ---------- 家底清单（资产负债简表） ---------- */
  function buildBS(rows, inventory, now) {
    const cash = round2(sum(rows.filter(isIn)) - sum(rows.filter(r => !isIn(r))));
    const stock = round2(inventory.reduce((s, v) => s + (v.qty || 0) * (v.cost || 0), 0));
    const assets = [];
    if (cash !== 0) assets.push({ name: '现金及收款账户', amount: cash, note: '累计收入 − 累计支出' });
    if (stock > 0) assets.push({ name: '耗材库存', amount: stock, note: `${inventory.length} 种耗材 × 采购成本` });
    return {
      snapshotDate: `${now.getMonth() + 1}月${now.getDate()}日实时快照`,
      assets,
      liabilities: [] // 储值卡 / 应付款功能尚未上线，暂无负债数据
    };
  }

  /* ---------- 现金流（本月） ---------- */
  function buildCF(rows, now) {
    const { from, to, label } = periodRange('month', now);
    const list = inRange(rows, from, to);
    const inMap = new Map(), outMap = new Map();
    list.forEach(r => {
      const key = isIn(r) ? (r.payment_method || '其他') + '收款' : ((r.note || '').split('｜')[0] || '其他支出');
      const m = isIn(r) ? inMap : outMap;
      m.set(key, (m.get(key) || 0) + amt(r));
    });
    const toArr = m => [...m.entries()].map(([name, amount]) => ({ name, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount).slice(0, 6);
    return { label, inflow: toArr(inMap), outflow: toArr(outMap) };
  }

  /* ---------- 营收同比（今年 vs 去年同期） ---------- */
  function buildRevenue(rows, now) {
    const income = rows.filter(isIn);
    const bucket = (from, to) => Math.round(sum(inRange(income, from, to)));
    const shiftYear = d => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
    const y = now.getFullYear(), m = now.getMonth();

    // 本月：按周（1–7、8–14、15–21、22–28、29–月底）
    const month = { labels: [], thisYear: [], lastYear: [] };
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let s = 1, i = 1; s <= daysInMonth; s += 7, i++) {
      const from = new Date(y, m, s), to = new Date(y, m, Math.min(s + 7, daysInMonth + 1));
      month.labels.push(`第${i}周`);
      month.thisYear.push(bucket(from, to));
      month.lastYear.push(bucket(shiftYear(from), shiftYear(to)));
    }
    // 近 3 月：半月
    const quarter = { labels: [], thisYear: [], lastYear: [] };
    for (let k = 2; k >= 0; k--) {
      const mm = new Date(y, m - k, 1);
      [[1, 16, '上'], [16, 32, '下']].forEach(([a, b, t]) => {
        const from = new Date(mm.getFullYear(), mm.getMonth(), a);
        const to = b === 32 ? new Date(mm.getFullYear(), mm.getMonth() + 1, 1) : new Date(mm.getFullYear(), mm.getMonth(), b);
        quarter.labels.push(`${mm.getMonth() + 1}月${t}`);
        quarter.thisYear.push(bucket(from, to));
        quarter.lastYear.push(bucket(shiftYear(from), shiftYear(to)));
      });
    }
    // 近一年：按月
    const year = { labels: [], thisYear: [], lastYear: [] };
    for (let k = 11; k >= 0; k--) {
      const from = new Date(y, m - k, 1), to = new Date(y, m - k + 1, 1);
      year.labels.push(`${from.getMonth() + 1}月`);
      year.thisYear.push(bucket(from, to));
      year.lastYear.push(bucket(shiftYear(from), shiftYear(to)));
    }
    return { month, quarter, year };
  }

  /* ---------- KPI（本月 vs 上月） ---------- */
  function cmpText(cur, prev, unit) {
    if (!prev) return { text: cur ? '上月无数据' : '—', cls: 'flat' };
    const diff = unit === 'pt' ? Math.round((cur - prev) * 10) / 10 : Math.round((cur - prev) / prev * 1000) / 10;
    return { text: `环比 ${diff >= 0 ? '+' : ''}${diff}${unit === 'pt' ? 'pt' : '%'}`, cls: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
  }
  function buildKPI(rows, customers, now) {
    const y = now.getFullYear(), m = now.getMonth();
    const cur = inRange(rows, monthStart(y, m), monthStart(y, m + 1)).filter(isIn);
    const prev = inRange(rows, monthStart(y, m - 1), monthStart(y, m)).filter(isIn);
    const rev = sum(cur), prevRev = sum(prev);
    const avg = cur.length ? rev / cur.length : 0;
    const prevAvg = prev.length ? prevRev / prev.length : 0;
    const repeat = customers.length
      ? Math.round(customers.filter(c => c.visits >= 2).length / customers.length * 100) : 0;
    return {
      rev: Math.round(rev), revCmp: cmpText(rev, prevRev),
      avg: Math.round(avg * 10) / 10, avgCmp: cmpText(avg, prevAvg),
      flow: cur.length, flowCmp: cmpText(cur.length, prev.length),
      repeat, repeatCmp: { text: customers.length ? `共 ${customers.length} 位客户` : '暂无客户', cls: 'flat' }
    };
  }

  /* ---------- 健康分（有数据才评分） ---------- */
  function buildHealth(rows, customers, inventory, kpi) {
    const hasAny = rows.length || customers.length || inventory.length;
    if (!hasAny) return { score: 0, level: '暂无数据', notes: [{ t: '还没有经营数据，记几笔账后自动评分', risk: false }] };
    let score = 60;
    const notes = [];
    const monthIn = kpi.rev;
    const monthOutRows = rows.filter(r => !isIn(r) && new Date(r.created_at) >= monthStart(new Date().getFullYear(), new Date().getMonth()));
    const monthOut = sum(monthOutRows);
    if (monthIn > 0) {
      const margin = (monthIn - monthOut) / monthIn;
      score += Math.max(-15, Math.min(20, Math.round(margin * 25)));
      notes.push({ t: `本月利润率 ${Math.round(margin * 100)}%`, risk: margin < 0.2 });
    } else {
      score -= 10;
      notes.push({ t: '本月尚无收入记录', risk: true });
    }
    if (kpi.revCmp.cls === 'up') { score += 8; notes.push({ t: '营收环比上升', risk: false }); }
    else if (kpi.revCmp.cls === 'down') { score -= 5; notes.push({ t: '营收环比下降，关注客流', risk: true }); }
    const low = inventory.filter(v => v.level === 'danger').length;
    if (low) { score -= Math.min(10, low * 3); notes.push({ t: `${low} 种耗材低于安全库存`, risk: true }); }
    const risk = customers.filter(c => c.tags.includes('risk')).length;
    if (risk) { score -= Math.min(10, risk * 2); notes.push({ t: `${risk} 位客户有流失风险`, risk: true }); }
    if (kpi.repeat >= 50) { score += 7; notes.push({ t: `复购率 ${kpi.repeat}%，熟客基础好`, risk: false }); }
    score = Math.max(0, Math.min(100, score));
    const level = score >= 85 ? '优秀' : score >= 70 ? '良好' : score >= 55 ? '一般' : '需关注';
    return { score, level, notes: notes.slice(0, 3) };
  }

  /* ---------- 经营建议（规则化、保守） ---------- */
  function buildAdvice(rows, customers, inventory, kpi) {
    const list = [];
    const low = inventory.filter(v => v.level === 'danger');
    if (low.length) list.push({
      tag: '库存', title: `补货 ${low.length} 种紧缺耗材`,
      desc: `${low.slice(0, 3).map(v => v.name).join('、')}${low.length > 3 ? ' 等' : ''}已低于安全库存，建议按安全库存 2 倍小批量补货，避免占用现金。`
    });
    const risk = customers.filter(c => c.tags.includes('risk'));
    if (risk.length) list.push({
      tag: '客户', title: `唤回 ${risk.length} 位流失风险客户`,
      desc: '先发微信问候 + 小额关怀券测试意向，暂不建议大额折扣。'
    });
    if (kpi.revCmp.cls === 'down') list.push({
      tag: '营收', title: '营收环比下滑，先稳客流',
      desc: '优先维护熟客到店频次，不建议此时上调价格或大额投放。'
    });
    if (rows.length && !list.length) list.push({
      tag: '稳健', title: '经营平稳，保持节奏',
      desc: '当前各项指标无明显风险，继续坚持每笔记账，月底复盘利润表即可。'
    });
    return list;
  }

  /* ---------- 首页 AI 话术 ---------- */
  function buildHero(stats, todosPending, hasAnyData) {
    if (!hasAnyData) {
      return { title: '欢迎来到来钱花 👋', desc: '点下方金色麦克风记第一笔账，经营数据会自动汇总在这里' };
    }
    const todoTxt = todosPending ? `，有 ${todosPending} 件待办待你处理` : '，暂无待办';
    if (stats.todayCount === 0) {
      return { title: '今天还没开张', desc: `本月已收入 ¥${Math.round(stats.monthIncome).toLocaleString()}${todoTxt}` };
    }
    if (stats.yesterdayIncome > 0) {
      const pct = Math.round((stats.todayIncome - stats.yesterdayIncome) / stats.yesterdayIncome * 1000) / 10;
      return {
        title: pct >= 0 ? '今日经营态势向好' : '今日收入略低于昨日',
        desc: `今日收入较昨日 ${pct >= 0 ? '+' : ''}${pct}%${todoTxt}`
      };
    }
    return { title: '今日已开张', desc: `今日 ${stats.todayCount} 笔，收入 ¥${Math.round(stats.todayIncome).toLocaleString()}${todoTxt}` };
  }

  function build(rows, customers, inventory, now) {
    now = now || new Date();
    rows = rows || []; customers = customers || []; inventory = inventory || [];
    const kpi = buildKPI(rows, customers, now);
    return {
      revenue: buildRevenue(rows, now),
      pl: { month: buildPL(rows, 'month', now), quarter: buildPL(rows, 'quarter', now), year: buildPL(rows, 'year', now) },
      bs: buildBS(rows, inventory, now),
      cf: buildCF(rows, now),
      kpi,
      health: buildHealth(rows, customers, inventory, kpi),
      advice: buildAdvice(rows, customers, inventory, kpi)
    };
  }

  return { build, buildHero };
})();
