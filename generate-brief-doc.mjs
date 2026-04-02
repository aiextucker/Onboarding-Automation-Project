import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, convertInchesToTwip
} from 'docx';
import { writeFileSync } from 'fs';

const ACCENT = "6C63FF";
const ACCENT2 = "00D4AA";
const WARN = "FFA94D";
const LIGHT_BG = "F4F3FF";
const WARN_BG = "FFF8EE";
const GRAY = "7B7F9E";
const DARK = "1A1040";

const h1 = (text) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 120 },
  border: { bottom: { color: ACCENT, size: 8, style: BorderStyle.SINGLE, space: 4 } },
});

const h2 = (text) => new Paragraph({
  children: [new TextRun({ text, bold: true, size: 28, color: DARK })],
  spacing: { before: 280, after: 80 },
});

const h3 = (text, color = ACCENT) => new Paragraph({
  children: [new TextRun({ text, bold: true, size: 22, color })],
  spacing: { before: 200, after: 60 },
});

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, size: 22, color: "444444", ...opts })],
  spacing: { before: 60, after: 60 },
});

const bullet = (text, bold = false) => new Paragraph({
  children: [new TextRun({ text, size: 21, color: bold ? DARK : "555555", bold })],
  bullet: { level: 0 },
  spacing: { before: 40, after: 40 },
});

const subbullet = (text) => new Paragraph({
  children: [new TextRun({ text, size: 20, color: "666666" })],
  bullet: { level: 1 },
  spacing: { before: 30, after: 30 },
});

const divider = () => new Paragraph({
  border: { bottom: { color: "DDDDDD", size: 4, style: BorderStyle.SINGLE, space: 4 } },
  spacing: { before: 160, after: 160 },
});

const callout = (title, body, bg = LIGHT_BG, color = ACCENT) => [
  new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 22, color })],
    shading: { type: ShadingType.CLEAR, fill: bg },
    spacing: { before: 120, after: 40 },
    indent: { left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.2) },
  }),
  new Paragraph({
    children: [new TextRun({ text: body, size: 21, color: "555555" })],
    shading: { type: ShadingType.CLEAR, fill: bg },
    spacing: { before: 0, after: 120 },
    indent: { left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.2) },
  }),
];

const fieldRow = (label, value = "___________________________________") => new Paragraph({
  children: [
    new TextRun({ text: `${label}: `, bold: true, size: 21, color: DARK }),
    new TextRun({ text: value, size: 21, color: "888888" }),
  ],
  spacing: { before: 60, after: 60 },
});

const twoColTable = (rows) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
    insideH: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
    insideV: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
  },
  rows: rows.map(([left, right]) => new TableRow({
    children: [
      new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: left, size: 20, color: "333333" })], spacing: { before: 60, after: 60 }, indent: { left: 80 } })],
      }),
      new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: right, size: 20, color: "555555" })], spacing: { before: 60, after: 60 }, indent: { left: 80 } })],
      }),
    ],
  })),
});

const headerRow = (cols) => new TableRow({
  tableHeader: true,
  children: cols.map(col => new TableCell({
    shading: { type: ShadingType.CLEAR, fill: "F0EFFF" },
    children: [new Paragraph({ children: [new TextRun({ text: col, bold: true, size: 18, color: ACCENT })], spacing: { before: 60, after: 60 }, indent: { left: 80 } })],
  })),
});

