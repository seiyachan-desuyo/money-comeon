/* ============================================================
   来钱花 · 交互逻辑（Supabase 全栈版）
   - 未登录跳转 auth.html；登录后从 Supabase 读取真实数据
   - 记账确认后真实写入 transactions；网络失败时降级为本地演示
   ============================================================ */
(function(){
'use strict';
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------------- 运行时状态 ---------------- */
let currentUser = null;
let profile = null;
let shopName = '我的小店';
let txRows = [];
let realTx = false, realCust = false, realInv = false;
let stats = null;
let kpiMonth = 38642;
let monthCount = 0;

/* ---------------- 数字滚动累加（进场/更新） ---------------- */
function animateNum(el, to, decimals, duration){
  if (!el) return;
  decimals = decimals == null ? 2 : decimals;
  duration = duration || 750;
  const from = parseFloat(el.dataset.val);
  const start = isNaN(from) ? 0 : from;
  el.dataset.val = to;
  const fmt = v => v.toLocaleString('zh-CN',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
  const t0 = performance.now();
  (function tick(t){
    const p = Math.min(1,(t-t0)/duration);
    const e = 1 - Math.pow(1-p,3); // easeOutCubic
    el.textContent = fmt(start + (to-start)*e);
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}
/* 按下扩散光环（语音钮 / 中间凸起 Tab） */
function bindTapRipple(el){
  el.addEventListener('pointerdown', ()=>{
    el.classList.remove('tap'); void el.offsetWidth;
    el.classList.add('tap');
    setTimeout(()=>el.classList.remove('tap'), 600);
  });
}

/* ---------------- Tab ---------------- */
const TABS = ['home','ledger','customers','inventory','insights'];
let insightInited = false;
function go(tab){
  if (!TABS.includes(tab)) return;
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  $$('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + tab));
  // 切到分析页时确保图表按容器宽度重绘；首次进入时 KPI 数字滚动
  if (tab === 'insights'){
    renderRevChart();
    if (!insightInited){
      insightInited = true;
      animateNum($('#kpiRev'), Math.round(kpiMonth), 0, 850);
    }
  }
  $('#screen').scrollTop = 0;
  const page = $('#page-' + tab);
  if (page) { page.scrollTop = 0; }
}
$$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.tab)));
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) { closeSheet(); go(g.dataset.go); }
});

/* ---------------- Toast & Sheet ---------------- */
let toastTimer;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}
function openSheet(html){
  $('#sheet').innerHTML = '<div class="sheet-grab"></div>' + html;
  $('#mask').classList.add('on');
  $('#sheet').classList.add('on');
  const grab = $('#sheet .sheet-grab');
  if (grab) grab.addEventListener('click', closeSheet);
}
function closeSheet(){
  $('#mask').classList.remove('on');
  $('#sheet').classList.remove('on');
}
function openOverlay(html){
  $('#overlay').innerHTML = html;
  $('#overlay').classList.add('on');
}
function closeOverlay(){ $('#overlay').classList.remove('on'); }
$('#mask').addEventListener('click', closeSheet);

/* ---------------- 流水渲染 ---------------- */
function flowRow(tx){
  const ic = CATE_ICON[tx.cat] || ['收','#F0B429'];
  return `<div class="flow-row">
    <span class="flow-ic ${tx.type==='in'?'fi-in':'fi-out'}" style="color:${ic[1]}">${ic[0]}</span>
    <div class="flow-body">
      <div class="flow-title">${esc(tx.title)}</div>
      <div class="flow-sub">${esc(tx.sub)}</div>
    </div>
    <span class="flow-amt ${tx.type==='in'?'in':'out'}">${tx.amount>0?'+':''}${tx.amount.toFixed(0)}</span>
  </div>`;
}
const EMPTY_FLOW = '<div class="list-empty">今天还没有流水，点下方麦克风记第一笔吧</div>';
function renderFlow(){
  $('#ledgerList').innerHTML = TX_GROUPS.length
    ? TX_GROUPS.map(g => `<div class="flow-day">${g.day}</div>${g.items.map(flowRow).join('')}`).join('')
    : EMPTY_FLOW;
  // 首页只展示今天前 4 条
  $('#homeFlow').innerHTML = TX_GROUPS.length && TX_GROUPS[0].items.length
    ? TX_GROUPS[0].items.slice(0,4).map(flowRow).join('')
    : EMPTY_FLOW;
}
renderFlow();

/* ---------------- 语音记账流程 ---------------- */
const VOICE_SAMPLES = {
  '洗剪吹一位，38，微信收的':
    { title:'洗剪吹', cat:'haircut', amount:38, pay:'微信', customer:'散客（新客）', qty:1 },
  '王姐烫染套餐268，刷的会员卡':
    { title:'烫染套餐', cat:'perm', amount:268, pay:'会员卡', customer:'王秀兰', qty:1 },
};
const SHOT_SAMPLE =
  { title:'烫染套餐（美团团购核销）', cat:'perm', amount:268, pay:'美团', customer:'[ph_EMPLOYEE_NAME_3_ph]', qty:1 };

