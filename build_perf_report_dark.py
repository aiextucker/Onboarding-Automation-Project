import json
from datetime import datetime

with open('/home/openclaw/.openclaw/workspace/perf_issues_full.json') as f:
    data = json.load(f)
with open('/home/openclaw/.openclaw/workspace/perf_issues_by_month.json') as f:
    by_month = json.load(f)

CATEGORIES = list(data.keys())
MONTHS = sorted(by_month.keys())

MONTH_LABELS = {
    '2025-09': 'Sep 2025',
    '2025-10': 'Oct 2025',
    '2025-11': 'Nov 2025',
    '2025-12': 'Dec 2025',
    '2026-01': 'Jan 2026',
    '2026-02': 'Feb 2026',
    '2026-03': 'Mar 2026*',
}

CAT_META = {
    'Login / Sign-in Failure':   {'icon': '🔐', 'color': 'red',    'fill': 'fill-red',    'badge': '', 'border': 'rgba(255,107,107,0.4)'},
    '403 / Access Denied Error': {'icon': '🚫', 'color': 'warn',   'fill': 'fill-warn',   'badge': 'warn', 'border': 'rgba(255,169,77,0.4)'},
    '500 / Server Error':        {'icon': '💥', 'color': 'red',    'fill': 'fill-red',    'badge': '', 'border': 'rgba(255,107,107,0.4)'},
    'Cache / Browser Issues':    {'icon': '🗑️', 'color': 'purple', 'fill': 'fill-purple', 'badge': 'purple', 'border': 'rgba(108,99,255,0.4)'},
    'Slow / Performance':        {'icon': '🐢', 'color': 'warn',   'fill': 'fill-warn',   'badge': 'warn', 'border': 'rgba(255,169,77,0.4)'},
    'Blank / Missing Views':     {'icon': '👻', 'color': 'purple', 'fill': 'fill-purple', 'badge': 'purple', 'border': 'rgba(108,99,255,0.4)'},
    'Session / Logout Issues':   {'icon': '⏏️', 'color': 'teal',  'fill': 'fill-teal',   'badge': 'teal', 'border': 'rgba(0,212,170,0.4)'},
    'Password Reset Issues':     {'icon': '🔑', 'color': 'warn',   'fill': 'fill-warn',   'badge': 'warn', 'border': 'rgba(255,169,77,0.4)'},
}

total_issues = sum(len(v) for v in data.values())
total_calls = len(set((i['title'], i['date']) for cat in data.values() for i in cat))

# Max count for bar chart scaling
max_count = max(len(v) for v in data.values())

# --- BAR CHART HTML ---
bar_items = ''
for cat in CATEGORIES:
    count = len(data[cat])
    meta = CAT_META[cat]
    pct = round((count / max_count) * 100)
    bar_items += f'''
    <div class="bar-item">
      <div class="bar-label">{meta["icon"]} {cat}</div>
      <div class="bar-track">
        <div class="bar-fill {meta["fill"]}" style="width:{pct}%">{count}</div>
      </div>
      <div class="bar-count">{count}</div>
    </div>'''

# --- MONTHLY TABLE ---
month_header_cells = ''.join(f'<th>{MONTH_LABELS.get(m,m)}</th>' for m in MONTHS)
table_rows = ''
for cat in CATEGORIES:
    meta = CAT_META[cat]
    total = len(data[cat])
    month_cells = ''
    for m in MONTHS:
        val = by_month[m].get(cat, 0)
        cls = 'hot' if val >= 10 else ('warm' if val >= 5 else '')
        month_cells += f'<td class="num {cls}">{val if val > 0 else "—"}</td>'
    table_rows += f'<tr><td class="cat-cell">{meta["icon"]} {cat}</td><td class="num total-num">{total}</td>{month_cells}</tr>'

