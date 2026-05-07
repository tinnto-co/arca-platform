function EvolucionChart() {
  const [tab, setTab] = React.useState('Mensual');
  const [hover, setHover] = React.useState(null);
  const w = 680, h = 210, pad = { l: 40, r: 16, t: 16, b: 26 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const pts = CHART_POINTS.map((v, i) => ({
    x: pad.l + (i / (CHART_POINTS.length - 1)) * plotW,
    y: pad.t + (1 - v) * plotH,
    v, label: CHART_LABELS[i],
  }));
  const linePath = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length-1].x} ${pad.t+plotH} L ${pts[0].x} ${pad.t+plotH} Z`;

  return <div style={{
    background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)',
    padding:'16px 16px 10px', boxShadow:'var(--shadow-sm)', display:'flex', flexDirection:'column', gap:12,
  }}>
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <div style={{ flex:1 }}>
        <div style={{ font:'var(--font-card-title)', color:'var(--ink)' }}>Evolución de presentaciones</div>
        <div style={{ fontSize:11.5, color:'var(--ink-4)', marginTop:2 }}>Últimos 12 meses · total 1.284</div>
      </div>
      <Chip swatch="var(--chart-1)">Presentadas</Chip>
      <Chip swatch="var(--chart-3)">Pendientes</Chip>
      <TabBar tabs={['Mensual','Trimestral','Anual']} active={tab} onChange={setTab}/>
    </div>
    <div style={{ position:'relative' }}
         onMouseLeave={()=>setHover(null)}
         onMouseMove={(e)=>{
           const r = e.currentTarget.getBoundingClientRect();
           const x = ((e.clientX - r.left) / r.width) * w;
           let best = 0, bd = Infinity;
           pts.forEach((p, i) => { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = i; }});
           setHover(best);
         }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width:'100%', height: h, display:'block' }}>
        <defs>
          <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="var(--chart-1)" stopOpacity="0.18"/>
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* gridlines */}
        {[0,0.25,0.5,0.75,1].map((t,i)=>(
          <line key={i} x1={pad.l} x2={w-pad.r} y1={pad.t+t*plotH} y2={pad.t+t*plotH}
                stroke="var(--border)" strokeDasharray="2 4"/>
        ))}
        {/* y labels */}
        {[1,0.5,0].map((t,i)=>{
          const vals = ['1.200','600','0'];
          return <text key={i} x={pad.l-8} y={pad.t+(1-t)*plotH+3} textAnchor="end"
                       fontSize="10" fill="var(--ink-4)" fontFamily="var(--ff-mono)">{vals[i]}</text>;
        })}
        {/* x labels */}
        {pts.map((p,i)=>(
          <text key={i} x={p.x} y={h-8} textAnchor="middle" fontSize="10" fill="var(--ink-4)" fontFamily="var(--ff-mono)">{p.label}</text>
        ))}
        <path d={areaPath} fill="url(#chartArea)"/>
        <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth="1.75"/>
        {pts.map((p,i)=>(
          <circle key={i} cx={p.x} cy={p.y} r={hover===i?4:2.5}
                  fill="var(--chart-1)" stroke="var(--surface)" strokeWidth="1.5"/>
        ))}
        {hover!=null && (
          <g>
            <line x1={pts[hover].x} x2={pts[hover].x} y1={pad.t} y2={pad.t+plotH} stroke="var(--ink-4)" strokeDasharray="2 3"/>
          </g>
        )}
      </svg>
      {hover!=null && (
        <div style={{
          position:'absolute', left:`${(pts[hover].x / w)*100}%`, top: `${(pts[hover].y / h)*100}%`,
          transform:'translate(-50%, calc(-100% - 10px))',
          background:'var(--ink)', color:'#F7F6F2', padding:'6px 9px', borderRadius:8,
          fontSize:11, fontFamily:'var(--ff-mono)', whiteSpace:'nowrap', pointerEvents:'none',
          boxShadow:'var(--shadow-md)',
        }}>
          {pts[hover].label} 2026 · <b style={{ fontFamily:'var(--ff-sans)', fontWeight:600 }}>{Math.round(pts[hover].v*1200)}</b>
        </div>
      )}
    </div>
  </div>;
}

function FlujoCajaCard() {
  const max = Math.max(...CASH.flatMap(c => [c.in, c.out]));
  return <div style={{
    background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)',
    padding:'16px 18px 14px', boxShadow:'var(--shadow-sm)', display:'flex', flexDirection:'column', gap:14,
  }}>
    <div style={{ display:'flex', alignItems:'center' }}>
      <div style={{ flex:1 }}>
        <div style={{ font:'var(--font-card-title)', color:'var(--ink)' }}>Flujo de caja</div>
        <div style={{ fontSize:11.5, color:'var(--ink-4)', marginTop:2 }}>Ingresos vs egresos · 6 semanas</div>
      </div>
      <Delta kind="pos">+18,4 %</Delta>
    </div>
    <div style={{ display:'flex', alignItems:'flex-end', gap:10, height:120, paddingTop:4 }}>
      {CASH.map((c,i)=>(
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
          <div style={{ width:'100%', height:100, display:'flex', flexDirection:'column', justifyContent:'flex-end', gap:2 }}>
            <div style={{ height:`${(c.in/max)*100}%`, background:'var(--chart-2)', borderRadius:'3px 3px 0 0' }}/>
            <div style={{ height:`${(c.out/max)*60}%`, background:'var(--chart-4)', borderRadius:'0 0 3px 3px', opacity:.75 }}/>
          </div>
          <span style={{ fontSize:10, color:'var(--ink-4)', fontFamily:'var(--ff-mono)' }}>{c.label}</span>
        </div>
      ))}
    </div>
    <div style={{ display:'flex', gap:14, fontSize:11.5, color:'var(--ink-3)' }}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
        <span style={{ width:9, height:9, borderRadius:2, background:'var(--chart-2)' }}/>Ingresos
      </span>
      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
        <span style={{ width:9, height:9, borderRadius:2, background:'var(--chart-4)', opacity:.75 }}/>Egresos
      </span>
    </div>
  </div>;
}

Object.assign(window, { EvolucionChart, FlujoCajaCard });