function nowHM(){
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function startVoice(said){
  said = said || '洗剪吹一位，38，微信收的';
  openOverlay(`
    <div class="ov-rec"><i class="ov-dot"></i>正在聆听</div>
    <div class="ov-time" id="ovTime">0:00</div>
    <div class="ov-wave">${Array.from({length:18},(_,i)=>`<i style="animation-delay:${(i%9)*0.09}s"></i>`).join('')}</div>
    <div class="ov-bubble" id="ovBubble">${esc(said)}</div>
    <button class="ov-stop" id="ovStop"><i></i></button>
    <div class="ov-hint" id="ovHint">点击停止并识别</div>
  `);
  let sec = 0;
  const timer = setInterval(()=>{
    sec++;
    const t = $('#ovTime');
    if (t) t.textContent = '0:' + String(sec).padStart(2,'0');
  }, 1000);
  setTimeout(()=>{ const b=$('#ovBubble'); if(b) b.classList.add('show'); }, 500);

  const finish = () => {
    clearTimeout(vTimer);
    clearInterval(timer);
    parsingState('正在解析语音内容');
    setTimeout(()=>{ closeOverlay(); showConfirm(VOICE_SAMPLES[said] || VOICE_SAMPLES['洗剪吹一位，38，微信收的'], '语音'); }, 1400);
  };
  const vTimer = setTimeout(finish, 3600);
  $('#ovStop') && $('#ovStop').addEventListener('click', finish);
}

function parsingState(text){
  $('#overlay').innerHTML = `
    <div class="ov-loading">
      <div class="spinner"></div>
      <span>${esc(text)}…</span>
    </div>`;
}

/* ---------------- 截图记账流程 ---------------- */
$('#shotBtn').addEventListener('click', ()=> $('#shotFile').click());
$('#shotFile').addEventListener('change', e=>{
  const f = e.target.files[0];
  if (!f) return;
  openOverlay(`<div class="ov-loading"><div class="spinner"></div>
    <span>正在识别截图：${f.name.length>16?f.name.slice(0,16)+'…':f.name}</span></div>`);
  setTimeout(()=>{
    closeOverlay();
    showConfirm(SHOT_SAMPLE, '截图');
  }, 1800);
  e.target.value = '';
});

/* ---------------- 手动记账 ---------------- */
$('#manualBtn').addEventListener('click', ()=>{
  openSheet(`
    <div class="sheet-title">手动记一笔</div>
    <div class="sheet-sub">选择类型并填写金额</div>
    <div class="confirm-card">
      <div class="cf-row"><label>类型</label>
        <div class="pay-tags" id="mType">
          <span class="pay-tag on" data-v="in">收入</span>
          <span class="pay-tag" data-v="out">支出</span>
        </div></div>
      <div class="cf-row"><label>项目</label><input id="mTitle" value="洗剪吹" /></div>
      <div class="cf-row cf-amount"><label>金额（元）</label><input id="mAmount" type="number" value="38" inputmode="decimal"/></div>
      <div class="cf-row"><label>支付方式</label>
        <div class="pay-tags" id="mPay">
          <span class="pay-tag on" data-v="微信">微信</span>
          <span class="pay-tag" data-v="支付宝">支付宝</span>
          <span class="pay-tag" data-v="现金">现金</span>
          <span class="pay-tag" data-v="会员卡">会员卡</span>
        </div></div>
    </div>
    <div class="sheet-actions">
      <button class="sa-btn sa-ghost" data-close>取消</button>
      <button class="sa-btn sa-primary" id="mOk">确认记账</button>
    </div>`);
  bindPayTags('#mType'); bindPayTags('#mPay');
  $('#mOk').addEventListener('click', ()=>{
    const type = $('#mType .pay-tag.on').dataset.v;
    let amt = parseFloat($('#mAmount').value) || 0;
    if (type === 'out') amt = -amt;
    const d = { title:$('#mTitle').value || '其他', cat:type==='in'?'haircut':'expense',
      amount:amt, pay:$('#mPay .pay-tag.on').dataset.v, customer:'手动录入', qty:1 };
    closeSheet();
    commitTx(d);
  });
});

/* ---------------- AI 解析确认单 ---------------- */
function bindPayTags(sel){
  const box = $(sel);
  if (!box) return;
  box.addEventListener('click', e=>{
    const tag = e.target.closest('.pay-tag');
    if (!tag) return;
    box.querySelectorAll('.pay-tag').forEach(t=>t.classList.remove('on'));
    tag.classList.add('on');
  });
}
function showConfirm(d, from){
  openSheet(`
    <div class="ai-head">
      <span class="ai-ava">AI</span>
      <div>
        <div class="ai-title">${from}识别结果，请确认</div>
        <div class="ai-state">● 识别置信度 96%，字段均可修改</div>
      </div>
    </div>
    <div class="confirm-card">
      <div class="cf-row"><label>项目</label><input id="cfTitle" value="${esc(d.title)}" /></div>
      <div class="cf-row cf-amount"><label>金额（元）</label><input id="cfAmount" type="number" value="${d.amount}" inputmode="decimal"/></div>
      <div class="cf-row"><label>支付方式</label>
        <div class="pay-tags" id="cfPay">
          ${['微信','支付宝','现金','会员卡','美团'].map(p=>
            `<span class="pay-tag ${p===d.pay?'on':''}" data-v="${p}">${p}</span>`).join('')}
        </div></div>
      <div class="cf-row"><label>客户</label><input id="cfCust" value="${esc(d.customer)}" /></div>
      <div class="cf-row"><label>时间</label><input value="今天 ${nowHM()}" /></div>
    </div>
    <div class="sheet-actions">
      <button class="sa-btn sa-ghost" data-close>识别不对，重说</button>
      <button class="sa-btn sa-primary" id="cfOk">确认记账</button>
    </div>`);
  bindPayTags('#cfPay');
  $('#sheet').addEventListener('click', e=>{ if (e.target.closest('[data-close]')) closeSheet(); });
  $('#cfOk').addEventListener('click', ()=>{
    d.title = $('#cfTitle').value;
    d.amount = parseFloat($('#cfAmount').value) || d.amount;
    d.pay = $('#cfPay .pay-tag.on').dataset.v;
    d.customer = $('#cfCust').value;
    closeSheet();
    commitTx(d);
  });
}

/* ---------------- 确认入账 ---------------- */
const GENERIC_CUST = ['', '散客', '散客（新客）', '手动录入'];
function buildNote(title, customer){
  const c = (customer || '').trim();
  return GENERIC_CUST.includes(c) ? title : title + '｜' + c;
}
/* 本地演示模式入账（离线 / 接口失败时） */
function commitLocal(d){
  const tx = { title:d.title, sub:`${nowHM()} · ${d.pay} · ${d.customer}`,
    cat:d.cat, amount:d.amount, type:d.amount>=0?'in':'out' };
  TX_GROUPS[0].items.unshift(tx);
  renderFlow();
  if (tx.type === 'in'){
    const todayEl = $('#homeTodayAmount');
    const cur = (parseFloat(todayEl.dataset.val) || 0) + d.amount;
    animateNum(todayEl, cur, 2, 600);
    const cnt = $('#homeTodayCount'); cnt.textContent = (parseInt(cnt.textContent)+1);
    const mEl = $('#homeMonthAmount');
    const mv = (parseFloat(mEl.dataset.val) || 0) + d.amount;
    animateNum(mEl, mv, 2, 600);
    monthCount++;
    $('#ledgerMonth').textContent = `本月 ${monthCount} 笔`;
    toast(`记账成功 +¥${d.amount.toFixed(0)}（本地演示）`);
  } else {
    toast(`已记支出 ¥${Math.abs(d.amount).toFixed(0)}（本地演示）`);
  }
}
/* 真实模式：写入 Supabase transactions，随后重新拉取并刷新首页 */
async function commitTx(d){
  if (!realTx) return commitLocal(d);
  const isIn = d.amount >= 0;
  toast('正在入账…');
  try {
    await Store.addTransaction({
      amount: Math.abs(d.amount),
      type: isIn ? '收入' : '支出',
      category: d.cat || (isIn ? 'haircut' : 'expense'),
      note: buildNote(d.title, d.customer),
      payment_method: d.pay || null
    });
    txRows = await Store.listTransactions();
    replaceGroups(Store.groupTransactions(txRows));
    applyStats(Store.computeStats(txRows));
    renderFlow();
    if (realCust) await refreshCustomers();
    refreshDerived();
    toast(isIn ? `记账成功 +¥${Math.abs(d.amount).toFixed(0)}，已同步云端`
               : `已记支出 ¥${Math.abs(d.amount).toFixed(0)}，已同步云端`);
  } catch (e) {
    toast('入账失败：' + Store.errMsg(e));
  }
}

$('#micBtn').addEventListener('click', ()=> startVoice());
bindTapRipple($('#micBtn'));
const tabFab = $('#tabFab');
if (tabFab) bindTapRipple(tabFab);
$$('.vchip').forEach(c => c.addEventListener('click', () => startVoice(c.dataset.say)));

/* ---------------- 客户页 ---------------- */
let custSeg = 'all';
function custTags(c){
  return c.tagTxt.map((t,i)=>
    `<span class="tag ${c.tags[i]==='risk'?'tag-risk':(c.tags[i]==='new'?'tag-new':'tag-vip')}">${esc(t)}</span>`).join('');
}
function lastText(c){
  if (c.last === null || c.last === undefined) return '新客户';
  return c.last === 0 ? '今天到店' : c.last + ' 天未到店';
}
function renderCustomers(){
  const kw = ($('#custSearch').value || '').trim();
  const list = CUSTOMERS.filter(c=>{
    if (kw && !c.name.includes(kw) && !(c.phone||'').includes(kw)) return false;
    if (custSeg === 'vip') return c.tags.includes('vip');
    if (custSeg === 'risk') return c.tags.includes('risk');
    if (custSeg === 'new') return c.tags.includes('new');
    return true;
  });
  $('#custList').innerHTML = list.length ? list.map(c=>`
    <div class="cust-card ${c.tags.includes('risk')?'risk':''}" data-cust="${CUSTOMERS.indexOf(c)}">
      <span class="cust-ava">${esc(c.name[0]||'客')}</span>
      <div class="cust-main">
        <div class="cust-name">${esc(c.name)} ${custTags(c)}</div>
        <div class="cust-meta">到店 ${c.visits} 次 · 累计 ¥${c.total.toLocaleString()}</div>
      </div>
      <span class="cust-spark"></span>
      <div class="cust-right">
        <div class="cust-days ${(c.last||0)>=30?'risk':''}">${lastText(c)}</div>
      </div>
    </div>`).join('')
    : (realCust
        ? '<div class="cart-empty"><span class="empty-illus"></span>还没有客户资料<button class="seed-btn" data-seed="customers">载入演示客户</button></div>'
        : '<div class="cart-empty"><span class="empty-illus"></span>没有找到匹配的客户</div>');
  list.forEach((c,i)=>{
    const node = document.querySelectorAll('#custList .cust-spark')[i];
    Charts.sparkline(node, c.trend, c.tags.includes('risk') ? '#F08A75' : '#F0B429');
  });
  $$('#custList .cust-card').forEach(card=>{
    card.addEventListener('click', ()=> customerDetail(CUSTOMERS[parseInt(card.dataset.cust)]));
  });
}
function applyCustomerSummary(){
  const total = CUSTOMERS.length;
  const vip = CUSTOMERS.filter(c=>c.tags.includes('vip')).length;
  const risk = CUSTOMERS.filter(c=>c.tags.includes('risk')).length;
  const spent = CUSTOMERS.reduce((s,c)=>s+(+c.total||0),0);
  $('#csCountAll').textContent = total;
  $('#csCountVip').textContent = vip;
  $('#csCountRisk').textContent = risk;
  $('#csSumSpent').textContent = spent >= 10000 ? (spent/10000).toFixed(1)+'万' : Math.round(spent).toLocaleString();
}
async function refreshCustomers(){
  try {
    const rows = await Store.listCustomers();
    const views = rows.map(r => Store.toCustomerView(r, txRows));
    CUSTOMERS.splice(0, CUSTOMERS.length, ...views);
    applyCustomerSummary();
    renderCustomers();
    refreshDerived();
  } catch(e) { /* 静默：保留当前列表 */ }
}
function customerDetail(c){
  const risk = c.tags.includes('risk');
  openSheet(`
    <div class="cd-head">
      <span class="cd-ava" style="${risk?'background:#FDEDEA;color:#F04B3E':''}">${esc(c.name[0]||'客')}</span>
      <div>
        <div class="cd-name">${esc(c.name)} ${custTags(c)}</div>
        <div class="cd-meta">${lastText(c)}${c.phone?' · '+esc(c.phone):''} · 会员卡号 880${1000+c.visits}</div>
      </div>
    </div>
    <div class="cd-stats">
      <div><b>${c.visits}</b><span>到店次数</span></div>
      <div><b>¥${c.total.toLocaleString()}</b><span>累计消费</span></div>
      <div><b>¥${c.visits?Math.round(c.total/c.visits):0}</b><span>平均客单</span></div>
    </div>
    <div class="cd-chart">
      <div class="ct">近 6 个月消费（元）</div>
      <div id="cdChart"></div>
    </div>
    ${c.prefs && c.prefs.length ? `<div class="pref-tags">${c.prefs.map(p=>`<span>${esc(p)}</span>`).join('')}</div>` : ''}
    ${c.advice ? `<div class="ai-advice">
      <div class="aa-h">💡 AI 唤回建议（保守策略）</div>
      <p>${esc(c.advice)}</p>
    </div>` : `<div class="ai-advice">
      <div class="aa-h">💡 客户状态</div>
      <p>消费稳定，到店节奏正常，维持现有服务即可，暂不建议额外打扰。</p>
    </div>`}
    <div class="sheet-actions">
      <button class="sa-btn sa-ghost" id="cdWx">发微信问候</button>
      <button class="sa-btn sa-primary" id="cdCoupon">${risk?'送 5 元关怀券':'发送服务提醒'}</button>
    </div>`);
  const labels = ['5月','6月','7月','8月','9月','10月'];
  Charts.barTrend($('#cdChart'), c.trend, labels);
  $('#cdWx').addEventListener('click', ()=> toast('已打开微信会话（演示）'));
  $('#cdCoupon').addEventListener('click', ()=> toast(risk?'关怀券已发放，预计 3 日内触达':'服务提醒已预约下周发送'));
}
$('#custSeg').addEventListener('click', e=>{
  const seg = e.target.closest('.seg'); if (!seg) return;
  $$('#custSeg .seg').forEach(s=>s.classList.toggle('on', s===seg));
  custSeg = seg.dataset.seg;
  renderCustomers();
});
$('#custSearch').addEventListener('input', renderCustomers);
applyCustomerSummary();
renderCustomers();

/* ---------------- 库存页 ---------------- */
let invCat = 'all';
const cart = new Map();
const DEMO_PRICE = { '染发膏（自然黑）':32,'电推剪刀头':45,'烫发药水':68,'一次性毛巾':28,'剃须膏':39,
  '卡诗护发素':128,'护发精油':88,'染发膏（栗棕）':32,'专业洗发水':58,'围布 / 披肩':15 };
function unitPrice(v){ return (v.cost && v.cost > 0) ? v.cost : (DEMO_PRICE[v.name] || 30); }
function renderInventory(){
  const list = INVENTORY.filter(v => invCat==='all' || v.cat===invCat || (invCat==='wash' && v.cat==='care'));
  $('#invList').innerHTML = list.length ? list.map(v=>{
    const realIdx = INVENTORY.indexOf(v);
    const badge = v.level==='danger' ? '<span class="inv-badge ib-danger">库存紧张</span>'
      : v.level==='warn' ? '<span class="inv-badge ib-warn">偏低</span>'
      : '<span class="inv-badge ib-ok">正常</span>';
    const foot = (v.days != null)
      ? `<span>剩余 ${v.pct}% · 预计可用 <b style="color:${v.level==='danger'?'var(--danger)':'inherit'}">${v.days} 天</b></span>`
      : `<span>余量 <b>${v.qty}${esc(v.unit||'')}</b> · 安全库存 ${v.min}${esc(v.unit||'')}</span>`;
    return `<div class="inv-card ${v.level==='danger'?'low':''}">
      <div class="inv-top">
        <div class="inv-name">${esc(v.name)} <span class="inv-spec">${esc(v.spec)}</span></div>
        ${badge}
      </div>
      <div class="inv-bar"><i style="width:${v.pct}%"></i></div>
      <div class="inv-foot">
        ${foot}
        <button class="reorder-btn" data-idx="${realIdx}">${v.level==='danger'?'立即补货':'加入采购'}</button>
      </div>
    </div>`;
  }).join('')
  : (realInv
      ? '<div class="cart-empty"><span class="empty-illus"></span>还没有耗材资料<button class="seed-btn" data-seed="inventory">载入演示库存</button></div>'
      : '<div class="cart-empty"><span class="empty-illus"></span>暂无耗材</div>');
  $$('.reorder-btn').forEach(b=> b.addEventListener('click', ()=>{
    const v = INVENTORY[parseInt(b.dataset.idx)];
    cart.set(v.name, (cart.get(v.name)||0) + 1);
    $('#cartCount').textContent = cart.size;
    $('#cartCount').classList.toggle('zero', cart.size === 0);
    toast(`已加入采购清单：${v.name} ×1`);
  }));
}
function applyInventoryMeta(monthExpense){
  const total = INVENTORY.length;
  const low = INVENTORY.filter(v=>v.level==='danger').length;
  $('#invSummary').textContent = total ? `${total} 种耗材 · ${low ? low+' 种低于安全库存' : '库存充足'}` : '暂无耗材';
  $('#invLowNum').textContent = low;
  $('#invOkNum').textContent = total - low;
  $('#invMonthExp').textContent = '¥' + Math.round(monthExpense).toLocaleString();
}
async function refreshInventory(){
  try {
    const rows = await Store.listInventory();
    INVENTORY.splice(0, INVENTORY.length, ...rows.map(Store.toInventoryView));
    applyInventoryMeta(stats ? stats.monthExpense : 0);
    renderInventory();
    refreshDerived();
  } catch(e) { /* 静默 */ }
}
$('#invSeg').addEventListener('click', e=>{
  const seg = e.target.closest('.seg'); if (!seg) return;
  $$('#invSeg .seg').forEach(s=>s.classList.toggle('on', s===seg));
  invCat = seg.dataset.cat;
  renderInventory();
});
$('#cartBtn').addEventListener('click', ()=>{
  let total = 0;
  cart.forEach((qty,name)=> total += unitPrice({name})*qty);
  openSheet(`
    <div class="sheet-title">采购清单</div>
    <div class="sheet-sub">共 ${cart.size} 种耗材，供应商：美业一站采（账期 7 天）</div>
    ${cart.size === 0 ? '<div class="cart-empty"><span class="empty-illus"></span>清单还是空的，去库存页添加吧</div>' :
      [...cart.entries()].map(([name,qty])=>`
        <div class="cart-li"><span>${esc(name)}</span>
          <span class="qty">×${qty} · 约 ¥${unitPrice({name})*qty}
          <em data-del="${esc(name)}" style="margin-left:8px;color:var(--danger);font-style:normal">移除</em></span>
        </div>`).join('') +
      `<div class="cart-total"><span>预估合计</span><span>¥${total}</span></div>
       <div class="sheet-actions">
         <button class="sa-btn sa-ghost" data-close>再想想</button>
         <button class="sa-btn sa-primary" id="orderOk">提交采购单</button>
       </div>`}`);
  $$('#sheet [data-del]').forEach(x=> x.addEventListener('click', ()=>{
    cart.delete(x.dataset.del); $('#cartCount').textContent = cart.size;
    $('#cartCount').classList.toggle('zero', cart.size === 0);
    $('#cartBtn').click();
  }));
  const ok = $('#orderOk');
  ok && ok.addEventListener('click', ()=>{
    cart.clear(); $('#cartCount').textContent = 0;
    $('#cartCount').classList.add('zero');
    closeSheet(); toast('采购单已提交，预计明天下午送达');
  });
});
renderInventory();

/* 演示数据种子（空客户/空库存页一键导入） */
document.addEventListener('click', async e=>{
  const btn = e.target.closest('[data-seed]');
  if (!btn) return;
  btn.disabled = true;
  const kind = btn.dataset.seed;
  try {
    if (kind === 'customers'){ await Store.seedCustomers(); await refreshCustomers(); toast('演示客户已导入'); }
    if (kind === 'inventory'){ await Store.seedInventory(); await refreshInventory(); toast('演示库存已导入'); }
  } catch (err) {
    toast('导入失败：' + Store.errMsg(err));
    btn.disabled = false;
  }
});

/* ---------------- 经营分析页 ---------------- */
let revPeriod = 'month';
function renderRevChart(){
  const d = REVENUE[revPeriod];
  const hasData = d && [...d.thisYear, ...d.lastYear].some(v => v > 0);
  $('#revChart').hidden = !hasData;
  $('#revEmpty').hidden = hasData;
  if (!hasData) { $('#revChart').innerHTML = ''; return; }
  Charts.lineChart($('#revChart'), {
    labels:d.labels, height:190,
    series:[
      { name:'今年', color:'#F0B429', data:d.thisYear, area:true },
      { name:'去年', color:'#C4CBD8', data:d.lastYear, area:false },
    ]
  });
}
$('#insightSeg').addEventListener('click', e=>{
  const seg = e.target.closest('.seg'); if (!seg) return;
  $$('#insightSeg .seg').forEach(s=>s.classList.toggle('on', s===seg));
  revPeriod = seg.dataset.period;
  renderRevChart();
});
if ($('#page-insights').classList.contains('on')) renderRevChart();
window.addEventListener('resize', ()=>{ if ($('#page-insights').classList.contains('on')) renderRevChart(); });

/* ---------------- 财务健康：三大报表轻量版 ---------------- */
const fmtY = v => v.toLocaleString('zh-CN',{minimumFractionDigits:(Number(v)===v && v%1?2:0),maximumFractionDigits:2});
const sumAmt = arr => arr.reduce((s,x)=>s+x.amount,0);
function animateFinBars(sel){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    $$(sel).forEach(b=>{ b.style.width = b.dataset.w + '%'; });
  }));
}
const FIN_EMPTY = t => `<div class="fin-pane"><div class="list-empty">${t}</div></div>`;
function renderPL(period){
  const d = PL_DATA[period];
  if (!d.income.length && !d.cost.length){
    $('#finContent').innerHTML = `<div class="fin-pane">
      <div class="fin-mini-seg" id="plPeriod">
        ${[['month','月'],['quarter','季'],['year','年']].map(([k,t])=>
          `<span class="seg ${k===period?'on':''}" data-p="${k}">${t}</span>`).join('')}
      </div>
      <div class="list-empty">${d.label}暂无收支记录，记账后自动生成利润表</div></div>`;
    $('#plPeriod').addEventListener('click', e=>{
      const seg = e.target.closest('.seg'); if (seg) renderPL(seg.dataset.p);
    });
    return;
  }
  const incTotal = sumAmt(d.income), costTotal = sumAmt(d.cost);
  const gross = incTotal - costTotal;
  const rate = incTotal > 0 ? (gross/incTotal*100).toFixed(1) : '0.0';
  $('#finContent').innerHTML = `
    <div class="fin-pane">
      <div class="fin-mini-seg" id="plPeriod">
        ${[['month','月'],['quarter','季'],['year','年']].map(([k,t])=>
          `<span class="seg ${k===period?'on':''}" data-p="${k}">${t}</span>`).join('')}
      </div>
      <div class="fin-block">收入明细<span class="fin-hint">${d.label}</span></div>
      ${d.income.map(x=>`
        <div class="fin-row">
          <span class="fr-name">${x.name}</span>
          <span class="fin-bar"><i data-w="${(x.amount/incTotal*100).toFixed(1)}"></i></span>
          <span class="fr-val">¥${fmtY(x.amount)}</span>
        </div>`).join('')}
      <div class="fin-subtotal"><span>营业收入合计</span><b>¥${fmtY(incTotal)}</b></div>
      <div class="fin-block" style="margin-top:10px">减：成本费用</div>
      ${d.cost.map(x=>`
        <div class="fin-row">
          <span class="fr-name">${x.name}</span>
          <span class="fr-val cost" data-sign="−">¥${fmtY(x.amount)}</span>
        </div>`).join('')}
      <div class="fin-subtotal"><span>成本费用合计</span><b>−¥${fmtY(costTotal)}</b></div>
      <div class="fin-gross">
        <div>
          <div class="fg-label">毛利润</div>
          <div class="fg-sub">营业收入 − 成本费用</div>
        </div>
        <div style="text-align:right">
          <div class="fg-num">¥${fmtY(gross)}<small>元</small></div>
          <div class="fg-rate">利润率 ${rate}%</div>
        </div>
      </div>
    </div>`;
  animateFinBars('#finContent .fin-bar i');
  $('#plPeriod').addEventListener('click', e=>{
    const seg = e.target.closest('.seg'); if (!seg) return;
    renderPL(seg.dataset.p);
  });
}
function renderBS(){
  const a = sumAmt(BS_DATA.assets), l = sumAmt(BS_DATA.liabilities);
  const net = a - l;
  if (a === 0 && l === 0){ $('#finContent').innerHTML = FIN_EMPTY('暂无资产数据，记账或录入库存后自动生成家底清单'); return; }
  const group = (title, items, sum, cls)=>`
    <div class="bs-group ${cls}">
      <div class="bs-g-head"><span class="dot"></span>${title}
        <span class="g-sum">¥${fmtY(sum)}</span></div>
      ${items.map(x=>`
        <div class="bs-row">
          <div><div class="br-name">${x.name}</div><div class="br-note">${x.note}</div></div>
          <span class="br-val">¥${fmtY(x.amount)}</span>
        </div>`).join('')}
    </div>`;
  $('#finContent').innerHTML = `
    <div class="fin-pane">
      ${group('资产', BS_DATA.assets, a, 'asset')}
      ${group('负债', BS_DATA.liabilities, l, 'liab')}
      <div class="bs-net">
        <div>
          <div class="bn-label">净资产（家底）</div>
          <div class="bn-sub">资产 − 负债 · ${BS_DATA.snapshotDate}</div>
        </div>
        <div class="bn-num">¥${fmtY(net)}<small>元</small></div>
      </div>
    </div>`;
}
function renderCF(){
  const tin = sumAmt(CF_DATA.inflow), tout = sumAmt(CF_DATA.outflow);
  const net = tin - tout, max = Math.max(tin, tout, 1);
  if (tin === 0 && tout === 0){ $('#finContent').innerHTML = FIN_EMPTY('本月暂无资金流动，记账后自动生成现金流'); return; }
  $('#finContent').innerHTML = `
    <div class="fin-pane">
      <div class="cf-compare">
        <div class="cf-bar-row">
          <span class="cf-tag in">流入</span>
          <span class="cf-track"><i class="in-fill" data-w="${(tin/max*100).toFixed(1)}"></i></span>
          <span class="cf-amt in">¥${fmtY(tin)}</span>
        </div>
        <div class="cf-bar-row">
          <span class="cf-tag out">流出</span>
          <span class="cf-track"><i class="out-fill" data-w="${(tout/max*100).toFixed(1)}"></i></span>
          <span class="cf-amt out">¥${fmtY(tout)}</span>
        </div>
      </div>
      <div class="fin-block">钱从哪来 · ${CF_DATA.label}</div>
      ${CF_DATA.inflow.map(x=>`
        <div class="fin-row"><span class="fr-name">${x.name}</span>
          <span class="fr-val" style="color:var(--gold-deep)">+¥${fmtY(x.amount)}</span></div>`).join('')}
      <div class="fin-block" style="margin-top:8px">花哪去了</div>
      ${CF_DATA.outflow.map(x=>`
        <div class="fin-row"><span class="fr-name">${x.name}</span>
          <span class="fr-val cost">−¥${fmtY(x.amount)}</span></div>`).join('')}
      <div class="cf-net" style="margin-top:10px">
        <div>
          <div class="cn-label">本月净现金流</div>
          <div class="cn-sub">流入 − 流出，为正说明账上钱在变多</div>
        </div>
        <div class="cn-num">${net>=0?'+':'−'}¥${fmtY(Math.abs(net))}</div>
      </div>
    </div>`;
  animateFinBars('#finContent .cf-track i');
}
function renderFinance(tab){
  if (tab === 'pl') renderPL('month');
  else if (tab === 'bs') renderBS();
  else renderCF();
}
$('#finSeg').addEventListener('click', e=>{
  const seg = e.target.closest('.seg'); if (!seg) return;
  $$('#finSeg .seg').forEach(s=>s.classList.toggle('on', s===seg));
  renderFinance(seg.dataset.fin);
});
renderFinance('pl');

