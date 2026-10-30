/* ============================================================
   来钱花 · 原型演示数据（虚构，仅用于交互演示）
   ============================================================ */

// 服务项目图标色（首字徽标 · 白金体系彩色配色）
const CATE_ICON = {
   haircut:['剪','#F0B429'], wash:['洗','#15B36B'], dye:['染','#F77234'],
   perm:['烫','#7A5AF8'], care:['护','#0FB5C9'], child:['童','#3370FF'],
   expense:['支','#9AA5B5']
};

// 流水：新确认的记账会动态插入最前
const TX_GROUPS = [
  { day:'今天 10月30日（周五）', items:[
    { title:'女士剪发 + 护理', sub:'10:52 · 会员卡 · 李桂芬', cat:'care', amount:98, type:'in' },
    { title:'染发（栗棕）',     sub:'10:15 · 支付宝 · 周敏',   cat:'dye',  amount:298, type:'in' },
    { title:'儿童理发',         sub:'09:40 · 现金 · 散客',     cat:'child',amount:28,  type:'in' },
    { title:'采购一次性毛巾 60条',sub:'09:05 · 微信 · 支出',   cat:'expense', amount:-120, type:'out' },
    { title:'洗剪吹 ×2',        sub:'09:20 · 微信 · 散客',     cat:'haircut', amount:76, type:'in' },
  ]},
  { day:'昨天 10月29日（周四）', items:[
    { title:'烫染套餐',         sub:'15:30 · 美团核销 · 陈美玲', cat:'perm', amount:268, type:'in' },
    { title:'男士油头精剪',     sub:'14:10 · 微信 · 张伟',     cat:'haircut', amount:58,  type:'in' },
    { title:'洗剪吹',           sub:'11:05 · 现金 · 散客',     cat:'haircut', amount:38,  type:'in' },
    { title:'卡诗护理',         sub:'10:30 · 会员卡 · 李桂芬', cat:'care', amount:128, type:'in' },
    { title:'洗发水补货 4 瓶',  sub:'09:50 · 微信 · 支出',     cat:'expense', amount:-180,type:'out' },
    { title:'洗剪吹',           sub:'09:15 · 支付宝 · 散客',   cat:'haircut', amount:38,  type:'in' },
  ]},
  { day:'10月28日（周三）', items:[
    { title:'女士短发修剪',     sub:'16:20 · 会员卡 · 孙德海', cat:'haircut', amount:48, type:'in' },
    { title:'染发（自然黑）',   sub:'14:00 · 微信 · 吴芳',     cat:'dye',  amount:238, type:'in' },
    { title:'洗剪吹 ×3',        sub:'上午 · 混合支付',         cat:'haircut', amount:114,type:'in' },
    { title:'烫发（梨花卷）',   sub:'11:30 · 支付宝 · 周敏',   cat:'perm', amount:328, type:'in' },
  ]},
];

// 客户：trend 为近 6 个月消费额
const CUSTOMERS = [
  { name:'王秀兰', tags:['vip','risk'], tagTxt:['VIP熟客','流失预警'], last:45, visits:26, total:4860,
    trend:[620,480,560,380,260,0], prefs:['女士烫染','卡诗护理','栗棕色系'],
    advice:'该客户客单高、周期约 35 天，本次明显超期。建议先微信问候并附 10 元护理券，暂不建议大额折扣，避免拉低其价格预期。' },
  { name:'陈美玲', tags:['vip'], tagTxt:['VIP熟客'], last:2, visits:21, total:3240,
    trend:[280,520,360,680,420,596], prefs:['烫染套餐','美团下单','周末到店'], advice:'' },
  { name:'李桂芬', tags:['vip'], tagTxt:['熟客'], last:12, visits:18, total:2386,
    trend:[180,220,98,260,158,196], prefs:['女士短发','头发护理','会员卡'], advice:'' },
  { name:'周敏', tags:['vip'], tagTxt:['熟客'], last:6, visits:12, total:1890,
    trend:[120,0,328,260,0,566], prefs:['烫发','染发','支付宝'], advice:'' },
  { name:'张伟', tags:['vip'], tagTxt:['熟客'], last:5, visits:16, total:960,
    trend:[58,116,58,58,116,58], prefs:['男士油头','两周一次'], advice:'' },
  { name:'刘建国', tags:['risk'], tagTxt:['流失预警'], last:30, visits:10, total:1120,
    trend:[156,196,118,76,0,0], prefs:['男士理发','剃须'],
    advice:'近两次到店间隔持续拉长，可能已更换理发店。可发 5 元剪发券低成本测试意向，不建议电话打扰。' },
  { name:'孙德海', tags:['vip'], tagTxt:['熟客'], last:20, visits:9, total:780,
    trend:[0,86,128,48,0,168], prefs:['女士短发','带孩子同剪'], advice:'' },
  { name:'吴芳', tags:['risk'], tagTxt:['流失预警'], last:52, visits:6, total:660,
    trend:[238,158,0,0,0,0], prefs:['自然黑染发'],
    advice:'已 52 天未到店且无储值余额，唤回概率较低，建议纳入季度短信关怀，不单独投放优惠。' },
  { name:'赵小雨', tags:['new'], tagTxt:['新客'], last:0, visits:1, total:58,
    trend:[0,0,0,0,0,58], prefs:['洗剪吹','到店自提'], advice:'' },
  { name:'郑凯', tags:['new'], tagTxt:['新客'], last:1, visits:1, total:38,
    trend:[0,0,0,0,0,38], prefs:['男士剪发'], advice:'' },
];

