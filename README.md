# Onboarding Automation Project

Internal tooling and analysis for PSA onboarding automation at Rev.io.

## HTML Reports & Dashboards
| File | Description |
|------|-------------|
| `index.html` | Main dashboard index |
| `index-current.html` | Current dashboard index |
| `index-current2.html` | Dashboard index v2 |
| `psa-call-analysis.html` | Analysis of PSA onboarding calls |
| `psa-call-intelligence.html` | Call intelligence deep-dive |
| `psa-transcript-analysis.html` | Transcript analysis |
| `psa-performance-issues.html` | Performance issues report |
| `psa-performance-issues-v2.html` | Performance issues v2 |
| `psa-performance-issues-v2-dark.html` | Dark theme version |
| `sales-brief.html` | SA handoff brief (fillable) |
| `sales-brief-njos.html` | Sales brief (NJOs) |
| `sales-discovery-guide.html` | Sales discovery guide |
| `sf-brief-mapping.html` | Salesforce brief mapping |
| `current-state-onboarding.html` | Current state analysis |
| `future-state-onboarding.html` | Future state vision |
| `forecast-methodology.html` | Forecast methodology |
| `graduation-velocity.html` | Graduation velocity report |
| `graduation-velocity-current.html` | Current graduation velocity |
| `phase-risk-report.html` | Phase risk report |
| `capabilities.html` | Capabilities overview |
| `transition-doc.html` | Transition documentation |
| `stick-rate-report.html` | Stick rate report |
| `kpi-targets.html` | KPI targets |
| `sa-playbook.html` | SA playbook |
| `classic-billing-onboarding-analysis.html` | Classic billing onboarding analysis |

## Scripts
| File | Description |
|------|-------------|
| `build_perf_report.py` | Performance report builder |
| `build_perf_report_dark.py` | Dark theme report builder |
| `generate-brief-doc.mjs` | Sales brief generator |

## Data
| File | Description |
|------|-------------|
| `onboarding-calls.csv` | Raw onboarding call data |
| `graduated.json` | Graduated accounts data |
| `all_accounts.json` | All accounts data |
| `Rev-io-Onboarding-Automation.docx` | Project documentation |

## Project Vision
Sales closes deal → auto-trigger → scrape Fireflies transcripts + pull Salesforce data → auto-populate Sales Brief → SA gets completed brief 48 hrs before kickoff → Day 1 starts at 60–80% configured.
