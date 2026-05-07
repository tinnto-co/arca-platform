// Icons — inline lucide-style strokes. All 24-grid, stroke 2 (plus stroke 2.2).
const I = {
  home: (s=15)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>,
  users: (s=15)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  bell: (s=15)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  clock: (s=15)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  fileText: (s=15)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>,
  dollar: (s=15)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  cal: (s=15)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  trend: (s=15)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-7"/></svg>,
  settings: (s=15)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  search: (s=13)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  plus: (s=14, sw=2.2)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  chevUpDown: (s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 9 12 5 16 9"/><polyline points="16 15 12 19 8 15"/></svg>,
  chevDown: (s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  download: (s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  filter: (s=13)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  barChart: (s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-7"/></svg>,
  cart: (s=12)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  activity: (s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  zap: (s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  check: (s=13)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  alert: (s=13)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  more: (s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
  upload: (s=13)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  msg: (s=13)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  trendUp: (s=10)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  trendDown: (s=10)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>,
  cashReg: (s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/></svg>,
  grid: (s=12)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/><path d="M9 9h6v6H9z"/></svg>,
};

// Button
function Button({ children, primary, small, style, onClick }) {
  const [h, setH] = React.useState(false);
  const pad = small ? '6px 10px' : '8px 14px';
  const fs = small ? 12 : 13;
  const bg = primary ? (h ? '#000' : 'var(--ink)') : (h ? 'var(--surface-2)' : 'var(--surface)');
  return <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
    display:'inline-flex', alignItems:'center', gap:6, padding: pad, borderRadius:'var(--r-md)',
    fontSize: fs, fontWeight: 500, fontFamily: 'var(--ff-sans)',
    border: `1px solid ${primary ? 'var(--ink)' : 'var(--border-strong)'}`,
    background: bg, color: primary ? '#fff' : 'var(--ink)', cursor:'pointer', transition:'background 120ms',
    ...style,
  }}>{children}</button>;
}

function IconButton({ children, dot, onClick, title }) {
  const [h, setH] = React.useState(false);
  return <button title={title} onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
    width:32, height:32, borderRadius:'var(--r-md)', border:'1px solid var(--border-strong)',
    background: h ? 'var(--surface-2)' : 'var(--surface)', color:'var(--ink-2)',
    display:'inline-flex', alignItems:'center', justifyContent:'center', position:'relative', cursor:'pointer',
    transition:'background 120ms',
  }}>
    {children}
    {dot && <span style={{ position:'absolute', top:6, right:6, width:7, height:7, borderRadius:'50%', background:'var(--accent-neg)', border:'1.5px solid var(--surface)' }}/>}
  </button>;
}

function Chip({ swatch, tone='neutral', children }) {
  const palette = {
    neutral: { bg:'var(--surface-2)', fg:'var(--ink-3)', bd:'var(--border)' },
    neg:     { bg:'var(--accent-neg-bg)', fg:'var(--accent-neg-fg)', bd:'transparent' },
    pos:     { bg:'var(--accent-pos-bg)', fg:'var(--accent-pos-fg)', bd:'transparent' },
  }[tone];
  return <span style={{
    display:'inline-flex', alignItems:'center', gap:5, padding:'3px 8px', borderRadius:20,
    background: palette.bg, border: `1px solid ${palette.bd}`, color: palette.fg,
    fontSize: 11, fontWeight: 500,
  }}>
    {swatch && <span style={{ width:7, height:7, borderRadius:'50%', background: swatch }}/>}
    {children}
  </span>;
}

function TabBar({ tabs, active, onChange }) {
  return <div style={{
    display:'inline-flex', background:'var(--surface-2)', border:'1px solid var(--border)',
    borderRadius:'var(--r-md)', padding:2, fontSize:12, fontWeight:500,
  }}>
    {tabs.map(t => {
      const on = t === active;
      return <button key={t} onClick={()=>onChange(t)} style={{
        padding:'4px 10px', borderRadius:6, color: on ? 'var(--ink)' : 'var(--ink-3)',
        background: on ? 'var(--surface)' : 'transparent',
        boxShadow: on ? 'var(--shadow-sm)' : 'none',
        border:0, cursor:'pointer', fontFamily:'var(--ff-sans)',
      }}>{t}</button>;
    })}
  </div>;
}

function StatusTag({ kind, children }) {
  const p = {
    ok:   { fg:'var(--accent-pos-fg)',  bg:'var(--accent-pos-bg)',  dot:'var(--accent-pos)'  },
    pend: { fg:'var(--accent-warn-fg)', bg:'var(--accent-warn-bg)', dot:'var(--accent-warn)' },
    late: { fg:'var(--accent-neg-fg)',  bg:'var(--accent-neg-bg)',  dot:'var(--accent-neg)'  },
  }[kind];
  return <span style={{
    display:'inline-flex', alignItems:'center', gap:5, padding:'2px 8px', borderRadius:20,
    fontSize:11, fontWeight:500, color:p.fg, background:p.bg,
  }}>
    <span style={{ width:6, height:6, borderRadius:'50%', background:p.dot }}/>
    {children}
  </span>;
}

function Delta({ kind, children }) {
  const p = {
    pos:  { fg:'var(--accent-pos-fg)',  bg:'var(--accent-pos-bg)' , ic: I.trendUp() },
    neg:  { fg:'var(--accent-neg-fg)',  bg:'var(--accent-neg-bg)',  ic: I.trendDown() },
    warn: { fg:'var(--accent-warn-fg)', bg:'var(--accent-warn-bg)', ic: null },
  }[kind];
  return <span style={{
    display:'inline-flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:20,
    fontSize:11.5, fontWeight:600, fontVariantNumeric:'tabular-nums',
    color:p.fg, background:p.bg,
  }}>{p.ic}{children}</span>;
}

function ProgressBar({ kind='info', pct }) {
  const c = {
    pos:'var(--accent-pos)', neg:'var(--accent-neg)',
    warn:'var(--accent-warn)', info:'var(--accent-info)', ink:'var(--ink)',
  }[kind];
  return <div style={{
    height:4, background:'var(--surface-2)', border:'1px solid var(--border)',
    borderRadius:2, overflow:'hidden',
  }}>
    <div style={{ height:'100%', width: `${pct}%`, background:c, borderRadius:2 }}/>
  </div>;
}

function Sparkline({ path, area, color, gradId }) {
  return <svg viewBox="0 0 90 34" preserveAspectRatio="none" style={{
    position:'absolute', right:16, bottom:14, height:34, width:90, opacity:.9, pointerEvents:'none',
  }}>
    <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity=".22"/>
      <stop offset="100%" stopColor={color} stopOpacity="0"/>
    </linearGradient></defs>
    <path d={area} fill={`url(#${gradId})`}/>
    <path d={path} fill="none" stroke={color} strokeWidth="1.5"/>
  </svg>;
}

function Avatar({ kind, initials='??', bg, size }) {
  if (kind === 'client') {
    return <div style={{
      width: size||28, height: size||28, borderRadius:7, background: bg||'#1E3460',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:10.5, fontWeight:700, color:'#fff', flexShrink:0, letterSpacing:'0.02em',
    }}>{initials}</div>;
  }
  if (kind === 'user') {
    return <div style={{
      width:30, height:30, borderRadius:'50%',
      background:'linear-gradient(135deg, #2A4680, #C2A878)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:11, fontWeight:700, color:'#F7F6F2', flexShrink:0,
    }}>{initials}</div>;
  }
  // workspace
  return <div style={{
    width:32, height:32, borderRadius:8,
    background:'linear-gradient(135deg, #F7F6F2, #E8E4D6)',
    color:'var(--navy-900)', display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:'var(--ff-display)', fontWeight:700, fontSize:13, letterSpacing:'-0.02em', flexShrink:0,
  }}>{initials}</div>;
}

Object.assign(window, { I, Button, IconButton, Chip, TabBar, StatusTag, Delta, ProgressBar, Sparkline, Avatar });
