import json
from datetime import datetime
from collections import defaultdict

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

CAT_COLORS = {
    'Login / Sign-in Failure':   '#e74c3c',
    '403 / Access Denied Error': '#e67e22',
    '500 / Server Error':        '#c0392b',
    'Cache / Browser Issues':    '#f39c12',
    'Slow / Performance':        '#3498db',
    'Blank / Missing Views':     '#9b59b6',
    'Session / Logout Issues':   '#1abc9c',
    'Password Reset Issues':     '#2ecc71',
}

CAT_ICONS = {
    'Login / Sign-in Failure':   '🔐',
    '403 / Access Denied Error': '🚫',
    '500 / Server Error':        '💥',
    'Cache / Browser Issues':    '🗑️',
    'Slow / Performance':        '🐢',
    'Blank / Missing Views':     '👻',
    'Session / Logout Issues':   '⏏️',
    'Password Reset Issues':     '🔑',
}

total_issues = sum(len(v) for v in data.values())
total_calls_with_issues = len(set(
    (item['title'], item['date'])
    for cat_items in data.values()
    for item in cat_items
))

# Build chart data
chart_labels = json.dumps([MONTH_LABELS.get(m, m) for m in MONTHS])
chart_datasets = []
for cat in CATEGORIES:
    color = CAT_COLORS[cat]
    values = [by_month[m].get(cat, 0) for m in MONTHS]
    chart_datasets.append({
        'label': cat,
        'data': values,
        'backgroundColor': color,
        'borderColor': color,
        'borderWidth': 2,
        'fill': False,
        'tension': 0.3,
    })
chart_datasets_json = json.dumps(chart_datasets)

# Build category cards HTML
category_cards = ''
for cat in CATEGORIES:
    items = data[cat]
    count = len(items)
    color = CAT_COLORS[cat]
    icon = CAT_ICONS[cat]
    
    # Get unique clients
    unique_clients = sorted(set(
        item['client'] for item in items
        if item['client'] and len(item['client']) > 2
    ))
    
    # Sort items by date
    sorted_items = sorted(items, key=lambda x: x['date'])
    
    # Build rows
    rows_html = ''
    for item in sorted_items:
        quote_clean = item['quote'].replace('<', '&lt;').replace('>', '&gt;')
        client_clean = item['client'].replace('<', '&lt;').replace('>', '&gt;')
        organizer_name = item['organizer'].split('@')[0].replace('.', ' ').title()
        rows_html += f'''
        <tr>
          <td>{item["date"]}</td>
          <td class="client-name">{client_clean}</td>
          <td>{organizer_name}</td>
          <td class="quote-text">"{quote_clean}"</td>
        </tr>'''
    
    # Monthly breakdown for this category
    month_breakdown = ''
    for m in MONTHS:
        cnt = by_month[m].get(cat, 0)
        if cnt > 0:
            month_breakdown += f'<span class="month-badge">{MONTH_LABELS.get(m,m)}: <strong>{cnt}</strong></span>'
    
    category_cards += f'''
    <div class="category-card" id="cat-{cat.replace("/","").replace(" ","-").lower()}">
      <div class="cat-header" style="border-left: 5px solid {color}">
        <div class="cat-title">
          <span class="cat-icon">{icon}</span>
          <h2>{cat}</h2>
          <span class="cat-count" style="background:{color}">{count} mentions</span>
        </div>
        <div class="month-breakdown">{month_breakdown}</div>
      </div>
      <div class="cat-clients">
        <strong>Affected Clients ({len(unique_clients)}):</strong>
        {", ".join(unique_clients[:20])}{"..." if len(unique_clients) > 20 else ""}
      </div>
      <div class="table-wrapper">
        <table class="issues-table">
          <thead>
            <tr><th>Date</th><th>Client / Call</th><th>Host</th><th>Quote / Context</th></tr>
          </thead>
          <tbody>{rows_html}</tbody>
        </table>
      </div>
    </div>'''

# Summary table
summary_rows = ''
for cat in CATEGORIES:
    count = len(data[cat])
    color = CAT_COLORS[cat]
    icon = CAT_ICONS[cat]
    month_cells = ''.join(f'<td class="num">{by_month[m].get(cat, 0)}</td>' for m in MONTHS)
    summary_rows += f'<tr><td style="border-left:4px solid {color}; padding-left:8px">{icon} {cat}</td><td class="num total-cell">{count}</td>{month_cells}</tr>'

