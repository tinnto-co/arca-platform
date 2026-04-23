function ClientesTable() {
  const [hover, setHover] = React.useState(null);
  return <div style={{
    background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)',
    boxShadow:'var(--shadow-sm)', overflow:'hidden', display:'flex', flexDirection:'column',
  }}>
    <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1 }}>
        <div style={{ font:'var(--font-card-title)', color:'var(--ink)' }}>Clientes recientes</div>
        <div style={{ fontSize:11.5, color:'var(--ink-4)', marginTop:2 }}>Actualizado hoy · 47 activos</div>
      </div>
      <a href="#" style={{
        fontSize:12, fontWeight:500, color:'var(--ink-3)', textDecoration:'none',
        display:'inline-flex', alignItems:'center', gap:4,
      }}>Ver todos <span>→</span></a>
    </div>
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
      <thead>
        <tr style={{ background:'var(--surface-2)' }}>
          <th style={thStyle}>Cliente</th>
          <th style={thStyle}>CUIT</th>
          <th style={thStyle}>Estado</th>
          <th style={{...thStyle, textAlign:'right'}}>Facturado</th>
          <th style={{...thStyle, width:24}}></th>
        </tr>
      </thead>
      <tbody>
        {CLIENTS.map((c,i)=>(
          <tr key={i} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}
              style={{ background: hover===i ? 'var(--surface-2)' : 'transparent', cursor:'pointer' }}>
            <td style={tdStyle}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Avatar kind="client" initials={c.initials} bg={c.bg}/>
                <span style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>{c.name}</span>
              </div>
            </td>
            <td style={{...tdStyle, fontFamily:'var(--ff-mono)', fontSize:12, color:'var(--ink-3)'}}>{c.cuit}</td>
            <td style={tdStyle}><StatusTag kind={c.status}>{c.statusText}</StatusTag></td>
            <td style={{...tdStyle, textAlign:'right', fontFamily:'var(--ff-mono)', fontVariantNumeric:'tabular-nums', fontSize:13, color:'var(--ink)'}}>{c.amount}</td>
            <td style={{...tdStyle, color:'var(--ink-4)'}}>{I.more(14)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>;
}

const thStyle = {
  textAlign:'left', padding:'9px 18px', fontSize:10.5, letterSpacing:'0.06em', textTransform:'uppercase',
  color:'var(--ink-4)', fontWeight:500, borderBottom:'1px solid var(--border)', fontFamily:'var(--ff-sans)',
};
const tdStyle = {
  padding:'11px 18px', borderBottom:'1px solid var(--border)', verticalAlign:'middle',
};

function VencimientosList() {
  const [hover, setHover] = React.useState(null);
  return <div style={{
    background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)',
    boxShadow:'var(--shadow-sm)', display:'flex', flexDirection:'column',
  }}>
    <div style={{ padding:'14px 18px 10px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1 }}>
        <div style={{ font:'var(--font-card-title)', color:'var(--ink)' }}>Próximos vencimientos</div>
        <div style={{ fontSize:11.5, color:'var(--ink-4)', marginTop:2 }}>12 en los próximos 14 días</div>
      </div>
      <a href="#" style={{
        fontSize:12, fontWeight:500, color:'var(--ink-3)', textDecoration:'none',
      }}>Ver calendario →</a>
    </div>
    {VENCIMIENTOS.map((v,i)=>(
      <div key={i} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}
           style={{
             display:'flex', alignItems:'center', gap:14, padding:'12px 18px',
             borderBottom: i === VENCIMIENTOS.length-1 ? 'none' : '1px solid var(--border)',
             background: hover===i ? 'var(--surface-2)' : 'transparent', cursor:'pointer',
           }}>
        <div style={{
          width:46, height:50, borderRadius:'var(--r-sm)', flexShrink:0,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          background: v.urgent ? 'var(--accent-neg-bg)' : 'var(--surface-2)',
          border: `1px solid ${v.urgent ? 'transparent' : 'var(--border)'}`,
        }}>
          <span style={{
            font:'var(--font-due-day)',
            color: v.urgent ? 'var(--accent-neg-fg)' : 'var(--ink)',
            lineHeight:1, fontVariantNumeric:'tabular-nums',
          }}>{v.d}</span>
          <span style={{
            font:'var(--font-due-month)',
            color: v.urgent ? 'var(--accent-neg-fg)' : 'var(--ink-4)',
            marginTop:1,
          }}>{v.m}</span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>{v.label}</span>
            {v.urgent && <StatusTag kind="late">2 días</StatusTag>}
          </div>
          <div style={{ fontSize:11.5, color:'var(--ink-4)', marginTop:2 }}>{v.sub}</div>
        </div>
        <div style={{ fontFamily:'var(--ff-mono)', fontSize:12.5, fontVariantNumeric:'tabular-nums', color:'var(--ink-2)' }}>{v.amount}</div>
      </div>
    ))}
  </div>;
}

function ActividadFeed() {
  const [tab, setTab] = React.useState('Todo');
  const filtered = ACTIVIDAD.filter(a => {
    if (tab === 'Todo') return true;
    if (tab === 'Facturas') return a.type === 'upload';
    if (tab === 'Presentaciones') return a.type === 'check';
    if (tab === 'Alertas') return a.type === 'alert' || a.type === 'msg';
    return true;
  });

  const iconOf = (type) => ({
    upload: I.upload(), check: I.check(), alert: I.alert(), msg: I.msg(),
  }[type]);
  const toneBg = (tone) => ({
    pos:  'var(--accent-pos-bg)',
    neg:  'var(--accent-neg-bg)',
    warn: 'var(--accent-warn-bg)',
    info: 'oklch(94% 0.03 250)',
  }[tone]);
  const toneFg = (tone) => ({
    pos:'var(--accent-pos-fg)', neg:'var(--accent-neg-fg)', warn:'var(--accent-warn-fg)', info:'var(--accent-info)',
  }[tone]);

  return <div style={{
    background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)',
    boxShadow:'var(--shadow-sm)', display:'flex', flexDirection:'column',
  }}>
    <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
      <div style={{ flex:1 }}>
        <div style={{ font:'var(--font-card-title)', color:'var(--ink)' }}>Actividad reciente</div>
      </div>
      <TabBar tabs={['Todo','Facturas','Presentaciones','Alertas']} active={tab} onChange={setTab}/>
    </div>
    <div style={{ padding:'4px 0' }}>
      {filtered.length === 0 && (
        <div style={{ padding:'32px 18px', textAlign:'center', color:'var(--ink-4)', fontSize:12 }}>
          Sin actividad en esta categoría
        </div>
      )}
      {filtered.map((a,i)=>(
        <div key={i} style={{
          display:'flex', alignItems:'flex-start', gap:12, padding:'10px 18px',
        }}>
          <div style={{
            width:28, height:28, borderRadius:'var(--r-sm)', flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center',
            background: toneBg(a.tone), color: toneFg(a.tone),
          }}>{iconOf(a.type)}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, color:'var(--ink)', fontWeight:500 }}>{a.title}</div>
            <div style={{ fontSize:11.5, color:'var(--ink-4)', marginTop:2 }}>
              <span style={{ fontFamily:'var(--ff-mono)' }}>{a.meta}</span>
            </div>
          </div>
          <span style={{ fontSize:11, color:'var(--ink-4)', fontFamily:'var(--ff-mono)', whiteSpace:'nowrap' }}>{a.time}</span>
        </div>
      ))}
    </div>
  </div>;
}

Object.assign(window, { ClientesTable, VencimientosList, ActividadFeed });