/* ============================================================
   真实数据：统计 → DOM
   ============================================================ */
function replaceGroups(groups){
  TX_GROUPS.splice(0, TX_GROUPS.length, ...groups);
}
function applyStats(s){
  stats = s;
  monthCount = s.monthCount;
  animateNum($('#homeTodayAmount'), s.todayIncome, 2, 700);
  animateNum($('#homeMonthAmount'), s.monthIncome, 2, 800);
  animateNum($('#homeMonthExpense'), s.monthExpense, 2, 800);
  $('#homeTodayCount').textContent = s.todayCount;
  $('#ledgerMonth').textContent = `本月 ${s.monthCount} 笔`;
  /* 较昨日对比 */
  const cmp = $('#homeTodayCmp');
  if (s.yesterdayIncome > 0){
    const pct = Math.round((s.todayIncome - s.yesterdayIncome) / s.yesterdayIncome * 1000) / 10;
    cmp.innerHTML = `较昨日 <em class="${pct>=0?'up':'down'}">${pct>=0?'+':''}${pct}%</em>`;
  } else {
    cmp.textContent = '昨日暂无对比';
  }
  /* 库存页月度耗材支出 */
  $('#invMonthExp').textContent = '¥' + Math.round(s.monthExpense).toLocaleString();
  /* 参谋页营业收入 KPI */
  kpiMonth = s.monthIncome;
  if (insightInited) animateNum($('#kpiRev'), Math.round(kpiMonth), 0, 600);
}
/* 离线降级时的演示口径（与原 prototype 假数据一致） */
const FALLBACK_STATS = {
  todayIncome:1286, todayCount:12, yesterdayIncome:1188,
  monthIncome:38642.5, monthExpense:4210, monthCount:168
};

