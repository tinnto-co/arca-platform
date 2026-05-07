function KpiCard({ title, value, delta, deltaKind, sub, sparkColor, sparkPath, sparkArea, gradId, primary }) {
  const [h, setH] = React.useState(false);
  return <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
    position:'relative', padding:'16px 18px 16px', borderRadius:'var(--r-lg)',
    background: primary ? 'var(--ink)' : 'var(--surface)',
    color: primary ? '#F7F6F2' : 'var(--ink)',
    border: primary ? '1px solid var(--ink)' : '1px solid var(--border)',
    boxShadow: h ? 'var(--shadow-md)' : 'var(--shadow-sm)',
    transition:'box-shadow 160ms, transform 160ms',
    transform: h ? 'translateY(-1px)' : 'none',
    display:'flex', flexDirection:'column', gap:6, minHeight:130, overflow:'hidden',
  }}>
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{
        fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase',
        color: primary ? 'rgba(247,246,242,0.6)' : 'var(--ink-4)', fontWeight:500,
      }}>{title}</span>
      {delta && <Delta kind={deltaKind}>{delta}</Delta>}
    </div>
    <div style={{
      font:'var(--font-kpi)', color: primary ? '#F7F6F2' : 'var(--ink)',
      fontVariantNumeric:'tabular-nums',
    }}>{value}</div>
    <div style={{ fontSize:12, color: primary ? 'rgba(247,246,242,0.55)' : 'var(--ink-4)' }}>{sub}</div>
    <Sparkline path={sparkPath} area={sparkArea} color={sparkColor} gradId={gradId}/>
  </div>;
}

function MiniKpi({ title, value, delta, deltaKind, progressKind, progressPct }) {
  const [h, setH] = React.useState(false);
  return <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
    padding:'14px 16px 14px', borderRadius:'var(--r-lg)', background:'var(--surface)',
    border:'1px solid var(--border)',
    boxShadow: h ? 'var(--shadow-md)' : 'var(--shadow-sm)',
    transition:'box-shadow 160ms, transform 160ms',
    transform: h ? 'translateY(-1px)' : 'none',
    display:'flex', flexDirection:'column', gap:8, minHeight:130,
  }}>
    <span style={{ fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--ink-4)', fontWeight:500 }}>{title}</span>
    <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:8 }}>
      <div style={{ font:'var(--font-kpi)', color:'var(--ink)', fontVariantNumeric:'tabular-nums' }}>{value}</div>
      {delta && <Delta kind={deltaKind}>{delta}</Delta>}
    </div>
    <ProgressBar kind={progressKind} pct={progressPct}/>
  </div>;
}

Object.assign(window, { KpiCard, MiniKpi });