# --- CATEGORY DETAIL SECTIONS ---
cat_sections = ''
for cat in CATEGORIES:
    items = data[cat]
    if not items:
        continue
    meta = CAT_META[cat]
    count = len(items)
    badge_class = f'cat-count-badge {meta["badge"]}'.strip()
    quote_class = f'call-quote {meta["badge"]}'.strip()
    
    sorted_items = sorted(items, key=lambda x: x['date'])
    
    # Show up to 20 call cards
    cards_html = ''
    shown = min(len(sorted_items), 20)
    for item in sorted_items[:shown]:
        quote = item['quote'].replace('<', '&lt;').replace('>', '&gt;')
        client = item['client'].replace('<', '&lt;').replace('>', '&gt;')
        organizer = item['organizer'].split('@')[0].replace('.', ' ').title()
        cards_html += f'''
        <div class="call-card">
          <div class="call-card-header">
            <div>
              <div class="call-title">{client}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:3px">Host: {organizer}</div>
            </div>
            <div class="call-date">{item["date"]}</div>
          </div>
          <div class="{quote_class}">"{quote[:280]}{"…" if len(quote) > 280 else ""}"</div>
        </div>'''
    
    remaining = len(sorted_items) - shown
    more_pill = f'<div style="text-align:center;margin-top:10px"><span class="more-pill">+ {remaining} more mentions not shown</span></div>' if remaining > 0 else ''
    
    # Monthly mini-breakdown
    month_pills = ''
    for m in MONTHS:
        val = by_month[m].get(cat, 0)
        if val > 0:
            month_pills += f'<span class="badge badge-{"warn" if val >= 5 else "red"}" style="font-size:11px">{MONTH_LABELS.get(m,m)}: {val}</span> '
    
    cat_sections += f'''
  <div class="section" id="cat-{cat.replace("/","").replace(" ","-").lower()}">
    <div class="section-label">Issue Category</div>
    <div class="cat-header">
      <span class="cat-icon">{meta["icon"]}</span>
      <span class="cat-title">{cat}</span>
      <span class="{badge_class}">{count} mentions</span>
    </div>
    <div class="section-divider"></div>
    <div style="margin-bottom:14px;display:flex;flex-wrap:wrap;gap:6px">{month_pills}</div>
    <div class="call-grid">
      {cards_html}
    </div>
    {more_pill}
  </div>'''

# --- KEY FINDINGS ---
findings = f'''
  <div class="finding-box critical">
    <h4>🔑 Password Resets are the #1 complaint</h4>
    <p><strong>128 mentions</strong> across the period — often the downstream symptom of a login or 403 failure. Customers are frequently sent reset emails as a workaround rather than a fix.</p>
  </div>
  <div class="finding-box" style="margin-top:14px">
    <h4>📈 Login failures + 403 errors worsened significantly Jan → Feb 2026</h4>
    <p>Login failures jumped from <strong>22 (Jan)</strong> to <strong>26 (Feb)</strong>, and 403 errors hit their peak at <strong>12 in Feb</strong>. This aligns with escalating customer-facing complaints during that window.</p>
  </div>
  <div class="finding-box" style="margin-top:14px">
    <h4>👻 Blank/Missing Views tripled from Q4 to Feb 2026</h4>
    <p>Only <strong>2–4/month</strong> in Sep–Dec, then <strong>10 in Jan</strong> and <strong>14 in Feb</strong>. A sharp acceleration suggesting a regression introduced in late Q4/early Q1.</p>
  </div>
  <div class="finding-box success" style="margin-top:14px">
    <h4>🗑️ Cache/incognito being used as a live workaround</h4>
    <p>Customers are actively being told to clear cache or go incognito on calls. This appears consistently across multiple clients and hosts — it's a band-aid, not a fix.</p>
  </div>
  <div class="finding-box" style="margin-top:14px">
    <h4>🐢 Performance issues are chronic, not spiky</h4>
    <p><strong>84 mentions</strong> spread evenly across all 7 months. This is not an incident — it's a systemic baseline problem affecting every cohort of clients throughout onboarding.</p>
  </div>'''

# Build nav pills
nav_pills = ''
for cat in CATEGORIES:
    meta = CAT_META[cat]
    count = len(data[cat])
    anchor = cat.replace('/','').replace(' ','-').lower()
    nav_pills += f'<a href="#{anchor}" style="text-decoration:none"><span class="badge badge-{"warn" if meta["badge"]=="warn" else "red" if not meta["badge"] else meta["badge"]}" style="cursor:pointer;padding:5px 12px;font-size:12px">{meta["icon"]} {cat} ({count})</span></a> '