/* ============================================================
   真实数据 → 首页话术 / 待办 / 经营参谋（数据为空显示零或空状态）
   ============================================================ */
let todos = [];            // 未完成待办
let todoTableReady = true; // todos 表是否已建
let demoMode = false;      // 接口失败降级为演示数据

function setKpi(id, val, cmp, decimals){
  animateNum($('#'+id), val, decimals || 0, 600);
  const em = $('#'+id+'Cmp');
  if (em && cmp){ em.textContent = cmp.text; em.className = cmp.cls; }
}
function renderTodos(){
  const n = todos.length;
  $('#todoCount').textContent = `${n} 条需处理`;
  const bell = $('#homeBell');
  bell.dataset.tip = n ? `${n} 条待办` : '暂无待办';
  $('#bellDot').hidden = n === 0;
  const add = `<div class="todo-add"><input id="todoInput" maxlength="40" placeholder="${todoTableReady?'添加一条待办，如：周五前补货染发膏':'待办表未初始化'}" ${todoTableReady?'':'disabled'}/><button id="todoAddBtn" ${todoTableReady?'':'disabled'}>添加</button></div>`;
  const empty = todoTableReady
    ? '<div class="list-empty">暂无待办，今天可以专心做生意 ✨</div>'
    : '<div class="list-empty">待办功能需先在 Supabase 执行 supabase/migrations/002_todos.sql</div>';
  $('#todoList').innerHTML = (n ? todos.map(t => `
    <div class="todo-item">
      <span class="todo-ic todo-warn">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12l3 3 5-6"/></svg>
      </span>
      <div class="todo-body">
        <div class="todo-title">${esc(t.title)}</div>
        <div class="todo-desc">创建于 ${new Date(t.created_at).toLocaleDateString('zh-CN')}</div>
      </div>
      <span class="todo-btn warn" data-todo-done="${t.id}">完成</span>
    </div>`).join('') : empty) + (demoMode ? '' : add);
}
async function refreshTodos(){
  if (demoMode) return renderTodos();
  try {
    const r = await Store.listTodos();
    todoTableReady = r !== null;
    todos = r || [];
  } catch(e){ todos = []; }
  renderTodos();
  renderHero();
}
document.addEventListener('click', async e=>{
  const done = e.target.closest('[data-todo-done]');
  if (done){
    done.textContent = '…';
    try { await Store.completeTodo(done.dataset.todoDone); toast('待办已完成'); }
    catch(err){ toast('操作失败：' + Store.errMsg(err)); }
    return refreshTodos();
  }
  if (e.target.closest('#todoAddBtn')){
    const inp = $('#todoInput'); const title = (inp.value || '').trim();
    if (!title) return toast('请输入待办内容');
    try { await Store.addTodo(title); toast('已添加待办'); }
    catch(err){ toast('添加失败：' + Store.errMsg(err)); }
    return refreshTodos();
  }
  if (e.target.closest('#homeBell')){
    const p = $('#todoList'); p && p.scrollIntoView({behavior:'smooth', block:'center'});
  }
});
document.addEventListener('keydown', e=>{
  if (e.key === 'Enter' && e.target.id === 'todoInput') $('#todoAddBtn').click();
});

