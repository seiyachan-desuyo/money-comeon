/* ============================================================
   来钱花 · 纯 SVG 图表（无外部依赖，离线可用）
   ============================================================ */
const Charts = (function(){

  function el(tag, attrs){
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ---------- 双系列折线图（带面积渐变、网格、末端标签） ---------- */
  function lineChart(container, opt){
    const W = container.clientWidth || 315;
    const H = opt.height || 190;
    const padL = 8, padR = 44, padT = 16, padB = 26;
    const iw = W - padL - padR, ih = H - padT - padB;
    const labels = opt.labels;
    const series = opt.series;
    const all = series.flatMap(s => s.data);
    let max = Math.max(...all);
    max = Math.ceil(max / 1000) * 1000 * 1.12;
    const min = 0;
    const x = i => padL + (labels.length === 1 ? iw/2 : i * iw / (labels.length - 1));
    const y = v => padT + ih - (v - min) / (max - min) * ih;

    const svg = el('svg', { viewBox:`0 0 ${W} ${H}`, width:'100%', height:H, style:'overflow:visible' });

    // 网格
    const grid = 4;
    for (let g = 0; g <= grid; g++){
      const gy = padT + ih * g / grid;
      svg.appendChild(el('line',{ x1:padL, y1:gy, x2:W-padR, y2:gy, stroke:'#EDE7D8','stroke-width':1,'stroke-dasharray': g===grid?'0':'3 4' }));
    }
    // X 轴标签
    labels.forEach((t, i) => {
      const t1 = el('text',{ x:x(i), y:H-7, 'text-anchor':'middle', 'font-size':10, fill:'#8A7E66' });
      t1.textContent = t; svg.appendChild(t1);
    });

    series.forEach((s, si) => {
      const pts = s.data.map((v,i)=>[x(i), y(v)]);
      const line = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
      if (s.area){
        const gid = 'lg'+Math.random().toString(36).slice(2,8);
        const defs = el('defs',{});
        const grad = el('linearGradient',{id:gid, x1:0,y1:0,x2:0,y2:1});
        grad.innerHTML = `<stop offset="0" stop-color="${s.color}" stop-opacity=".22"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/>`;
        defs.appendChild(grad); svg.appendChild(defs);
        const area = `${line} L ${pts[pts.length-1][0]} ${padT+ih} L ${pts[0][0]} ${padT+ih} Z`;
        svg.appendChild(el('path',{ d:area, fill:`url(#${gid})` }));
      }
      svg.appendChild(el('path',{ d:line, fill:'none', stroke:s.color, 'stroke-width': si===0 ? 2.4 : 1.8,
        'stroke-linecap':'round','stroke-linejoin':'round',
        'stroke-dasharray': si===0 ? '0' : '4 4' }));
      pts.forEach((p,i)=>{
        if (si===0 && i===pts.length-1){
          svg.appendChild(el('circle',{cx:p[0],cy:p[1],r:4.5,fill:'#fff',stroke:s.color,'stroke-width':2.4}));
        } else if (si===0){
          svg.appendChild(el('circle',{cx:p[0],cy:p[1],r:2.6,fill:'#fff',stroke:s.color,'stroke-width':1.6}));
        }
      });
      // 末端数值（对照系列下移避让，避免重叠）
      const last = pts[pts.length-1];
      const tt = el('text',{ x:last[0]+7, y:last[1]+(si===0?3.5:15),'font-size':9.5,'font-weight':si===0?'700':'400', fill:s.color });
      tt.textContent = (s.data[s.data.length-1]/1000).toFixed(1)+'k';
      svg.appendChild(tt);
    });

    // 触摸提示点
    const tipDot = el('circle',{r:4,fill:'#D4A017',stroke:'#fff','stroke-width':2,visibility:'hidden'});
    const tipBg = el('rect',{rx:5,ry:5,fill:'#2B2417',visibility:'hidden'});
    const tipTx = el('text',{'font-size':9.5,fill:'#F3E2B0','text-anchor':'middle',visibility:'hidden'});
    svg.appendChild(tipBg); svg.appendChild(tipTx); svg.appendChild(tipDot);

    const mainPts = series[0].data.map((v,i)=>[x(i),y(v),v]);
    svg.addEventListener('pointerdown', e=>{
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) * W / rect.width;
      let nearest = mainPts[0], nd = Infinity;
      mainPts.forEach(p=>{ const d = Math.abs(p[0]-px); if (d<nd){nd=d;nearest=p;} });
      tipDot.setAttribute('cx',nearest[0]); tipDot.setAttribute('cy',nearest[1]); tipDot.setAttribute('visibility','visible');
      const label = (nearest[2]).toLocaleString()+'元';
      tipTx.textContent = label;
      const tw = label.length * 6.2 + 12;
      let bx = Math.max(2, Math.min(W-tw-2, nearest[0]-tw/2));
      tipBg.setAttribute('x',bx); tipBg.setAttribute('y',Math.max(2,nearest[1]-24));
      tipBg.setAttribute('width',tw); tipBg.setAttribute('height',17);
      tipTx.setAttribute('x',bx+tw/2); tipTx.setAttribute('y',Math.max(15,nearest[1]-11.5));
      tipBg.setAttribute('visibility','visible'); tipTx.setAttribute('visibility','visible');
    });

    container.innerHTML = '';
    container.appendChild(svg);
  }

  /* ---------- 迷你趋势线（客户卡片） ---------- */
  function sparkline(container, data, color){
    const W = 74, H = 30, pad = 2;
    const max = Math.max(...data, 1), min = Math.min(...data, 0);
    const x = i => pad + i * (W-2*pad) / (data.length-1);
    const y = v => pad + (H-2*pad) - (v-min)/(max-min || 1) * (H-2*pad);
    const pts = data.map((v,i)=>[x(i),y(v)]);
    const d = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
    const active = data[data.length-1] > 0;
    const stroke = color || (active ? '#D4A017' : '#C9BFA6');
    container.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
         <path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
         <circle cx="${pts[pts.length-1][0]}" cy="${pts[pts.length-1][1]}" r="2.6"
           fill="${active?'#fff':'#E4DCCB'}" stroke="${stroke}" stroke-width="1.6"/>
       </svg>`;
  }

  /* ---------- 客户详情大图（柱状趋势） ---------- */
  function barTrend(container, data, labels){
    const W = container.clientWidth || 287, H = 110, padB = 18;
    const max = Math.max(...data, 1) * 1.15;
    const gap = 14, bw = (W - gap*(data.length-1)) / data.length;
    let bars = '';
    data.forEach((v,i)=>{
      const h = Math.max(2, v/max*(H-padB-6));
      const x = i*(bw+gap), y = H-padB-h;
      const isLast = i === data.length-1;
      bars += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3"
        fill="${v===0?'#E8E1D0':(isLast?'url(#barG)':'#E2C26B')}"/>`;
      bars += `<text x="${x+bw/2}" y="${H-5}" text-anchor="middle" font-size="9" fill="#A89B7C">${labels[i]}</text>`;
    });
    container.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
        <defs><linearGradient id="barG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#E6BE4E"/><stop offset="1" stop-color="#B8860B"/>
        </linearGradient></defs>${bars}
      </svg>`;
  }

  /* ---------- 环形健康分 ---------- */
  function gauge(container, value){
    const R = 46, C = 2*Math.PI*R;
    const dash = (value/100*C).toFixed(1);
    container.innerHTML =
      `<svg viewBox="0 0 116 116" width="108" height="108">
        <circle cx="58" cy="58" r="${R}" fill="none" stroke="#F0EBDE" stroke-width="9"/>
        <circle cx="58" cy="58" r="${R}" fill="none" stroke="url(#gg)" stroke-width="9"
          stroke-linecap="round" stroke-dasharray="${dash} ${C}"
          transform="rotate(-90 58 58)"/>
        <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#E6BE4E"/><stop offset="1" stop-color="#B8860B"/>
        </linearGradient></defs>
        <g class="gauge-score">
        </g>
      </svg>
      <div class="gauge-score"><b>${value}</b><span>健康分 / 100</span></div>`;
  }

  return { lineChart, sparkline, barTrend, gauge };
})();