const dataRow = (cols) => new TableRow({
  children: cols.map(col => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: col, size: 19, color: "444444" })], spacing: { before: 60, after: 60 }, indent: { left: 80 } })],
  })),
});

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1",
        run: { bold: true, size: 36, color: DARK, font: "Calibri" },
      },
      {
        id: "Heading2", name: "Heading 2",
        run: { bold: true, size: 28, color: DARK, font: "Calibri" },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top: convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left: convertInchesToTwip(1.1),
          right: convertInchesToTwip(1.1),
        },
      },
    },
    children: [

      // ── TITLE PAGE ──────────────────────────────────────────
      new Paragraph({
        children: [new TextRun({ text: "⚡ Rev.io Intelligence Stack", size: 22, color: ACCENT2, bold: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "PSA Onboarding Automation", size: 52, bold: true, color: DARK })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Sales Brief & Discovery Guide", size: 36, color: ACCENT })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Based on analysis of 566 PSA onboarding calls · Nov 2025 – Mar 2026", size: 20, color: GRAY, italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 600 },
      }),
      twoColTable([
        ["📞 Calls Analyzed", "566"],
        ["⏱️ Total SA Hours", "411.7 hours"],
        ["👥 Solution Advisors", "Nicole Hills · Halle Taylor · Kegan Ehlers"],
        ["📅 Period", "November 2025 – March 2026"],
        ["🔊 Data Source", "Fireflies.ai transcripts"],
      ]),

      divider(),

      // ── PART 1: THE PROBLEM ─────────────────────────────────
      h1("Part 1 — The Problem"),
      p("Every new PSA client arrives to their kickoff call with a completely blank Rev.io instance. Their Solutions Analyst spends the first 1–2 sessions asking questions that the sales team already answered weeks earlier."),
      bullet('"What system are you coming from?" — Sales knew this.'),
      bullet('"Who are your key contacts?" — Sales knew this.'),
      bullet('"What integrations do you need?" — Sales knew this.'),
      ...callout(
        "🎯 This is a handoff gap, not a discovery gap",
        "The top 4 questions come up in 84–90% of every onboarding call. Sales already knows the answers at point of sale. Capturing just 4 data points at close enables billing setup, user account creation, integration configuration, and migration scoping to begin before the SA ever schedules a call. That's the difference between Day 1 starting blank and Day 1 starting at 60–80% configured."
      ),

      divider(),

      // ── PART 2: THE AUTOMATION VISION ───────────────────────
      h1("Part 2 — The Automation Vision"),
      p("The goal is a fully automated pre-configuration pipeline triggered the moment a deal closes:"),
      bullet("Deal closes in Salesforce (Closed-Won)", true),
      subbullet("Trigger fires automatically"),
      bullet("Pull all sales call transcripts from Fireflies by company name", true),
      subbullet("Extract signals: prior PSA, accounting SW, RMM, contacts, pain points, commitments made"),
      bullet("Pull Salesforce Account / Opportunity / Contact data", true),
      subbullet("Company info, deal terms, modules sold, contacts with job titles"),
      bullet("Auto-populate the Sales Brief", true),
      subbullet("~72% completion from transcript data alone (proven in 12-deal scorecard)"),
      bullet("Flag remaining gaps → send short follow-up questionnaire (5–7 questions)", true),
      subbullet("To Sales rep or directly to the client as a welcome email"),
      bullet("SA receives completed brief 48 hours before kickoff", true),
      subbullet("Pre-configured instance waiting. SA reviews and refines — doesn't start from scratch."),

      h2("What Transcripts Can Reliably Extract"),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { insideH: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" }, insideV: { style: BorderStyle.NONE }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        rows: [
          headerRow(["Can Extract from Transcripts ✅", "Usually Missing — Follow-up Questions ⚠️"]),
          dataRow(["Prior PSA / current system", "Exact user list with job titles + emails"]),
          dataRow(["Accounting software (QBO vs Desktop)", "SureTax account status / credentials"]),
          dataRow(["RMM tool", "Invoice number sequence / continuity"]),
          dataRow(["Key contacts + names", "GL codes ready or not"]),
          dataRow(["Business vertical / service model", "Business hours + holiday calendar"]),
          dataRow(["Migration concerns + complexity", "SMS yes/no"]),
          dataRow(["Integration priorities mentioned", "Bill profile questionnaire (net-new)"]),
          dataRow(["Inventory / project management needs", ""]),
          dataRow(["Pain points, red flags, commitments made", ""]),
        ],
      }),

      h2("Data Sources"),
      twoColTable([
        ["Salesforce", "Company info, contacts, deal terms, modules sold, rep notes, custom fields"],
        ["Fireflies", "Pain points, migration concerns, integration priorities, commitments, red flags"],
        ["Follow-up questions", "SureTax credentials, invoice sequence, GL codes, business hours, bill profile"],
      ]),

      h2("What's Needed to Build This"),
      twoColTable([
        ["Salesforce Connected App", "OAuth 2.0 read-only access — ask Ardit (SF admin) to set up. Client ID + Secret needed."],
        ["Fireflies API Key", "For transcript extraction by company name. Not yet obtained."],
        ["Salesforce fields to add", "Prior PSA, user count, accounting software, RMM tool, industry/vertical — if not already there."],
        ["Zapier (alternative to SF API)", "Closed-Won trigger → webhook. Simpler if SF Connected App is too much overhead."],
      ]),
      ...callout(
        "📋 What to Ask Ardit",
        '"Can you create a Connected App in Salesforce with OAuth 2.0 so an external tool can read Opportunity, Account, and Contact records? I need the Client ID and Client Secret — read-only access is fine."',
        WARN_BG, WARN
      ),

      divider(),

      // ── PART 3: THE CORE 8 ──────────────────────────────────
      h1("Part 3 — The Core 8"),
      p("These 8 data points unlock the majority of pre-configuration. Ask during the sales process and as a structured 5-minute segment at the end of the closing call."),
      ...callout(
        "💬 The Explicit Close",
        '"Before we wrap up — we\'re going to set up your Rev.io environment before your first onboarding call so your team hits the ground running. Can I take 5 minutes to confirm a few details?"'
      ),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          insideH: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
          insideV: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
          top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
        },
        rows: [
          headerRow(["#", "Question", "Why It Matters", "Unlocks"]),
          dataRow(["1", "Prior PSA / current system?\nTigerpaw, ConnectWise, Halo, spreadsheets, nothing?", "Determines migration path. Tigerpaw = 42+ clients needing dedicated playbook.", "Data Import"]),
          dataRow(["2", "Accounting software?\nQBO, Desktop, NetSuite, or other?", "QBO vs Desktop is a different connector. Desktop = no direct integration today.", "Integrations"]),
          dataRow(["3", "RMM tool?\nNinjaOne, Datto, CW Automate, or other?", "Top priority for most MSPs. Defines integration queue on Day 1.", "Integrations"]),
          dataRow(["4", "Payment processor?\nSame processor or switching?", "Comes up in 89% of calls. SA re-discovers this every engagement.", "Payments Config"]),
          dataRow(["5", "Users + roles?\nActual job titles — Owner, Office Mgr, Field Tech, Dispatcher, etc.", "Drives user account creation with correct Rev.io role mapping. Org chart built on call today.", "Admin / Users"]),
          dataRow(["6", "Dispatch model?\nBy department, geography, skill set, or combo?", "Gates the entire dispatch board config. Wrong answer = SA rebuilds in session 1.", "Processes"]),
          dataRow(["7", "Invoice number sequence?\nNeed continuity from current system?", "Must be set before any invoice is generated. Recurring concern raised in sales.", "Company Info"]),
          dataRow(["8", "SureTax credentials?\nExisting account or needs new one set up?", "Required for automated tax calculation. Missing this delays entire billing setup.", "Tax Config"]),
        ],
      }),

      divider(),

      // ── PART 4: SECONDARY QUESTIONS ─────────────────────────
      h1("Part 4 — Secondary Discovery Questions"),
      p("Collect these to unlock the next layer of pre-configuration."),

      h3("💸 Billing & Invoicing  (57% of calls)"),
      bullet("Do they have recurring billing / RMR?"),
      bullet("Any tax-exempt clients? States with exemptions?"),
      bullet("Are GL codes ready — or does accountant need to provide them?"),
      bullet("Billing profile preferences: net terms, invoice format?"),

      h3("🎫 Ticketing & Service Boards  (90% of calls)"),
      bullet("How do tickets come in? (email, phone, portal, all?)"),
      bullet("Do they need a customer-facing portal?"),
      bullet("Dispatch board needed? (field service vs. internal only)"),
      bullet("Custom ticket statuses or fields required?"),

      h3("📦 Data Migration  (84% of calls)"),
      bullet("Do they have a data export ready, or does it need to be pulled?"),
      bullet("Rough customer count — how big is the import?"),
      bullet("Parent-child account structure needed? (franchise, multi-location)"),
      bullet("Data quality — is it clean or will it need cleanup?"),

      h3("🔌 Integrations  (90% of calls)"),
      bullet("QuickBooks Online or Desktop? (Desktop = no direct integration — flag early)"),
      bullet("RMM tool confirmed (captured in Core 8 — verify here)"),
      bullet("Outlook / Google Calendar sync needed?"),
      bullet("Other integrations: PandaDoc, HubSpot, Zoho, PAX8, etc.?"),
      bullet("Any custom API integrations required?"),

      h3("🏢 Business Vertical & Service Model"),
      bullet("Primary vertical: MSP · Security Integrator · AV · Field Service · Multi-service?"),
      bullet("Do they have field technicians? (dispatch board, mobile app, install projects)"),
      bullet("Internal help desk, external client-facing, or both?"),
      bullet("Co-managed IT model?"),

      h3("⏰ Business Hours & Holiday Hours"),
      bullet("Standard business hours? (e.g. Mon–Fri 8am–5pm)"),
      bullet("After-hours or weekend support? Different SLA tiers?"),
      bullet("Which holidays do they observe?"),
      bullet("Do holiday hours affect SLA response time calculations?"),

      h3("💬 SMS Capabilities"),
      bullet("Do they want to enable SMS notifications for clients?"),
      bullet("Use case: ticket updates, appointment reminders, billing alerts?"),
      bullet("Do they have a business phone number — or need one provisioned?"),

      h3("📦 Inventory Management  (55% of calls)"),
      bullet("Will they be using inventory management? (yes / no / phase 2)"),
      bullet("Do they track serialized assets?"),
      bullet("Do they use purchase orders today?"),
      bullet("How big is the product catalog — rough SKU count?"),

      h3("📋 Project Management  (56% of calls)"),
      bullet("Will they be using project management? (yes / no / phase 2)"),
      bullet("Do they manage multi-phase installs or long-running projects?"),
      bullet("Do they need milestone billing tied to project phases?"),

      h3("📄 Quoting & Contracts  (31% of calls)"),
      bullet("Do they use a quoting tool today? (PandaDoc, QuoteWerks, manual, etc.)"),
      bullet("Contracts month-to-month or multi-year?"),
      bullet("Recurring agreements / RMR driven contracts?"),

      divider(),

      // ── PART 5: IF NOT BILLING CLIENT ───────────────────────
      h1("Part 5 — If NOT an Existing Billing Client"),
      p("Existing Rev.io Billing clients already have company info and billing profiles in the system. For net-new clients, these additional items must be collected before the SA can configure billing."),

      h3("📬 Send: Bill Profile Questionnaire", WARN),
      bullet("Send the standard Bill Profile Questionnaire to the client before kickoff"),
      bullet("Covers: invoice format preferences, payment terms, late fees, credit limits, billing contact"),
      bullet("Must be returned and reviewed before SA configures billing in the instance"),

      h3("📅 Accounting Periods", WARN),
      bullet("What are their accounting periods? (monthly, quarterly, fiscal year dates)"),
      bullet("When does their fiscal year start? (may differ from calendar year)"),
      bullet("Do they close books on a specific schedule — affects billing cycle alignment"),

      h3("📎 Collect: Existing Quote Template", WARN),
      bullet("Ask the client to send their current quote template (PDF, Word, or tool export)"),
      bullet("SA uses this to recreate their format and branding in Rev.io before kickoff"),
      bullet("Note required fields: line item structure, discount display, terms, signature block"),

      divider(),

      // ── PART 6: COMMON GAPS ─────────────────────────────────
      h1("Part 6 — Common Gaps Surfaced During Calls"),
      p("These are problems SAs discover mid-session that cause delays. Most are preventable with a completed Sales Brief."),
      twoColTable([
        ["No data template ready", "SA provides CSV template on the call — should arrive pre-configured"],
        ["Wrong migration assumptions", "Scope re-defined during session, wasting setup time"],
        ["GL codes not mapped", "SA walks through mapping in real-time with accountant absent"],
        ["Email connector not configured", "Discovered mid-session; blocks ticket ingestion workflow"],
        ["User roles unclear", "Org chart reconstructed live on the call"],
        ["Payment processor unknown", "Client needs to check and follow up — adds a delay cycle"],
        ["Tax exemptions undocumented", "Flagged for follow-up; billing config left incomplete"],
        ["Prior system data quality issues", "Identified on call but not resolvable same day"],
      ]),

      divider(),

      // ── PART 7: SALES BRIEF ─────────────────────────────────
      h1("Part 7 — Sales Brief (SA Handoff Document)"),
      p("Complete at close. Hand off to the SA 48 hours before kickoff. Every field filled = one less question on Day 1."),
      p("Live fillable version: https://ftimothy2013.github.io/Onboarding-Automation-/sales-brief.html", { italics: true, color: ACCENT }),

      h2("Section 1 — Client & Deal Information"),
      fieldRow("Company Name"),
      fieldRow("Close Date"),
      fieldRow("MRR"),
      fieldRow("Contract Term", "[ ] Month-to-Month  [ ] 12 Mo  [ ] 24 Mo  [ ] 36 Mo"),
      fieldRow("Sales Rep"),
      fieldRow("SA Assigned", "[ ] Nicole Hills  [ ] Halle Taylor  [ ] Kegan Ehlers  [ ] Jeremy Adams"),
      fieldRow("Primary Client Contact (Name + Title)"),
      fieldRow("Primary Contact Email"),
      fieldRow("Existing Billing Client?", "[ ] Yes — existing billing    [ ] No — net new"),
      fieldRow("Business Vertical", "[ ] MSP  [ ] Security Integrator  [ ] AV  [ ] Field Service  [ ] Telecom  [ ] Multi-service"),
      p("SA Context Notes:", { bold: true }),
      p("________________________________________________________________________________"),
      p("________________________________________________________________________________"),

      h2("Section 2 — Core 8"),

      h3("1️⃣ Prior PSA / Current System"),
      fieldRow("System", "[ ] ConnectWise  [ ] Tigerpaw  [ ] Halo  [ ] HouseCall Pro  [ ] Zoho  [ ] Spreadsheets  [ ] None  [ ] Other"),
      fieldRow("If Other"),
      fieldRow("Migration Complexity", "[ ] Clean — ready to export  [ ] Needs cleanup  [ ] No migration"),
      fieldRow("Approx. Customer / Record Count"),
      fieldRow("Migration Notes"),

      h3("2️⃣ Accounting Software"),
      fieldRow("Software", "[ ] QuickBooks Online  [ ] QuickBooks Desktop  [ ] NetSuite  [ ] Xero  [ ] Other"),
      fieldRow("Two-Way Sync Required?", "[ ] Yes  [ ] No — one-way  [ ] TBD"),
      fieldRow("GL Codes Ready?", "[ ] Yes — chart of accounts ready  [ ] No — accountant to provide"),
      p("⚠️ QuickBooks Desktop = no direct integration today. Flag for SA.", { color: WARN, size: 20 }),

      h3("3️⃣ RMM Tool"),
      fieldRow("RMM", "[ ] NinjaOne  [ ] Datto  [ ] CW Automate  [ ] Atera  [ ] Syncro  [ ] None  [ ] Other"),
      fieldRow("Integration Priority", "[ ] Day 1  [ ] Phase 2  [ ] Not needed"),
      fieldRow("Other Integrations", "[ ] PandaDoc  [ ] HubSpot  [ ] Outlook  [ ] Google Cal  [ ] PAX8  [ ] Zoho  [ ] Custom API"),
      fieldRow("Custom API / Integration Notes"),

      h3("4️⃣ Payment Processor"),
      fieldRow("Processor", "[ ] Rev.io Payments  [ ] Stripe  [ ] Square  [ ] TRX/Payroc  [ ] Manual  [ ] Other"),
      fieldRow("Switching to Rev.io Payments?", "[ ] Yes — migrating  [ ] No — keeping  [ ] Setting up new  [ ] TBD"),
      fieldRow("Merchant Statements Available?", "[ ] Yes — 3 months ready  [ ] No  [ ] N/A"),
      fieldRow("Payment Methods", "[ ] Credit Card  [ ] ACH  [ ] Check  [ ] Card Reader"),

      h3("5️⃣ Users & Roles"),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          insideH: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
          insideV: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
          top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
        },
        rows: [
          headerRow(["Full Name", "Job Title", "Email", "Rev.io Role", "Mobile App?"]),
          ...Array(6).fill(null).map(() => dataRow(["", "", "", "[ ] Admin  [ ] Dispatcher\n[ ] Field Tech  [ ] Standard", "[ ] Y  [ ] N"])),
        ],
      }),

      h3("6️⃣ Dispatch Model & Business Hours"),
      fieldRow("Dispatch Method", "[ ] By Department  [ ] By Geography  [ ] By Skill Set  [ ] By Tech  [ ] None"),
      fieldRow("Service Type", "[ ] Field / On-site  [ ] Remote / Help Desk  [ ] Both  [ ] Install Projects"),
      fieldRow("Business Hours"),
      fieldRow("After-Hours Support?", "[ ] Yes  [ ] No  [ ] Emergency only"),
      fieldRow("Holiday Calendar"),
      fieldRow("Holidays Affect SLA?", "[ ] Yes — pause SLA  [ ] No — SLA runs 24/7  [ ] TBD"),

      h3("7️⃣ Invoice Number Sequence"),
      fieldRow("Needs Continuity?", "[ ] Yes — must continue from current numbers  [ ] No — fresh start"),
      fieldRow("Last Invoice Number (if continuing)"),
      fieldRow("Invoice Prefix / Format"),
      fieldRow("Starting Number (if resetting)"),

      h3("8️⃣ SureTax Credentials"),
      fieldRow("Status", "[ ] Has existing SureTax account  [ ] Needs new account  [ ] Tax exempt  [ ] TBD"),
      fieldRow("SureTax Account / Client ID"),
      fieldRow("Tax-Exempt Clients?", "[ ] Yes  [ ] No"),
      fieldRow("States / Jurisdictions"),
      fieldRow("Tax Notes"),

      h2("Section 3 — Additional Configuration"),
      fieldRow("SMS for Clients?", "[ ] Yes  [ ] No  [ ] Phase 2"),
      fieldRow("SMS Use Cases", "[ ] Ticket updates  [ ] Appt reminders  [ ] Billing alerts"),
      fieldRow("Business SMS Number", "[ ] Has existing  [ ] Needs provisioned  [ ] N/A"),
      fieldRow("Customer Portal?", "[ ] Yes  [ ] No  [ ] Phase 2"),
      fieldRow("Inventory Management?", "[ ] Yes — Day 1  [ ] Phase 2  [ ] No"),
      fieldRow("Inventory Details", "[ ] Serialized assets  [ ] POs  [ ] Mobile inventory  [ ] Warehouse"),
      fieldRow("Project Management?", "[ ] Yes — Day 1  [ ] Phase 2  [ ] No"),
      fieldRow("Project Details", "[ ] Multi-phase installs  [ ] Milestone billing  [ ] Multiple concurrent"),
      fieldRow("Current Quoting Tool", "[ ] PandaDoc  [ ] QuoteWerks  [ ] Manual  [ ] Rev.io already  [ ] None"),
      fieldRow("Quote Template Collected?", "[ ] Yes  [ ] No — follow up  [ ] N/A"),
      fieldRow("Billing Type", "[ ] Monthly RMR  [ ] Quarterly  [ ] T&M  [ ] Milestone  [ ] Annual"),
      fieldRow("Parent-Child Accounts?", "[ ] Yes — multi-location / franchise  [ ] No"),

      h2("Section 4 — Contract Details & Addendums"),
      fieldRow("Contract Start Date"),
      fieldRow("Contract End Date"),
      fieldRow("Auto-Renew?", "[ ] Yes  [ ] No"),
      fieldRow("Base MRR"),
      fieldRow("Onboarding Fee"),
      fieldRow("Payment Terms", "[ ] Net 15  [ ] Net 30  [ ] Net 45  [ ] Due on Receipt"),
      fieldRow("Modules Included", "[ ] PSA Core  [ ] Billing  [ ] Inventory  [ ] Projects  [ ] Portal  [ ] SMS  [ ] Payments  [ ] SureTax  [ ] Mobile"),
      p("Special Pricing / Discounts:", { bold: true }),
      p("________________________________________________________________________________"),
      p("________________________________________________________________________________"),
      p("Specific Commitments Made to Client:", { bold: true }),
      p("________________________________________________________________________________"),
      p("________________________________________________________________________________"),
      p("________________________________________________________________________________"),

      h3("Addendums & Special Terms"),
      p("Add each addendum separately below:"),
      ...[1, 2, 3].flatMap(i => [
        p(`Addendum ${i}:`, { bold: true }),
        fieldRow("  Title"),
        fieldRow("  Type", "[ ] Migration Terms  [ ] Custom Integration  [ ] SLA Guarantee  [ ] Pricing  [ ] Feature Commitment  [ ] Other"),
        p("  Details / SA Action:"),
        p("  ________________________________________________________________________________"),
        p("  ________________________________________________________________________________"),
      ]),

      h2("Section 5 — If NOT an Existing Billing Client"),
      fieldRow("Bill Profile Questionnaire Sent?", "[ ] Yes  [ ] No — needs to be sent"),
      fieldRow("Questionnaire Returned?", "[ ] Yes  [ ] No — follow up needed"),
      fieldRow("Late Fee Policy"),
      fieldRow("Credit Limit"),
      fieldRow("Accounting Period", "[ ] Monthly  [ ] Quarterly  [ ] Annual"),
      fieldRow("Fiscal Year Start"),
      fieldRow("Books Close Schedule"),
      fieldRow("Quote Template Collected?", "[ ] Yes  [ ] No  [ ] N/A"),
      fieldRow("Template Format", "[ ] PDF  [ ] Word / Google Doc  [ ] Tool export"),
      p("Bill Profile Notes:", { bold: true }),
      p("________________________________________________________________________________"),
      p("________________________________________________________________________________"),

      h2("Section 6 — Open Items & SA Flags"),
      p("Pre-Kickoff Open Items:", { bold: true }),
      p("________________________________________________________________________________"),
      p("________________________________________________________________________________"),
      p("________________________________________________________________________________"),
      p("Questions / Items to Confirm on Day 1:", { bold: true }),
      p("________________________________________________________________________________"),
      p("________________________________________________________________________________"),
      p("Red Flags / Risk Notes:", { bold: true }),
      p("________________________________________________________________________________"),
      p("________________________________________________________________________________"),

      divider(),

      // FOOTER
      new Paragraph({
        children: [new TextRun({ text: "⚡ Rev.io Intelligence Stack · PSA Onboarding Automation · Complete at close · Hand off 48 hrs before kickoff", size: 18, color: GRAY, italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync('/home/openclaw/.openclaw/workspace/Rev-io-Onboarding-Automation.docx', buffer);
console.log('done');