function renderHero(){
  const hasAny = demoMode || txRows.length > 0;
  const h = demoMode
    ? { title:'演示模式', desc:'实时数据暂时无法加载，当前展示演示数据' }
    : Insights.buildHero(stats || {todayCount:0,todayIncome:0,yesterdayIncome:0,monthIncome:0}, todos.length, hasAny);
  $('#hbTitle').textContent = h.title;
  $('#hbDesc').textContent = h.desc;
}

const ADV_TAG = { '库存':'tag-huo', '客户':'tag-ke', '营收':'tag-go', '稳健':'tag-go' };
function renderInsightsReal(){
  if (demoMode) {
    Charts.gauge($('#gaugeBox'), 82);
    renderGaugeNote({level:'良好',notes:[{t:'当前为演示数据，联网后显示真实经营评分',risk:false}]});
    setKpi('kpiRev', Math.round(FALLBACK_STATS.monthIncome), {text:'演示数据',cls:'flat'});
    const adv = Insights.build([], CUSTOMERS, INVENTORY).advice;
    $('#adviceList').innerHTML = adv.map(a => `<div class="advice-card"><div class="adv-top"><span class="adv-tag ${ADV_TAG[a.tag]||'tag-go'}">${a.tag}</span><span class="adv-conf">演示数据</span></div><p class="adv-text"><b>${esc(a.title)}</b>：${esc(a.desc)}</p></div>`).join('');
    return;
  }
  const d = Insights.build(txRows, CUSTOMERS, INVENTORY);
  /* 覆盖演示口径，复用原渲染函数 */
  Object.assign(REVENUE, d.revenue);
  Object.assign(PL_DATA, d.pl);
  Object.assign(BS_DATA, d.bs);
  Object.assign(CF_DATA, d.cf);
  Charts.gauge($('#gaugeBox'), d.health.score);
  renderGaugeNote(d.health);
  kpiMonth = d.kpi.rev;
  setKpi('kpiRev', d.kpi.rev, d.kpi.revCmp);
  setKpi('kpiAvg', d.kpi.avg, d.kpi.avgCmp, 1);
  setKpi('kpiFlow', d.kpi.flow, d.kpi.flowCmp);
  setKpi('kpiRepeat', d.kpi.repeat, d.kpi.repeatCmp);
  /* 商圈竞品：尚未接入外部数据源，真实账号显示空状态 */
  $('#cmpBox').innerHTML = '<div class="list-empty">暂未接入美团 / 大众点评商圈数据，接入后自动展示竞品对比</div>';
  $('#adviceList').innerHTML = d.advice.length ? d.advice.map(a => `
    <div class="advice-card">
      <div class="adv-top"><span class="adv-tag ${ADV_TAG[a.tag]||'tag-go'}">${a.tag}</span><span class="adv-conf">基于本店真实数据</span></div>
      <p class="adv-text"><b>${esc(a.title)}</b>：${esc(a.desc)}</p>
      ${a.tag==='库存'?'<button class="adv-btn" data-go="inventory">去库存页补货</button>':''}
      ${a.tag==='客户'?'<button class="adv-btn" data-go="customers">查看流失客户</button>':''}
    </div>`).join('')
    : '<div class="list-empty">数据积累中，记账满一周后生成经营建议</div>';
  const finOn = $('#finSeg .seg.on');
  renderFinance(finOn ? finOn.dataset.fin : 'pl');
  if ($('#page-insights').classList.contains('on')) renderRevChart();
}
function renderGaugeNote(h){
  const cls = h.score === 0 && h.level === '暂无数据' ? 'style="color:var(--ink-3);background:var(--bg-gray)"' : '';
  $('#gaugeNote').innerHTML = `
    <div class="gn-title">经营健康分 <em ${cls}>${esc(h.level)}</em></div>
    <ul>${h.notes.map(n=>`<li class="${n.risk?'risk':''}">${esc(n.t)}</li>`).join('')}</ul>`;
}
function refreshDerived(){
  renderHero();
  renderInsightsReal();
}

