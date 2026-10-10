import React, { useMemo, useState, useRef, useCallback } from 'react';

/* ─────────────────────────────── constants ─────────────────────────── */
const NW = 210;   // node width
const NH = 108;   // node height
const H_GAP = 300; // horizontal gap between columns
const V_GAP = 160; // vertical gap between rows
const PAD = 80;    // canvas padding

const PRIORITY = {
  Critical: { edge: '#ef4444', head: '#ef4444', pill: '#fef2f2', pillText: '#b91c1c', stripe: '#ef4444' },
  High:     { edge: '#f97316', head: '#f97316', pill: '#fff7ed', pillText: '#c2410c', stripe: '#f97316' },
  Medium:   { edge: '#6366f1', head: '#6366f1', pill: '#eef2ff', pillText: '#4338ca', stripe: '#6366f1' },
  Low:      { edge: '#22c55e', head: '#22c55e', pill: '#f0fdf4', pillText: '#166534', stripe: '#22c55e' },
};

const STATUS = {
  'Completed':   { bg: '#ecfdf5', border: '#10b981', text: '#065f46', badge: '#10b981' },
  'In Progress': { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', badge: '#3b82f6' },
  'In Review':   { bg: '#f5f3ff', border: '#8b5cf6', text: '#4c1d95', badge: '#8b5cf6' },
  'Pending':     { bg: '#f8fafc', border: '#94a3b8', text: '#334155', badge: '#94a3b8' },
};

const pStyle  = (p) => PRIORITY[p]  || PRIORITY.Medium;
const sStyle  = (s) => STATUS[s]    || STATUS.Pending;
const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return String(d);
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return String(d);
  }
};

/* ─────────────────────── layout engine ────────────────────────────── */
function buildLayout(tasks) {
  if (!tasks || tasks.length === 0)
    return { nodes: [], edges: [], W: 800, H: 500 };

  const getCanonicalId = (t) => t.taskId || t.id || (t._id ? String(t._id) : `task-${Math.random()}`);

  // Canonical task lookup
  const taskById = new Map();
  tasks.forEach((t) => {
    const cid = getCanonicalId(t);
    taskById.set(cid, t);
    if (t.taskId) taskById.set(t.taskId, t);
    if (t.id) taskById.set(t.id, t);
    if (t._id) taskById.set(String(t._id), t);
  });

  // parent / children maps keyed by canonical ID
  const parents = new Map(tasks.map((t) => [getCanonicalId(t), []]));
  const children = new Map(tasks.map((t) => [getCanonicalId(t), []]));

  tasks.forEach((t) => {
    const tid = getCanonicalId(t);
    if (t.dependency && t.dependency !== 'None') {
      const depStr = String(t.dependency);
      const parentTask = taskById.get(depStr);
      const parentId = parentTask ? getCanonicalId(parentTask) : depStr;
      if (parents.has(tid)) parents.get(tid).push(parentId);
      if (children.has(parentId)) children.get(parentId).push(tid);
    }
  });

  // topological column (depth)
  const col = new Map();
  const getCol = (id) => {
    if (col.has(id)) return col.get(id);
    const ps = parents.get(id) || [];
    const c = ps.length === 0 ? 0 : Math.max(...ps.map(getCol)) + 1;
    col.set(id, c);
    return c;
  };
  tasks.forEach((t) => getCol(getCanonicalId(t)));

  // group by column
  const colBuckets = new Map();
  tasks.forEach((t) => {
    const tid = getCanonicalId(t);
    const c = col.get(tid) || 0;
    if (!colBuckets.has(c)) colBuckets.set(c, []);
    colBuckets.get(c).push(t);
  });

  // assign x / y positions
  const pos = new Map();
  [...colBuckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([c, bucket]) => {
      bucket.forEach((t, i) => {
        const tid = getCanonicalId(t);
        pos.set(tid, {
          x: PAD + c * (NW + H_GAP),
          y: PAD + i * (NH + V_GAP),
        });
      });
    });

  const nodes = tasks
    .map((t) => {
      const tid = getCanonicalId(t);
      return { task: t, cid: tid, ...pos.get(tid) };
    })
    .filter((n) => n.x !== undefined);

  const nodeMap = new Map(nodes.map((n) => [n.cid, n]));

  // edges — source → target direction
  const edges = [];
  nodes.forEach((n) => {
    if (n.task.dependency && n.task.dependency !== 'None') {
      const depStr = String(n.task.dependency);
      const parentTask = taskById.get(depStr);
      const parentId = parentTask ? getCanonicalId(parentTask) : depStr;
      const src = nodeMap.get(parentId);
      if (src && src.cid !== n.cid) {
        edges.push({ src, tgt: n });
      }
    }
  });

  const W = Math.max(...nodes.map((n) => n.x), 0) + NW + PAD;
  const H = Math.max(...nodes.map((n) => n.y), 0) + NH + PAD;
  return { nodes, edges, W: Math.max(W, 800), H: Math.max(H, 500) };
}

