/* ============================================================
   来钱花 · 交互逻辑
   ============================================================ */
(function(){
'use strict';
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ---------------- 启动屏 & Tab ---------------- */
setTimeout(()=> $('#splash').classList.add('off'), 1150);

const TABS = ['home','ledger','customers','inventory','insights'];
function go(tab){
  if (!TABS.includes(tab)) return;
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  $$('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + tab));
  // 切到分析页时确保图表按容器宽度重绘
  if (tab === 'insights') renderRevChart();
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
  toastTimer = setTimeout(()=> t.classList.remove('on'), 2200);
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
  const ic = CATE_ICON[tx.cat] || ['收','#B8860B'];
  return `<div class="flow-row">
    <span class="flow-ic ${tx.type==='in'?'fi-in':'fi-out'}">${ic[0]}</span>
    <div class="flow-body">
      <div class="flow-title">${tx.title}</div>
      <div class="flow-sub">${tx.sub}</div>
    </div>
    <span class="flow-amt ${tx.type==='in'?'in':'out'}">${tx.amount>0?'+':''}${tx.amount.toFixed(0)}</span>
  </div>`;
}
function renderFlow(){
  $('#ledgerList').innerHTML = TX_GROUPS.map(g =>
    `<div class="flow-day">${g.day}</div>${g.items.map(flowRow).join('')}`
  ).join('');
  // 首页只展示今天前 4 条
  $('#homeFlow').innerHTML = TX_GROUPS[0].items.slice(0,4).map(flowRow).join('');
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
  { title:'烫染套餐（美团团购核销）', cat:'perm', amount:268, pay:'美团', customer:'陈美玲', qty:1 };

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
    <div class="ov-bubble" id="ovBubble">${said}</div>
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
      <span>${text}…</span>
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
      <div class="cf-row"><label>项目</label><input id="cfTitle" value="${d.title}" /></div>
      <div class="cf-row cf-amount"><label>金额（元）</label><input id="cfAmount" type="number" value="${d.amount}" inputmode="decimal"/></div>
      <div class="cf-row"><label>支付方式</label>
        <div class="pay-tags" id="cfPay">
          ${['微信','支付宝','现金','会员卡','美团'].map(p=>
            `<span class="pay-tag ${p===d.pay?'on':''}" data-v="${p}">${p}</span>`).join('')}
        </div></div>
      <div class="cf-row"><label>客户</label><input id="cfCust" value="${d.customer}" /></div>
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

/* ---------------- 确认入账：更新流水与首页金额 ---------------- */
let monthCount = 168;
function commitTx(d){
  const tx = { title:d.title, sub:`${nowHM()} · ${d.pay} · ${d.customer}`,
    cat:d.cat, amount:d.amount, type:d.amount>=0?'in':'out' };
  TX_GROUPS[0].items.unshift(tx);
  renderFlow();
  if (tx.type === 'in'){
    const todayEl = $('#homeTodayAmount');
    const cur = parseFloat(todayEl.textContent.replace(/,/g,'')) + d.amount;
    todayEl.textContent = cur.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
    const cnt = $('#homeTodayCount'); cnt.textContent = (parseInt(cnt.textContent)+1);
    const mEl = $('#homeMonthAmount');
    const mv = parseFloat(mEl.textContent.replace(/,/g,'')) + d.amount;
    mEl.textContent = mv.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
    monthCount++;
    $('#ledgerMonth').textContent = `本月 ${monthCount} 笔`;
    toast(`记账成功 +¥${d.amount.toFixed(0)}，已同步首页`);
  } else {
    toast(`已记支出 ¥${Math.abs(d.amount).toFixed(0)}`);
  }
}

$('#micBtn').addEventListener('click', ()=> startVoice());
$$('.vchip').forEach(c => c.addEventListener('click', ()=> startVoice(c.dataset.say)));

/* ---------------- 客户页 ---------------- */
let custSeg = 'all';
function custTags(c){
  return c.tagTxt.map((t,i)=>
    `<span class="tag ${c.tags[i]==='risk'?'tag-risk':(c.tags[i]==='new'?'tag-new':'tag-vip')}">${t}</span>`).join('');
}
function renderCustomers(){
  const kw = ($('#custSearch').value || '').trim();
  const list = CUSTOMERS.filter(c=>{
    if (kw && !c.name.includes(kw)) return false;
    if (custSeg === 'vip') return c.tags.includes('vip');
    if (custSeg === 'risk') return c.tags.includes('risk');
    if (custSeg === 'new') return c.tags.includes('new');
    return true;
  });
  $('#custList').innerHTML = list.length ? list.map((c,idx)=>`
    <div class="cust-card ${c.tags.includes('risk')?'risk':''}" data-cust="${CUSTOMERS.indexOf(c)}">
      <span class="cust-ava">${c.name[0]}</span>
      <div class="cust-main">
        <div class="cust-name">${c.name} ${custTags(c)}</div>
        <div class="cust-meta">到店 ${c.visits} 次 · 累计 ¥${c.total.toLocaleString()}</div>
      </div>
      <span class="cust-spark" id="spark${idx}"></span>
      <div class="cust-right">
        <div class="cust-days ${c.last>=30?'risk':''}">${c.last===0?'今天到店':c.last+' 天未到店'}</div>
      </div>
    </div>`).join('')
    : '<div class="cart-empty">没有找到匹配的客户</div>';
  list.forEach((c,i)=>{
    const node = document.querySelectorAll('#custList .cust-spark')[i];
    Charts.sparkline(node, c.trend, c.tags.includes('risk') ? '#C7806B' : '#D4A017');
  });
  $$('#custList .cust-card').forEach(card=>{
    card.addEventListener('click', ()=> customerDetail(CUSTOMERS[parseInt(card.dataset.cust)]));
  });
}
function customerDetail(c){
  const risk = c.tags.includes('risk');
  openSheet(`
    <div class="cd-head">
      <span class="cd-ava" style="${risk?'background:linear-gradient(145deg,#F6D8CF,#E3A896);color:#8C3A26':''}">${c.name[0]}</span>
      <div>
        <div class="cd-name">${c.name} ${custTags(c)}</div>
        <div class="cd-meta">${c.last===0?'今天到店':'上次到店 '+c.last+' 天前'} · 会员卡号 880${1000+c.visits}</div>
      </div>
    </div>
    <div class="cd-stats">
      <div><b>${c.visits}</b><span>到店次数</span></div>
      <div><b>¥${c.total.toLocaleString()}</b><span>累计消费</span></div>
      <div><b>¥${Math.round(c.total/c.visits)}</b><span>平均客单</span></div>
    </div>
    <div class="cd-chart">
      <div class="ct">近 6 个月消费（元）</div>
      <div id="cdChart"></div>
    </div>
    <div class="pref-tags">${c.prefs.map(p=>`<span>${p}</span>`).join('')}</div>
    ${c.advice ? `<div class="ai-advice">
      <div class="aa-h">💡 AI 唤回建议（保守策略）</div>
      <p>${c.advice}</p>
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
renderCustomers();

/* ---------------- 库存页 ---------------- */
let invCat = 'all';
const cart = new Map();
function renderInventory(){
  const list = INVENTORY.filter(v => invCat==='all' || v.cat===invCat || (invCat==='wash' && v.cat==='care'));
  $('#invList').innerHTML = list.map((v,i)=>{
    const realIdx = INVENTORY.indexOf(v);
    const badge = v.level==='danger' ? '<span class="inv-badge ib-danger">库存紧张</span>'
      : v.level==='warn' ? '<span class="inv-badge ib-warn">偏低</span>'
      : '<span class="inv-badge ib-ok">正常</span>';
    return `<div class="inv-card ${v.level==='danger'?'low':''}">
      <div class="inv-top">
        <div class="inv-name">${v.name} <span class="inv-spec">${v.spec}</span></div>
        ${badge}
      </div>
      <div class="inv-bar"><i style="width:${v.pct}%"></i></div>
      <div class="inv-foot">
        <span>剩余 ${v.pct}% · 预计可用 <b style="color:${v.level==='danger'?'var(--danger)':'inherit'}">${v.days} 天</b></span>
        <button class="reorder-btn" data-idx="${realIdx}">${v.level==='danger'?'立即补货':'加入采购'}</button>
      </div>
    </div>`;
  }).join('');
  $$('.reorder-btn').forEach(b=> b.addEventListener('click', ()=>{
    const v = INVENTORY[parseInt(b.dataset.idx)];
    cart.set(v.name, (cart.get(v.name)||0) + 1);
    $('#cartCount').textContent = cart.size;
    toast(`已加入采购清单：${v.name} ×1`);
  }));
}
$('#invSeg').addEventListener('click', e=>{
  const seg = e.target.closest('.seg'); if (!seg) return;
  $$('#invSeg .seg').forEach(s=>s.classList.toggle('on', s===seg));
  invCat = seg.dataset.cat;
  renderInventory();
});
$('#cartBtn').addEventListener('click', ()=>{
  const PRICE = { '染发膏（自然黑）':32,'电推剪刀头':45,'烫发药水':68,'一次性毛巾':28,'剃须膏':39,
    '卡诗护发素':128,'护发精油':88,'染发膏（栗棕）':32,'专业洗发水':58,'围布 / 披肩':15 };
  let total = 0;
  cart.forEach((qty,name)=> total += (PRICE[name]||30)*qty);
  openSheet(`
    <div class="sheet-title">采购清单</div>
    <div class="sheet-sub">共 ${cart.size} 种耗材，供应商：美业一站采（账期 7 天）</div>
    ${cart.size === 0 ? '<div class="cart-empty">清单还是空的，去库存页添加吧</div>' :
      [...cart.entries()].map(([name,qty])=>`
        <div class="cart-li"><span>${name}</span>
          <span class="qty">×${qty} · 约 ¥${(PRICE[name]||30)*qty}
          <em data-del="${name}" style="margin-left:8px;color:var(--danger);font-style:normal">移除</em></span>
        </div>`).join('') +
      `<div class="cart-total"><span>预估合计</span><span>¥${total}</span></div>
       <div class="sheet-actions">
         <button class="sa-btn sa-ghost" data-close>再想想</button>
         <button class="sa-btn sa-primary" id="orderOk">提交采购单</button>
       </div>`}`);
  $$('#sheet [data-del]').forEach(x=> x.addEventListener('click', ()=>{
    cart.delete(x.dataset.del); $('#cartCount').textContent = cart.size;
    $('#cartBtn').click();
  }));
  const ok = $('#orderOk');
  ok && ok.addEventListener('click', ()=>{
    cart.clear(); $('#cartCount').textContent = 0;
    closeSheet(); toast('采购单已提交，预计明天下午送达');
  });
});
renderInventory();

/* ---------------- 经营分析页 ---------------- */
Charts.gauge($('#gaugeBox'), 82);
let revPeriod = 'month';
function renderRevChart(){
  const d = REVENUE[revPeriod];
  Charts.lineChart($('#revChart'), {
    labels:d.labels, height:190,
    series:[
      { name:'今年', color:'#D4A017', data:d.thisYear, area:true },
      { name:'去年', color:'#B9B09A', data:d.lastYear, area:false },
    ]
  });
}
$('#insightSeg').addEventListener('click', e=>{
  const seg = e.target.closest('.seg'); if (!seg) return;
  $$('#insightSeg .seg').forEach(s=>s.classList.toggle('on', s===seg));
  revPeriod = seg.dataset.period;
  renderRevChart();
});
// 图表初始在隐藏页，宽度为 0；首次切到分析页时重绘（go() 中已处理）
// 兜底：若页面初始即为激活态（如直达打开），立即渲染一次
if ($('#page-insights').classList.contains('on')) renderRevChart();
window.addEventListener('resize', ()=>{ if ($('#page-insights').classList.contains('on')) renderRevChart(); });

}).call(this);