/* ---------------- 问候 / 店铺资料 / 退出登录 ---------------- */
function renderGreeting(){
  const d = new Date();
  const h = d.getHours();
  const g = h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  $('#helloText').textContent =
    `${g}，老板，今天是 ${d.getMonth()+1} 月 ${d.getDate()} 日 周${'日一二三四五六'[d.getDay()]}`;
}
function applyProfile(){
  const nameEl = $('#shopNameText');
  if (nameEl) nameEl.textContent = shopName;
  $('#sbUserMail').textContent = currentUser.email || '';
}
function openProfile(){
  openSheet(`
    <div class="sheet-title">店铺与账号</div>
    <div class="sheet-sub">店铺名称会展示在首页</div>
    <div class="confirm-card">
      <div class="cf-row"><label>店铺名称</label><input id="pfShop" value="${esc(shopName)}" maxlength="20" /></div>
      <div class="cf-row"><label>登录邮箱</label><input value="${esc(currentUser.email||'')}" disabled /></div>
    </div>
    <div class="sheet-actions">
      <button class="sa-btn sa-ghost" id="pfLogout">退出登录</button>
      <button class="sa-btn sa-primary" id="pfSave">保存</button>
    </div>`);
  $('#pfLogout').addEventListener('click', logout);
  $('#pfSave').addEventListener('click', async ()=>{
    const name = $('#pfShop').value.trim() || '我的小店';
    const btn = $('#pfSave'); btn.disabled = true; btn.textContent = '保存中…';
    try {
      profile = await Store.saveProfile({ shop_name: name });
      shopName = name;
      applyProfile();
      closeSheet();
      toast('店铺资料已保存');
    } catch(e){
      btn.disabled = false; btn.textContent = '保存';
      toast('保存失败：' + Store.errMsg(e));
    }
  });
}
async function logout(){
  try { await window.sb.auth.signOut(); } catch(_) {}
  location.replace('auth.html');
}
$('#shopNameBtn').addEventListener('click', openProfile);
$('#sbLogout').addEventListener('click', logout);