html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rev.io PSA: Performance &amp; Access Issues — Full Analysis</title>
  <style>
    :root {{
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface2: #21253a;
      --accent: #6c63ff;
      --accent2: #00d4aa;
      --warn: #ffa94d;
      --danger: #ff6b6b;
      --muted: #7b7f9e;
      --text: #e8eaf6;
      --text-dim: #b0b4cc;
      --border: rgba(255,255,255,0.07);
      --radius: 14px;
      --radius-sm: 8px;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 15px;
      line-height: 1.65;
    }}

    /* HERO */
    .hero {{
      background: linear-gradient(135deg, #1a0a0a 0%, #2a1010 50%, #0f1117 100%);
      border-bottom: 1px solid var(--border);
      padding: 60px 24px 48px;
      text-align: center;
    }}
    .hero-eyebrow {{ font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--danger); margin-bottom: 16px; }}
    .hero h1 {{ font-size: clamp(24px, 5vw, 42px); font-weight: 800; line-height: 1.15; letter-spacing: -0.5px; margin-bottom: 14px; }}
    .hero h1 span {{ color: var(--danger); }}
    .hero-sub {{ font-size: clamp(14px, 2.5vw, 18px); color: var(--text-dim); max-width: 660px; margin: 0 auto 28px; font-style: italic; }}
    .hero-meta {{ display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }}
    .hero-tag {{ background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 5px 14px; font-size: 12px; color: var(--muted); }}

    /* LAYOUT */
    .content {{ max-width: 980px; margin: 0 auto; padding: 0 20px 80px; }}

    /* SECTIONS */
    .section {{ margin-top: 56px; }}
    .section-label {{ font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: var(--danger); margin-bottom: 8px; }}
    .section-title {{ font-size: clamp(18px, 3.5vw, 26px); font-weight: 700; margin-bottom: 4px; line-height: 1.25; }}
    .section-divider {{ width: 40px; height: 3px; background: linear-gradient(90deg, var(--danger), var(--warn)); border-radius: 2px; margin: 14px 0 24px; }}

    /* STAT CARDS */
    .stat-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 24px; }}
    .stat-card {{ background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px 16px; text-align: center; }}
    .stat-card.red {{ border-top: 3px solid var(--danger); }}
    .stat-card.warn {{ border-top: 3px solid var(--warn); }}
    .stat-card.purple {{ border-top: 3px solid var(--accent); }}
    .stat-card.teal {{ border-top: 3px solid var(--accent2); }}
    .stat-num {{ font-size: 36px; font-weight: 800; line-height: 1.1; margin-bottom: 4px; }}
    .stat-num.red {{ color: var(--danger); }}
    .stat-num.warn {{ color: var(--warn); }}
    .stat-num.purple {{ color: var(--accent); }}
    .stat-num.teal {{ color: var(--accent2); }}
    .stat-label {{ font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }}

    /* BAR CHART */
    .bar-list {{ display: flex; flex-direction: column; gap: 10px; }}
    .bar-item {{ display: flex; align-items: center; gap: 12px; }}
    .bar-label {{ width: 230px; font-size: 13px; color: var(--text-dim); flex-shrink: 0; text-align: right; }}
    .bar-track {{ flex: 1; background: rgba(255,255,255,0.05); border-radius: 6px; height: 28px; overflow: hidden; }}
    .bar-fill {{ height: 100%; border-radius: 6px; display: flex; align-items: center; padding-left: 10px; font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.9); min-width: 40px; white-space: nowrap; transition: width 0.6s ease; }}
    .bar-count {{ width: 40px; font-size: 13px; font-weight: 700; flex-shrink: 0; text-align: right; }}
    .fill-red {{ background: linear-gradient(90deg, var(--danger), #ff9090); }}
    .fill-warn {{ background: linear-gradient(90deg, var(--warn), #ffd090); color: #1a1d27 !important; }}
    .fill-purple {{ background: linear-gradient(90deg, var(--accent), #9c96ff); }}
    .fill-teal {{ background: linear-gradient(90deg, var(--accent2), #60e8cc); color: #1a1d27 !important; }}
    .fill-blue {{ background: linear-gradient(90deg, #4f9cf9, #7ab8ff); }}

    /* FINDING BOX */
    .finding-box {{ background: linear-gradient(135deg, rgba(255,107,107,0.08), rgba(255,169,77,0.06)); border: 1px solid rgba(255,107,107,0.25); border-radius: var(--radius); padding: 20px 24px; margin-top: 16px; }}
    .finding-box h4 {{ font-size: 15px; font-weight: 700; margin-bottom: 10px; color: var(--warn); }}
    .finding-box p {{ font-size: 14px; color: var(--text-dim); }}
    .finding-box p strong {{ color: var(--text); }}
    .finding-box.critical {{ background: linear-gradient(135deg, rgba(255,107,107,0.12), rgba(255,107,107,0.06)); border-color: rgba(255,107,107,0.4); }}
    .finding-box.critical h4 {{ color: var(--danger); }}
    .finding-box.success {{ background: linear-gradient(135deg, rgba(0,212,170,0.08), rgba(108,99,255,0.06)); border-color: rgba(0,212,170,0.25); }}
    .finding-box.success h4 {{ color: var(--accent2); }}

    /* MONTHLY TABLE */
    .month-table-wrap {{ overflow-x: auto; }}
    .month-table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
    .month-table th {{ background: var(--surface2); color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }}
    .month-table td {{ padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }}
    .month-table tr:hover td {{ background: rgba(255,255,255,0.02); }}
    .month-table .cat-cell {{ font-size: 13px; white-space: nowrap; }}
    .month-table .num {{ text-align: center; font-family: monospace; color: var(--muted); }}
    .month-table .num.hot {{ color: var(--danger); font-weight: 700; }}
    .month-table .num.warm {{ color: var(--warn); font-weight: 600; }}
    .month-table .total-num {{ color: var(--text); font-weight: 800; font-size: 15px; }}

    /* CAT HEADER */
    .cat-header {{ display: flex; align-items: center; gap: 14px; margin-bottom: 4px; flex-wrap: wrap; }}
    .cat-icon {{ font-size: 28px; }}
    .cat-title {{ font-size: 20px; font-weight: 800; color: var(--text); }}
    .cat-count-badge {{ background: rgba(255,107,107,0.15); color: var(--danger); border: 1px solid rgba(255,107,107,0.3); border-radius: 20px; padding: 4px 12px; font-size: 13px; font-weight: 700; }}
    .cat-count-badge.warn {{ background: rgba(255,169,77,0.15); color: var(--warn); border-color: rgba(255,169,77,0.3); }}
    .cat-count-badge.purple {{ background: rgba(108,99,255,0.15); color: var(--accent); border-color: rgba(108,99,255,0.3); }}
    .cat-count-badge.teal {{ background: rgba(0,212,170,0.15); color: var(--accent2); border-color: rgba(0,212,170,0.3); }}

    /* CALL CARDS */
    .call-grid {{ display: flex; flex-direction: column; gap: 10px; }}
    .call-card {{ background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 18px; }}
    .call-card:hover {{ border-color: rgba(255,255,255,0.12); }}
    .call-card-header {{ display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px; }}
    .call-title {{ font-size: 13px; font-weight: 700; color: var(--text); }}
    .call-date {{ font-size: 11px; font-weight: 700; color: var(--muted); white-space: nowrap; flex-shrink: 0; font-family: monospace; background: var(--surface2); padding: 2px 7px; border-radius: 4px; }}
    .call-quote {{ font-size: 13px; color: var(--text-dim); font-style: italic; padding-left: 12px; border-left: 2px solid rgba(255,107,107,0.4); }}
    .call-quote.warn {{ border-left-color: rgba(255,169,77,0.4); }}
    .call-quote.purple {{ border-left-color: rgba(108,99,255,0.4); }}
    .call-quote.teal {{ border-left-color: rgba(0,212,170,0.4); }}

    /* BADGES */
    .badge {{ display: inline-flex; align-items: center; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }}
    .badge-red {{ background: rgba(255,107,107,0.15); color: var(--danger); border: 1px solid rgba(255,107,107,0.3); }}
    .badge-warn {{ background: rgba(255,169,77,0.15); color: var(--warn); border: 1px solid rgba(255,169,77,0.3); }}
    .badge-teal {{ background: rgba(0,212,170,0.15); color: var(--accent2); border: 1px solid rgba(0,212,170,0.3); }}
    .badge-purple {{ background: rgba(108,99,255,0.15); color: var(--accent); border: 1px solid rgba(108,99,255,0.3); }}

    /* MORE PILL */
    .more-pill {{ background: var(--surface2); color: var(--muted); border-radius: 20px; padding: 4px 14px; font-size: 12px; }}

    /* NAV */
    .nav-wrap {{ background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 24px; position: sticky; top: 0; z-index: 100; display: flex; flex-wrap: wrap; gap: 8px; }}

    /* FOOTER */
    footer {{ text-align: center; padding: 40px 20px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--border); }}
  </style>
</head>
<body>

<div class="hero">
  <div class="hero-eyebrow">⚠️ Customer Impact Report</div>
  <h1>Rev.io PSA<br><span>Performance &amp; Access Issues</span></h1>
  <div class="hero-sub">Customer-reported login failures, 403 errors, slow performance, blank views, and access issues extracted from onboarding &amp; configuration calls</div>
  <div class="hero-meta">
    <span class="hero-tag">📅 Sep 1, 2025 – Mar 15, 2026</span>
    <span class="hero-tag">👤 Nicole Hills · Halle Taylor · Kegan Ehlers · Jeremy Adams</span>
    <span class="hero-tag">📞 705 calls analyzed</span>
    <span class="hero-tag">* Mar 2026 partial</span>
  </div>
</div>

<div class="nav-wrap">
  {nav_pills}
</div>

<div class="content">

  <div class="section">
    <div class="section-label">At a Glance</div>
    <div class="section-title">Summary</div>
    <div class="section-divider"></div>
    <div class="stat-grid">
      <div class="stat-card red"><div class="stat-num red">{total_issues}</div><div class="stat-label">Total Issue Mentions</div></div>
      <div class="stat-card warn"><div class="stat-num warn">{total_calls}</div><div class="stat-label">Affected Calls</div></div>
      <div class="stat-card purple"><div class="stat-num purple">705</div><div class="stat-label">Calls Analyzed</div></div>
      <div class="stat-card warn"><div class="stat-num warn">128</div><div class="stat-label">Password Resets (#1)</div></div>
      <div class="stat-card teal"><div class="stat-num teal">7</div><div class="stat-label">Months Covered</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-label">Volume by Category</div>
    <div class="section-title">Issue Breakdown</div>
    <div class="section-divider"></div>
    <div class="bar-list">{bar_items}</div>
  </div>

  <div class="section">
    <div class="section-label">Analysis</div>
    <div class="section-title">Key Findings</div>
    <div class="section-divider"></div>
    {findings}
  </div>

  <div class="section">
    <div class="section-label">Trends</div>
    <div class="section-title">Issues per Month by Category</div>
    <div class="section-divider"></div>
    <div class="month-table-wrap">
      <table class="month-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Total</th>
            {month_header_cells}
          </tr>
        </thead>
        <tbody>{table_rows}</tbody>
      </table>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-top:10px">🔴 ≥10 &nbsp; 🟠 ≥5 &nbsp; — = zero mentions &nbsp; * Mar 2026 through Mar 12</p>
  </div>

  {cat_sections}

</div>

<footer>
  Generated {datetime.now().strftime("%B %d, %Y")} &nbsp;·&nbsp; Alfred 🎩 &nbsp;·&nbsp; Data: Fireflies.ai &nbsp;·&nbsp; 705 calls · Sep 2025 – Mar 2026
</footer>

</body>
</html>'''

outpath = '/home/openclaw/.openclaw/workspace/psa-performance-issues-v2-dark.html'
with open(outpath, 'w') as f:
    f.write(html)
print(f'Written: {outpath} ({len(html):,} bytes)')
