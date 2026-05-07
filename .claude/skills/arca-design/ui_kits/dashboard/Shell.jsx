function Sidebar({ active, onNav }) {
  const NAV_MAIN = [
    { id:'inicio',   icon: I.home,     label:'Inicio',        count: null },
    { id:'clientes', icon: I.users,    label:'Clientes',      count: 47 },
    { id:'vencim',   icon: I.clock,    label:'Vencimientos',  count: 12 },
    { id:'present',  icon: I.fileText, label:'Presentaciones',count: 8  },
    { id:'factur',   icon: I.dollar,   label:'Facturación',   count: null },
    { id:'calend',   icon: I.cal,      label:'Calendario',    count: null },
  ];
  const NAV_SEC = [
    { id:'reportes', icon: I.trend,    label:'Reportes' },
    { id:'config',   icon: I.settings, label:'Configuración' },
  ];

  const Item = ({ item }) => {
    const [h, setH] = React.useState(false);
    const on = active === item.id;
    return <button onClick={()=>onNav(item.id)} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
      width:'100%', display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
      borderRadius:'var(--r-md)', border:0, cursor:'pointer', fontFamily:'var(--ff-sans)',
      background: on ? 'var(--surface)' : (h ? 'rgba(255,255,255,0.035)' : 'transparent'),
      color: on ? 'var(--ink)' : 'rgba(247,246,242,0.85)',
      fontSize: 13, fontWeight: on ? 500 : 400, textAlign:'left',
      boxShadow: on ? '0 1px 2px rgba(0,0,0,0.05), inset 0 0 0 1px rgba(255,255,255,0.04)' : 'none',
      transition:'background 120ms',
    }}>
      <span style={{ display:'inline-flex', width:15, color: on ? 'var(--ink-2)' : 'rgba(247,246,242,0.7)' }}>{item.icon()}</span>
      <span style={{ flex:1 }}>{item.label}</span>
      {item.count != null && <span style={{
        fontSize:10.5, padding:'1px 6px', borderRadius:9, fontWeight:600,
        background: on ? 'var(--surface-2)' : 'rgba(255,255,255,0.08)',
        color: on ? 'var(--ink-3)' : 'rgba(247,246,242,0.7)',
      }}>{item.count}</span>}
    </button>;
  };

  return <aside style={{
    width:240, minWidth:240, background:'var(--navy-900)', color:'rgba(247,246,242,0.85)',
    display:'flex', flexDirection:'column', padding:'16px 12px', gap:18, fontFamily:'var(--ff-sans)',
  }}>
    {/* Workspace */}
    <button style={{
      display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:'var(--r-md)',
      background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)',
      color:'inherit', cursor:'pointer', width:'100%', textAlign:'left',
    }}>
      <Avatar kind="workspace" initials="EC"/>
      <span style={{ flex:1, display:'flex', flexDirection:'column', lineHeight:1.2 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'#F7F6F2' }}>Estudio Contable</span>
        <span style={{ fontSize:11, color:'rgba(247,246,242,0.55)' }}>Plan Pro · 12 miembros</span>
      </span>
      <span style={{ color:'rgba(247,246,242,0.5)' }}>{I.chevUpDown()}</span>
    </button>
    {/* Search */}
    <div style={{
      display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:'var(--r-md)',
      background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', fontSize:12.5,
      color:'rgba(247,246,242,0.55)',
    }}>
      <span style={{ color:'rgba(247,246,242,0.55)' }}>{I.search()}</span>
      <span style={{ flex:1 }}>Buscar cliente, CUIT, factura…</span>
      <kbd style={{
        fontFamily:'var(--ff-mono)', fontSize:10.5, padding:'1px 5px', borderRadius:4,
        background:'rgba(0,0,0,0.25)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(247,246,242,0.6)',
      }}>⌘K</kbd>
    </div>
    {/* Nav main */}
    <nav style={{ display:'flex', flexDirection:'column', gap:1 }}>
      <div style={{ fontSize:10.5, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(247,246,242,0.4)', padding:'4px 10px 6px' }}>Workspace</div>
      {NAV_MAIN.map(i => <Item key={i.id} item={i}/>)}
    </nav>
    {/* Nav secondary */}
    <nav style={{ display:'flex', flexDirection:'column', gap:1 }}>
      <div style={{ fontSize:10.5, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(247,246,242,0.4)', padding:'4px 10px 6px' }}>Cuenta</div>
      {NAV_SEC.map(i => <Item key={i.id} item={i}/>)}
    </nav>
    <div style={{ flex:1 }}/>
    {/* Footer user */}
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'8px 8px', borderRadius:'var(--r-md)',
      background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)',
    }}>
      <Avatar kind="user" initials="MA"/>
      <span style={{ flex:1, display:'flex', flexDirection:'column', lineHeight:1.2 }}>
        <span style={{ fontSize:12.5, fontWeight:500, color:'#F7F6F2' }}>María Alvarez</span>
        <span style={{ fontSize:10.5, color:'rgba(247,246,242,0.5)' }}>Contadora · Admin</span>
      </span>
      <span style={{ color:'rgba(247,246,242,0.5)' }}>{I.more(13)}</span>
    </div>
  </aside>;
}

function Topbar({ period, setPeriod }) {
  return <header style={{
    display:'flex', alignItems:'center', gap:16, padding:'18px 28px 16px',
    borderBottom:'1px solid var(--border)', background:'var(--bg)', position:'sticky', top:0, zIndex:5,
  }}>
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <h1 style={{ margin:0, font:'var(--font-h1)', color:'var(--ink)' }}>Inicio</h1>
        <span style={{ fontSize:11, color:'var(--ink-4)', fontFamily:'var(--ff-mono)' }}>abr 2026</span>
      </div>
      <p style={{ margin:0, font:'var(--font-sub)', color:'var(--ink-3)' }}>
        Resumen del estudio · última actualización <span style={{ fontFamily:'var(--ff-mono)' }}>hace 4 min</span>
      </p>
    </div>
    <div style={{ flex:1 }}/>
    <TabBar tabs={['Hoy','7d','30d','90d','YTD']} active={period} onChange={setPeriod}/>
    <Button small><span style={{ color:'var(--ink-3)' }}>{I.filter()}</span> Filtros</Button>
    <Button small><span style={{ color:'var(--ink-3)' }}>{I.download()}</span> Exportar</Button>
    <Button primary><span style={{ display:'inline-flex' }}>{I.plus()}</span> Nueva presentación</Button>
    <IconButton title="Notificaciones" dot>{I.bell()}</IconButton>
  </header>;
}

function AppShell({ children }) {
  const [active, setActive] = React.useState('inicio');
  return <div style={{
    display:'flex', minHeight:'100vh', background:'var(--bg)', color:'var(--ink)', fontFamily:'var(--ff-sans)',
  }}>
    <Sidebar active={active} onNav={setActive}/>
    <main style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>{children}</main>
  </div>;
}

Object.assign(window, { Sidebar, Topbar, AppShell });