month_headers = ''.join(f'<th>{MONTH_LABELS.get(m,m)}</th>' for m in MONTHS)

html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rev.io PSA – Performance Issues Analysis</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f0f2f5; color: #1a1a2e; }}
  
  .header {{
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    color: white; padding: 40px; text-align: center;
  }}
  .header h1 {{ font-size: 2rem; margin-bottom: 8px; }}
  .header p {{ opacity: 0.8; font-size: 1rem; }}
  .header .subtitle {{ margin-top: 6px; opacity: 0.6; font-size: 0.85rem; }}
  
  .container {{ max-width: 1400px; margin: 0 auto; padding: 30px 20px; }}
  
  .stats-grid {{
    display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px; margin-bottom: 30px;
  }}
  .stat-card {{
    background: white; border-radius: 12px; padding: 24px;
    text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }}
  .stat-card .num {{ font-size: 2.5rem; font-weight: 700; }}
  .stat-card .label {{ color: #666; font-size: 0.85rem; margin-top: 4px; }}
  
  .section-title {{
    font-size: 1.3rem; font-weight: 700; margin: 30px 0 16px;
    color: #1a1a2e; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;
  }}
  
  .chart-card {{
    background: white; border-radius: 12px; padding: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 30px;
  }}
  .chart-title {{ font-size: 1rem; font-weight: 600; margin-bottom: 16px; color: #333; }}
  .charts-row {{ display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 30px; }}
  @media (max-width: 900px) {{ .charts-row {{ grid-template-columns: 1fr; }} }}
  
  .summary-card {{
    background: white; border-radius: 12px; padding: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 30px;
    overflow-x: auto;
  }}
  .summary-table {{ width: 100%; border-collapse: collapse; font-size: 0.88rem; }}
  .summary-table th {{
    background: #1a1a2e; color: white; padding: 10px 14px;
    text-align: left; white-space: nowrap;
  }}
  .summary-table th.num {{ text-align: center; }}
  .summary-table td {{ padding: 10px 14px; border-bottom: 1px solid #f0f0f0; }}
  .summary-table tr:hover {{ background: #f8fafc; }}
  .summary-table .num {{ text-align: center; }}
  .summary-table .total-cell {{ font-weight: 700; font-size: 1rem; }}
  
  .category-card {{
    background: white; border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 24px;
    overflow: hidden;
  }}
  .cat-header {{
    padding: 20px 24px 16px;
    background: #fafbfc;
    border-bottom: 1px solid #eee;
  }}
  .cat-title {{ display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }}
  .cat-icon {{ font-size: 1.5rem; }}
  .cat-title h2 {{ font-size: 1.15rem; font-weight: 700; }}
  .cat-count {{
    color: white; border-radius: 20px; padding: 3px 14px;
    font-size: 0.85rem; font-weight: 700;
  }}
  .month-breakdown {{ margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }}
  .month-badge {{
    background: #f0f4f8; border-radius: 6px; padding: 3px 10px;
    font-size: 0.8rem; color: #555;
  }}
  .cat-clients {{
    padding: 12px 24px; font-size: 0.85rem; color: #555;
    background: #f9f9f9; border-bottom: 1px solid #eee;
  }}
  .table-wrapper {{ overflow-x: auto; }}
  .issues-table {{ width: 100%; border-collapse: collapse; font-size: 0.82rem; }}
  .issues-table th {{
    background: #f0f4f8; padding: 10px 14px; text-align: left;
    font-weight: 600; color: #333; white-space: nowrap;
    border-bottom: 2px solid #e2e8f0;
  }}
  .issues-table td {{ padding: 9px 14px; border-bottom: 1px solid #f5f5f5; vertical-align: top; }}
  .issues-table tr:hover {{ background: #fafcff; }}
  .issues-table .client-name {{ font-weight: 600; color: #1a1a2e; white-space: nowrap; }}
  .issues-table .quote-text {{ color: #555; font-style: italic; max-width: 500px; }}
  
  .nav-pills {{
    display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;
  }}
  .nav-pill {{
    padding: 6px 16px; border-radius: 20px; font-size: 0.82rem;
    font-weight: 600; text-decoration: none; color: white;
    cursor: pointer; border: none;
  }}
  
  .footer {{ text-align: center; padding: 30px; color: #888; font-size: 0.8rem; }}
</style>
</head>
<body>

<div class="header">
  <h1>🔍 Rev.io PSA – Performance Issues Analysis</h1>
  <p>Customer-reported performance & access issues extracted from onboarding and configuration calls</p>
  <p class="subtitle">Sept 1, 2025 – Mar 15, 2026 &nbsp;|&nbsp; Hosts: Nicole Hills, Halle Taylor, Kegan Ehlers, Jeremy Adams &nbsp;|&nbsp; * Mar 2026 partial</p>
</div>

<div class="container">

  <div class="stats-grid">
    <div class="stat-card">
      <div class="num" style="color:#e74c3c">{total_issues}</div>
      <div class="label">Total Issue Mentions</div>
    </div>
    <div class="stat-card">
      <div class="num" style="color:#3498db">{total_calls_with_issues}</div>
      <div class="label">Calls with Issues</div>
    </div>
    <div class="stat-card">
      <div class="num" style="color:#9b59b6">705</div>
      <div class="label">Total Calls Analyzed</div>
    </div>
    <div class="stat-card">
      <div class="num" style="color:#2ecc71">8</div>
      <div class="label">Issue Categories</div>
    </div>
    <div class="stat-card">
      <div class="num" style="color:#f39c12">7</div>
      <div class="label">Months Covered</div>
    </div>
  </div>

  <h3 class="section-title">📈 Trends Over Time</h3>
  <div class="charts-row">
    <div class="chart-card">
      <div class="chart-title">Monthly Issue Mentions by Category</div>
      <canvas id="lineChart" height="100"></canvas>
    </div>
    <div class="chart-card">
      <div class="chart-title">Total by Category</div>
      <canvas id="donutChart" height="100"></canvas>
    </div>
  </div>

  <h3 class="section-title">📊 Summary Table – Issues per Month</h3>
  <div class="summary-card">
    <table class="summary-table">
      <thead>
        <tr>
          <th>Category</th>
          <th class="num">Total</th>
          {month_headers}
        </tr>
      </thead>
      <tbody>{summary_rows}</tbody>
    </table>
  </div>

  <h3 class="section-title">🗂️ Detailed Breakdown by Category</h3>
  
  <div class="nav-pills">
    {''.join(f'<a class="nav-pill" style="background:{CAT_COLORS[cat]}" href="#cat-{cat.replace("/","").replace(" ","-").lower()}">{CAT_ICONS[cat]} {cat} ({len(data[cat])})</a>' for cat in CATEGORIES)}
  </div>

  {category_cards}

</div>

<div class="footer">
  Generated {datetime.now().strftime("%B %d, %Y at %H:%M UTC")} &nbsp;|&nbsp; Alfred 🎩 &nbsp;|&nbsp; Data source: Fireflies.ai
</div>

<script>
const lineCtx = document.getElementById('lineChart').getContext('2d');
new Chart(lineCtx, {{
  type: 'line',
  data: {{
    labels: {chart_labels},
    datasets: {chart_datasets_json}
  }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ position: 'bottom', labels: {{ boxWidth: 12, font: {{ size: 11 }} }} }} }},
    scales: {{
      y: {{ beginAtZero: true, ticks: {{ stepSize: 5 }} }},
      x: {{ grid: {{ display: false }} }}
    }}
  }}
}});

const donutCtx = document.getElementById('donutChart').getContext('2d');
new Chart(donutCtx, {{
  type: 'doughnut',
  data: {{
    labels: {json.dumps([cat for cat in CATEGORIES])},
    datasets: [{{
      data: {json.dumps([len(data[cat]) for cat in CATEGORIES])},
      backgroundColor: {json.dumps([CAT_COLORS[cat] for cat in CATEGORIES])},
      borderWidth: 2,
      borderColor: '#fff'
    }}]
  }},
  options: {{
    responsive: true,
    plugins: {{
      legend: {{ position: 'bottom', labels: {{ boxWidth: 12, font: {{ size: 10 }} }} }}
    }}
  }}
}});
</script>
</body>
</html>'''

outpath = '/home/openclaw/.openclaw/workspace/psa-performance-issues-v2.html'
with open(outpath, 'w') as f:
    f.write(html)
print(f'Written to {outpath}')
print(f'Total issues: {total_issues}, calls with issues: {total_calls_with_issues}')