// 库存
const INVENTORY = [
  { name:'染发膏（自然黑）', spec:'120g/支 · 剩余 2 支', cat:'dye', pct:15, days:8,  level:'danger' },
  { name:'电推剪刀头',       spec:'通用款 · 剩余 1 个', cat:'tool',pct:16, days:6,  level:'danger' },
  { name:'烫发药水',         spec:'套装 · 剩余 1 套',   cat:'dye', pct:19, days:9,  level:'danger' },
  { name:'一次性毛巾',       spec:'100条/包 · 剩余 1 包',cat:'wash',pct:20, days:7, level:'danger' },
  { name:'剃须膏',           spec:'150g · 剩余 1/4 瓶', cat:'wash',pct:24, days:11, level:'warn' },
  { name:'卡诗护发素',       spec:'1000ml · 半瓶',      cat:'wash',pct:46, days:23, level:'ok' },
  { name:'护发精油',         spec:'50ml · 半瓶',        cat:'care',pct:52, days:30, level:'ok' },
  { name:'染发膏（栗棕）',   spec:'120g/支 · 剩余 5 支',cat:'dye', pct:58, days:35, level:'ok' },
  { name:'专业洗发水',       spec:'2000ml · 剩余 3 瓶', cat:'wash',pct:72, days:48, level:'ok' },
  { name:'围布 / 披肩',      spec:'共 12 条 · 可周转',  cat:'tool',pct:80, days:90, level:'ok' },
];

// 营收同比（单位：元）
const REVENUE = {
  month:{
    labels:['第1周','第2周','第3周','第4周','本周'],
    thisYear:[8200, 9100, 8680, 9460, 3202],
    lastYear:[7300, 8000, 7800, 8300, 2980],
  },
  quarter:{
    labels:['8月上','8月下','9月上','9月下','10月上','10月下'],
    thisYear:[16800, 18200, 17500, 19600, 18900, 19742],
    lastYear:[15200, 16100, 15800, 17400, 16900, 17200],
  },
  year:{
    labels:['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月'],
    thisYear:[31200,24800,30600,33400,35800,34200,36900,35000,37100,38642],
    lastYear:[28100,22600,27400,29800,31900,30600,32800,31300,33200,34380],
  },
};

/* ============================================================
   财务健康模块 · 三大报表轻量演示数据（虚构）
   ============================================================ */

// ① 利润表（本月赚了多少）—— 支持 月/季/年 切换
const PL_DATA = {
  month:{
    label:'本月（10月）',
    income:[
      { name:'剪发 / 洗剪吹', amount:16800 },
      { name:'染烫项目',      amount:12400 },
      { name:'护理项目',      amount:5842.5 },
      { name:'儿童及其他',    amount:3600 },
    ],
    cost:[
      { name:'耗材成本', amount:4210 },
      { name:'门店房租', amount:6000 },
      { name:'人工提成', amount:12000 },
    ],
  },
  quarter:{
    label:'近 3 月（8–10月）',
    income:[
      { name:'剪发 / 洗剪吹', amount:47200 },
      { name:'染烫项目',      amount:34800 },
      { name:'护理项目',      amount:16420 },
      { name:'儿童及其他',    amount:10000 },
    ],
    cost:[
      { name:'耗材成本', amount:11860 },
      { name:'门店房租', amount:18000 },
      { name:'人工提成', amount:33000 },
    ],
  },
  year:{
    label:'近一年（11月–至今）',
    income:[
      { name:'剪发 / 洗剪吹', amount:178600 },
      { name:'染烫项目',      amount:132400 },
      { name:'护理项目',      amount:62680 },
      { name:'儿童及其他',    amount:39000 },
    ],
    cost:[
      { name:'耗材成本', amount:46800 },
      { name:'门店房租', amount:72000 },
      { name:'人工提成', amount:128000 },
    ],
  },
};

// ② 资产负债表（家底清单）—— 月底快照
const BS_DATA = {
  snapshotDate:'10月31日月底快照',
  assets:[
    { name:'现金 / 银行账户', amount:86420, note:'工行对公 + 收款码' },
    { name:'库存耗材',        amount:8650,  note:'18 种耗材按采购价' },
  ],
  liabilities:[
    { name:'会员储值卡', amount:9860, note:'34 位会员待核销 · 预收服务款' },
    { name:'供货商应付', amount:3260, note:'美业一站采 · 账期 7 天' },
  ],
};

// ③ 现金流量表（钱从哪来花哪去）—— 本月
const CF_DATA = {
  label:'本月（10月）',
  inflow:[
    { name:'营业收款',   amount:40620 },
    { name:'储值卡充值', amount:1560 },
  ],
  outflow:[
    { name:'采购耗材', amount:4210 },
    { name:'门店房租', amount:6000 },
    { name:'人工提成', amount:12000 },
    { name:'其他支出', amount:1860 },
  ],
};