/* ─────────────────────── edge path helpers ─────────────────────────── */
// Returns a cubic bezier leaving the RIGHT side of src and entering the LEFT side of tgt
function edgePath(src, tgt) {
  const x1 = src.x + NW;     const y1 = src.y + NH / 2;
  const x2 = tgt.x;          const y2 = tgt.y + NH / 2;
  const cx  = (x1 + x2) / 2;
  // If same column or backward edge → route via elbow
  return `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
}

function edgeMidpoint(src, tgt) {
  // Bezier midpoint approximation t=0.5
  const x1 = src.x + NW; const y1 = src.y + NH / 2;
  const x2 = tgt.x;      const y2 = tgt.y + NH / 2;
  const cx = (x1 + x2) / 2;
  // cubic bezier at t=0.5
  const mx = 0.125*x1 + 0.375*cx + 0.375*cx + 0.125*x2;
  const my = 0.125*y1 + 0.375*y1 + 0.375*y2 + 0.125*y2;
  return { mx, my };
}

/* ═══════════════════════════ COMPONENT ═══════════════════════════════ */
export default function DependencyGraphView({ tasks }) {
  const [hovered, setHovered]     = useState(null);
  const [selected, setSelected]   = useState(null);

  const { nodes, edges, W, H } = useMemo(() => buildLayout(tasks), [tasks]);

  if (!tasks || tasks.length === 0) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b', fontFamily: 'Inter, sans-serif', fontSize: '0.95rem' }}>
        No tasks to visualize — create tasks and add dependencies first.
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem 2rem', fontFamily: "'Inter', system-ui, sans-serif", background: '#f8fafc', minHeight: '100%' }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Dependency Graph
        </h1>
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
          Directed flow: <strong>source → dependent task</strong>. Arrows carry priority, developer &amp; deadline labels.
        </p>
      </div>

      {/* ── LEGEND ROW ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2rem', marginBottom: '1.25rem', alignItems: 'center' }}>

        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priority →</span>
          {Object.entries(PRIORITY).map(([p, c]) => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <svg width="28" height="14">
                <defs>
                  <marker id={'leg-' + p} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                    <polygon points="0 0, 5 2.5, 0 5" fill={c.edge} />
                  </marker>
                </defs>
                <line x1="2" y1="7" x2="20" y2="7" stroke={c.edge} strokeWidth="2.5" markerEnd={'url(#leg-' + p + ')'} />
              </svg>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: c.pillText }}>{p}</span>
            </div>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: '#e2e8f0' }} />

        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status →</span>
          {Object.entries(STATUS).map(([s, c]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: c.bg, border: '2px solid ' + c.border }} />
              <span style={{ fontSize: '0.73rem', fontWeight: 600, color: c.text }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── CANVAS ── */}
      <div style={{
        overflow: 'auto',
        borderRadius: '1rem',
        border: '1px solid #e2e8f0',
        background: 'radial-gradient(ellipse at 20% 20%, #f0f4ff 0%, #f8fafc 60%)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        position: 'relative',
      }}>
        <svg
          width={W}
          height={H}
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            {/* Arrowhead markers per priority — large and clear */}
            {Object.entries(PRIORITY).map(([p, c]) => (
              <React.Fragment key={p}>
                {/* normal arrowhead */}
                <marker
                  id={'ah-' + p}
                  markerWidth="10" markerHeight="10"
                  refX="9" refY="5"
                  orient="auto"
                >
                  <polygon points="0 1, 10 5, 0 9" fill={c.head} />
                </marker>
                {/* hovered arrowhead (larger) */}
                <marker
                  id={'ah-' + p + '-h'}
                  markerWidth="12" markerHeight="12"
                  refX="11" refY="6"
                  orient="auto"
                >
                  <polygon points="0 1, 12 6, 0 11" fill={c.head} />
                </marker>
              </React.Fragment>
            ))}

            {/* Dot at source */}
            <marker id="dot-src" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <circle cx="4" cy="4" r="3.5" fill="white" stroke="#64748b" strokeWidth="1.5" />
            </marker>

            {/* Animated flow gradient per priority */}
            {Object.entries(PRIORITY).map(([p, c]) => (
              <linearGradient key={p} id={'grad-' + p} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor={c.edge} stopOpacity="0.4" />
                <stop offset="50%"  stopColor={c.edge} stopOpacity="1"   />
                <stop offset="100%" stopColor={c.edge} stopOpacity="0.4" />
              </linearGradient>
            ))}

            {/* Subtle grid pattern */}
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
            </pattern>
          </defs>

          {/* Grid background */}
          <rect width={W} height={H} fill="url(#grid)" />

          {/* ── EDGES ── */}
          {edges.map((e, i) => {
            const priority = e.tgt.task.priority || 'Medium';
            const pc       = pStyle(priority);
            const isHov    = hovered === i;
            const isSel    = selected === i;
            const active   = isHov || isSel;

            const d  = edgePath(e.src, e.tgt);
            const { mx, my } = edgeMidpoint(e.src, e.tgt);

            const dev =
              e.tgt.task.assigneeName ||
              (typeof e.tgt.task.assignee === 'string' ? e.tgt.task.assignee : e.tgt.task.assignee?.name) ||
              e.src.task.assigneeName ||
              '—';
            const ts = fmtDate(
              e.tgt.task.dueDate || e.tgt.task.deadline || e.tgt.task.createdAt || e.tgt.task.startDate
            );

            // label box dims
            const LW = 130;
            const LH = 58;
            const lx = mx - LW / 2;
            const ly = my - LH / 2;

            return (
              <g
                key={i}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(selected === i ? null : i)}
              >
                {/* ── invisible wide hit-zone ── */}
                <path d={d} fill="none" stroke="transparent" strokeWidth="22" />

                {/* ── glow behind edge when active ── */}
                {active && (
                  <path
                    d={d}
                    fill="none"
                    stroke={pc.edge}
                    strokeWidth="8"
                    strokeOpacity="0.18"
                    strokeLinecap="round"
                  />
                )}

                {/* ── source circle dot ── */}
                <circle
                  cx={e.src.x + NW}
                  cy={e.src.y + NH / 2}
                  r={active ? 5 : 4}
                  fill={pc.edge}
                  strokeWidth="2"
                  stroke="white"
                  style={{ transition: 'r 0.15s' }}
                />

                {/* ── main directed arrow ── */}
                <path
                  d={d}
                  fill="none"
                  stroke={pc.edge}
                  strokeWidth={active ? 3.5 : 2.5}
                  strokeLinecap="round"
                  markerEnd={'url(#ah-' + priority + (active ? '-h' : '') + ')'}
                  style={{ transition: 'stroke-width 0.15s' }}
                />

                {/* ── animated flow dashes on top ── */}
                <path
                  d={d}
                  fill="none"
                  stroke={pc.edge}
                  strokeWidth={active ? 2.5 : 1.5}
                  strokeLinecap="round"
                  strokeDasharray="10 18"
                  strokeOpacity={active ? 0.9 : 0.5}
                  style={{ transition: 'stroke-width 0.15s, stroke-opacity 0.15s' }}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="28"
                    to="0"
                    dur="0.9s"
                    repeatCount="indefinite"
                  />
                </path>

                {/* ── EDGE LABEL BOX ── */}
                <g>
                  {/* shadow rect */}
                  <rect
                    x={lx + 2}
                    y={ly + 2}
                    width={LW}
                    height={LH}
                    rx={8}
                    fill="rgba(0,0,0,0.08)"
                  />
                  {/* main box */}
                  <rect
                    x={lx}
                    y={ly}
                    width={LW}
                    height={LH}
                    rx={8}
                    fill={active ? '#ffffff' : pc.pill}
                    stroke={pc.edge}
                    strokeWidth={active ? 2 : 1.5}
                  />
                  {/* priority stripe top */}
                  <rect x={lx} y={ly} width={LW} height={5} rx={8} fill={pc.edge} />
                  <rect x={lx} y={ly + 3} width={LW} height={2} fill={pc.edge} />

                  {/* Priority row */}
                  <text
                    x={lx + 10}
                    y={ly + 22}
                    fontSize="10.5"
                    fontFamily="Inter, sans-serif"
                    fontWeight="700"
                    fill={pc.pillText}
                  >
                    {'⚡ ' + priority}
                  </text>

                  {/* Developer row */}
                  <text
                    x={lx + 10}
                    y={ly + 38}
                    fontSize="10"
                    fontFamily="Inter, sans-serif"
                    fontWeight="600"
                    fill="#334155"
                  >
                    {'👤 ' + dev.slice(0, 16)}
                  </text>

                  {/* Timestamp row */}
                  <text
                    x={lx + 10}
                    y={ly + 52}
                    fontSize="9.5"
                    fontFamily="Inter, sans-serif"
                    fontWeight="500"
                    fill="#64748b"
                  >
                    {'📅 ' + ts}
                  </text>
                </g>
              </g>
            );
          })}

          {/* ── NODES ── */}
          {nodes.map(n => {
            const sc   = sStyle(n.task.status);
            const pc   = pStyle(n.task.priority || 'Medium');
            const isSel = selected !== null &&
              (edges[selected]?.src.task.taskId === n.task.taskId ||
               edges[selected]?.tgt.task.taskId === n.task.taskId);

            return (
              <g key={n.task.taskId} transform={'translate(' + n.x + ',' + n.y + ')'}>

                {/* selection glow */}
                {isSel && (
                  <rect
                    x={-4} y={-4}
                    width={NW + 8} height={NH + 8}
                    rx={14}
                    fill="none"
                    stroke={sc.border}
                    strokeWidth="3"
                    strokeOpacity="0.5"
                  />
                )}

                {/* card shadow */}
                <rect
                  x={3} y={4}
                  width={NW} height={NH}
                  rx={12}
                  fill="rgba(0,0,0,0.07)"
                />

                {/* card body */}
                <rect
                  width={NW}
                  height={NH}
                  rx={12}
                  fill={sc.bg}
                  stroke={sc.border}
                  strokeWidth={isSel ? 2.5 : 1.5}
                />

                {/* priority stripe — left edge */}
                <rect x={0} y={12} width={5} height={NH - 24} rx={3} fill={pc.edge} />

                {/* status badge — top right */}
                <rect x={NW - 72} y={8} width={66} height={18} rx={5} fill={sc.badge} />
                <text
                  x={NW - 39}
                  y={21}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="Inter, sans-serif"
                  fontWeight="700"
                  fill="#ffffff"
                >
                  {(n.task.status || 'Pending').toUpperCase()}
                </text>

                {/* task ID */}
                <rect x={10} y={8} width={50} height={18} rx={5} fill="rgba(255,255,255,0.8)" stroke={sc.border} strokeWidth="1" />
                <text
                  x={35}
                  y={21}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontFamily="'Courier New', monospace"
                  fontWeight="700"
                  fill={sc.text}
                >
                  {n.task.taskId}
                </text>

                {/* task title */}
                <foreignObject x={12} y={32} width={NW - 24} height={42}>
                  <div
                    xmlns="http://www.w3.org/1999/xhtml"
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: sc.text,
                      lineHeight: 1.35,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-word',
                    }}
                  >
                    {n.task.title}
                  </div>
                </foreignObject>

                {/* developer footer */}
                <rect x={10} y={78} width={NW - 20} height={22} rx={5} fill="rgba(255,255,255,0.55)" />
                <text
                  x={18}
                  y={93}
                  fontSize="9.5"
                  fontFamily="Inter, sans-serif"
                  fontWeight="600"
                  fill={sc.text}
                >
                  {'👤 ' + (n.task.assigneeName || '—').slice(0, 24)}
                </text>

              </g>
            );
          })}
        </svg>
      </div>

      {/* ── FOOTER HINT ── */}
      <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>
        Click any arrow to highlight its connected tasks &nbsp;·&nbsp; Hover to inspect the edge label
      </p>
    </div>
  );
}