/* ============================================================
   启动：先查登录态，未登录跳 auth.html；登录后并行拉取四张表
   ============================================================ */
function splashFatal(msg){
  const sp = $('#splash');
  sp.innerHTML = `<div style="padding:32px;text-align:center;color:#4E5969;font-size:14px;line-height:1.7">
    <div style="font-size:30px;margin-bottom:10px">⚠️</div>${esc(msg)}<br/>
    <button onclick="location.reload()" class="seed-btn" style="margin-top:14px">刷新重试</button></div>`;
  sp.classList.remove('off');
}
async function boot(){
  const minDelay = new Promise(r=>setTimeout(r, 900));
  try {
    if (!window.SUPABASE_READY || !window.sb) {
      await minDelay;
      splashFatal('登录组件加载失败，请检查网络连接（需要能访问 Supabase CDN）');
      return;
    }
    const { data } = await window.sb.auth.getSession();
    if (!data.session) { location.replace('auth.html'); return; }
    currentUser = data.session.user;

    window.sb.auth.onAuthStateChange(ev => {
      if (ev === 'SIGNED_OUT') location.replace('auth.html');
    });

    renderGreeting();

    const [pRes, txRes, cuRes, invRes, tdRes] = await Promise.allSettled([
      Store.getProfile(),
      Store.listTransactions(),
      Store.listCustomers(),
      Store.listInventory(),
      Store.listTodos()
    ]);

    /* 店铺资料 */
    if (pRes.status === 'fulfilled' && pRes.value) {
      profile = pRes.value;
      shopName = profile.shop_name || '我的小店';
    } else {
      let pending = null;
      try { pending = localStorage.getItem('pending_shop_name'); } catch(_) {}
      if (pending) {
        shopName = pending;
        Store.saveProfile({ shop_name: pending })
          .then(()=>{ try { localStorage.removeItem('pending_shop_name'); } catch(_){} })
          .catch(()=>{});
      }
    }
    applyProfile();

    /* 账目流水 */
    if (txRes.status === 'fulfilled') {
      realTx = true;
      txRows = txRes.value;
      replaceGroups(Store.groupTransactions(txRows));
      applyStats(Store.computeStats(txRows));
      /* 新账号没有储值数据，隐藏演示口径 */
      $('#homeStoredVal').innerHTML = '0<span class="unit">元</span>';
      $('#homeStoredSub').textContent = '会员储值 · 待开放';
    } else {
      demoMode = true;
      applyStats(FALLBACK_STATS);
      setTimeout(()=>toast('实时数据加载失败，当前为演示数据'), 1200);
    }
    renderFlow();

    /* 客户 */
    if (cuRes.status === 'fulfilled') {
      realCust = true;
      CUSTOMERS.splice(0, CUSTOMERS.length,
        ...cuRes.value.map(r => Store.toCustomerView(r, txRows)));
    }
    applyCustomerSummary();
    renderCustomers();

    /* 库存 */
    if (invRes.status === 'fulfilled') {
      realInv = true;
      INVENTORY.splice(0, INVENTORY.length, ...invRes.value.map(Store.toInventoryView));
    }
    applyInventoryMeta(stats ? stats.monthExpense : 0);
    renderInventory();

    // 待办
    if (tdRes.status === 'fulfilled') {
      todoTableReady = tdRes.value !== null;
      todos = tdRes.value || [];
    } else {
      todos = [];
    }
    renderTodos();
    refreshDerived();

  } catch (e) {
    demoMode = true;
    applyStats(FALLBACK_STATS);
    renderTodos();
    refreshDerived();
    setTimeout(()=>toast('初始化异常：' + Store.errMsg(e)), 1200);
  } finally {
    await minDelay;
    $('#splash').classList.add('off');
  }
}
boot();

}).call(this);
