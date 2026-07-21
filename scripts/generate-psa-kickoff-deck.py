#!/usr/bin/env python3
"""Generate a client-specific Rev.io PSA onboarding kickoff deck.

This script intentionally uses only Python's standard library. A PPTX file is
an OpenXML ZIP archive, so simple text substitutions can be made safely without
adding a project package manager just for this workflow.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
EXTENDED_PROPS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
SLIDE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
SLIDE_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"

DEFAULT_TEMPLATE = Path("templates/revio-psa-onboarding-kickoff-template-v2.pptx")
GREEN_TEXT = "6EBE4F"
GREEN_HIGHLIGHT = "00FF00"
WHITE_TEXT = "FFFFFF"
MUTED_TEXT = "B0B4CC"
DARK_TEXT = "1D3756"
SECTION_BLUE = "1D3756"
BODY_BLUE = "31516F"
GENERATED_FONT = "Montserrat"
TEMPLATE_BODY_TEXT = DARK_TEXT


@dataclass(frozen=True)
class Replacement:
    old: str
    value: str
    label: str
    selected: bool | None = None
    missing_text: str | None = None

    @property
    def missing(self) -> bool:
        if self.selected is not None:
            return False
        return is_missing_value(self.value)

    @property
    def output(self) -> str:
        if self.selected is not None:
            return self.old
        if self.missing:
            return self.missing_text or f"NEEDS: {self.label}"
        return self.value.strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a customized PSA onboarding kickoff PowerPoint deck."
    )
    parser.add_argument(
        "--config",
        required=True,
        type=Path,
        help="Path to a JSON client config. See examples/psa-kickoff-client.example.json.",
    )
    parser.add_argument(
        "--template",
        default=DEFAULT_TEMPLATE,
        type=Path,
        help=f"Template PPTX path. Default: {DEFAULT_TEMPLATE}",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output PPTX path. Defaults to output/<client>-psa-kickoff-deck.pptx.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned replacements without writing a PPTX.",
    )
    parser.add_argument(
        "--report-json",
        type=Path,
        help="Write complete/missing field report JSON for follow-up and gap review.",
    )
    return parser.parse_args()


def require_text(config: dict, key: str) -> str:
    value = config.get(key)
    if value is None or str(value).strip() == "":
        raise ValueError(f"Missing required config field: {key}")
    return str(value).strip()


def optional_text(config: dict, key: str, default: str = "") -> str:
    value = config.get(key, default)
    if value is None:
        return default
    return str(value).strip()


def string_list(config: dict, key: str, expected: int | None = None) -> list[str]:
    value = config.get(key, [])
    if value is None:
        value = []
    if not isinstance(value, list):
        raise ValueError(f"{key} must be a JSON array")
    items = [str(item).strip() for item in value if str(item).strip()]
    if expected is not None and len(items) > expected:
        raise ValueError(f"{key} supports at most {expected} item(s)")
    return items


def string_list_any(config: dict, keys: list[str], expected: int | None = None) -> list[str]:
    for key in keys:
        value = config.get(key)
        if value is None:
            continue
        if isinstance(value, list):
            items = [str(item).strip() for item in value if str(item).strip()]
        else:
            items = [part.strip() for part in re.split(r"[\n;]+", str(value)) if part.strip()]
        if items:
            if expected is not None and len(items) > expected:
                raise ValueError(f"{key} supports at most {expected} item(s)")
            return items
    return []


def clean_sentence(value: str, max_length: int = 95) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip(" .,;:-")
    if len(text) <= max_length:
        return text
    trimmed = text[: max_length - 1].rsplit(" ", 1)[0].strip(" .,;:-")
    trailing_fillers = {"and", "or", "with", "without", "across", "for", "to", "from", "of", "the"}
    words = trimmed.split()
    while words and words[-1].lower() in trailing_fillers:
        words.pop()
    trimmed = " ".join(words).strip(" .,;:-")
    return f"{trimmed}."


def polish_bullet(value: str) -> str:
    text = clean_sentence(value, max_length=140)
    normalized = normalize_text(text)
    if "e automate" in normalized and "workflow" in normalized:
        return "E-Automate workflow friction slows service, field, billing, and collections."
    if "shared service field billing and ar visibility" in normalized or (
        "service field billing" in normalized and "visibility" in normalized
    ):
        return "Shared visibility for service, field, billing, and AR with fewer handoffs."
    if "operational visibility across service billing context payments" in normalized:
        return "Operational visibility across service, billing, payments, and follow-up."
    if "module path aligned to mobile field work inventory project management" in normalized:
        return "Module path aligned to mobile field work, inventory, and projects."
    return text


def presentation_bullets(values: list[str], *, limit: int = 3, max_length: int = 95) -> list[str]:
    bullets = []
    seen = set()
    for value in values:
        for part in re.split(r"[\n;]+", str(value or "")):
            text = clean_sentence(polish_bullet(part), max_length=max_length)
            key = normalize_text(text)
            if not text or key in seen:
                continue
            bullets.append(text)
            seen.add(key)
            if len(bullets) >= limit:
                return bullets
    return bullets


def first_present(config: dict, keys: list[str]) -> str:
    for key in keys:
        value = config.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def first_list(config: dict, keys: list[str], expected: int | None = None) -> list[str]:
    for key in keys:
        value = config.get(key)
        if value:
            return string_list(config, key, expected=expected)
    return []


def is_missing_value(value: str) -> bool:
    normalized = str(value or "").strip()
    if not normalized:
        return True
    return bool(re.match(r"^(tbd|todo|unknown|not set|not provided|missing)\b", normalized, re.I))


def output_path_for(config: dict, explicit_output: Path | None) -> Path:
    if explicit_output:
        return explicit_output
    slug = re.sub(r"[^a-z0-9]+", "-", require_text(config, "clientName").lower())
    slug = slug.strip("-") or "client"
    return Path("output") / f"{slug}-psa-kickoff-deck.pptx"


def slide_path(slide_number: int) -> str:
    return f"ppt/slides/slide{slide_number}.xml"


def repl(old: str, value: str, label: str) -> Replacement:
    return Replacement(old=old, value=value, label=label)


def compact_missing_repl(old: str, value: str, label: str, missing_text: str) -> Replacement:
    return Replacement(old=old, value=value, label=label, missing_text=missing_text)


def module_repl(old: str, selected_modules: list[str]) -> Replacement:
    normalized = {normalize_text(module) for module in selected_modules}
    return Replacement(old=old, value=old, label=f"{old} module requirement", selected=normalize_text(old) in normalized)


def normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def build_replacements(config: dict) -> dict[int, list[Replacement]]:
    modules = first_list(config, ["priorityModules", "optionalModules"], expected=4)
    integrations = string_list(config, "integrations")
    next_steps = string_list(config, "nextSteps", expected=7)

    replacements: dict[int, list[Replacement]] = {
        1: [
            repl("Customer Name", require_text(config, "clientName"), "Client name"),
            repl("January 30, 2026", require_text(config, "kickoffDate"), "Kickoff date"),
        ],
        3: [
            repl("Insert Package Details", require_text(config, "packageDetails"), "Package details"),
            compact_missing_repl("6", optional_text(config, "standardLicenseCount", "6"), "Standard license count", "NEEDS: Qty"),
            compact_missing_repl("100", optional_text(config, "standardLicensePrice", "100"), "Standard license price", "NEEDS: Price"),
            compact_missing_repl("17", optional_text(config, "fieldLicenseCount", "17"), "Field license count", "NEEDS: Qty"),
            compact_missing_repl("25", optional_text(config, "fieldLicensePrice", "25"), "Field license price", "NEEDS: Price"),
            compact_missing_repl("XX/XX/XXXX", require_text(config, "billingStartDate"), "Billing start date", "NEEDS: Start date"),
        ],
        6: [
            repl("https://psademo.rev.io", require_text(config, "instanceUrl"), "Instance URL"),
            module_repl("Quoting", modules),
            module_repl("Inventory", modules),
            module_repl("Project Management", modules),
            module_repl("Mobile App", modules),
            repl("Acronis, HubSpot, QuickBooks Online", ", ".join(integrations), "Interested integrations"),
        ],
        13: [
            repl(
                "Confirm access to your instance and add users as needed",
                next_steps[0] if len(next_steps) > 0 else "",
                "Next step 1",
            ),
            repl(
                "Determine primary admin for checklist",
                next_steps[1] if len(next_steps) > 1 else "",
                "Next step 2",
            ),
            repl("Sign up for Rev.io Community", next_steps[2] if len(next_steps) > 2 else "", "Next step 3"),
            repl(
                "Confirm tax credential request information",
                next_steps[3] if len(next_steps) > 3 else "",
                "Next step 4",
            ),
            repl(
                "Schedule Recurring Weekly Configuration Calls",
                next_steps[4] if len(next_steps) > 4 else "",
                "Next step 5",
            ),
            repl("Send Company Logo", next_steps[5] if len(next_steps) > 5 else "", "Next step 6"),
            repl(
                "Gather product list to build catalog",
                next_steps[6] if len(next_steps) > 6 else "",
                "Next step 7",
            ),
        ],
    }

    return replacements


def build_brief_slides(config: dict) -> list[dict]:
    motivations = string_list(config, "motivations")
    solutions = string_list(config, "solutions")
    issue_details = first_present(config, [
        "salesforceBusinessIssuesDetails",
        "businessIssuesDetails",
        "mainBuyingMotivator",
        "buyingMotivator",
    ])
    issue_pick_list = string_list_any(config, [
        "salesforceBusinessIssuePickList",
        "businessIssuePickList",
        "businessIssues",
        "painPointPickList",
    ])
    problems = string_list_any(config, [
        "salesforceProblems",
        "currentSystemProblems",
        "problems",
        "painPoints",
    ]) or motivations
    value = first_present(config, [
        "salesforceValue",
        "valueIntroduced",
        "expectedValue",
        "businessOutcome",
        "value",
    ])
    salesforce_solutions = string_list_any(config, [
        "salesforceSolutions",
        "revioSolutions",
        "solutionPoints",
    ]) or solutions

    return [
        {
            "kicker": "SALESFORCE BUSINESS ISSUES",
            "title": "Business Issues & Problems",
            "sections": [
                {
                    "heading": "Salesforce Business Issues Details",
                    "items": [issue_details],
                    "missing": "NEEDS: Salesforce business issue details",
                },
                {
                    "heading": "Salesforce Business Issue Pick List",
                    "items": issue_pick_list,
                    "missing": "NEEDS: Salesforce business issue pick list",
                },
                {
                    "heading": "Salesforce Problems",
                    "items": problems,
                    "missing": "NEEDS: Salesforce problems / current system pain points",
                },
            ],
        },
        {
            "kicker": "SALESFORCE VALUE",
            "title": "Value Rev.io Is Introducing",
            "sections": [
                {
                    "heading": "Salesforce Value",
                    "items": [value],
                    "missing": "NEEDS: Salesforce value from brief",
                },
            ],
        },
        {
            "kicker": "SALESFORCE SOLUTIONS",
            "title": "Salesforce Solutions",
            "sections": [
                {
                    "heading": "Salesforce Solutions",
                    "items": salesforce_solutions,
                    "missing": "NEEDS: Salesforce solutions from brief",
                },
            ],
        },
    ]


def build_existing_template_brief_slides(config: dict) -> dict[int, dict]:
    slides = build_brief_slides(config)
    issue_sections = slides[0]["sections"]
    value_section = slides[1]["sections"][0]
    solution_section = slides[2]["sections"][0]

    issue_values: list[str] = []
    for section in issue_sections:
        issue_values.extend(section["items"])
    issue_bullets = presentation_bullets(issue_values, limit=4, max_length=82)

    value_bullets = presentation_bullets(value_section["items"], limit=1, max_length=82)
    solution_bullets = presentation_bullets(solution_section["items"], limit=3, max_length=78)
    value_solution_bullets = value_bullets + solution_bullets

    return {
        4: {
            "heading": "Business Issues & Current Pain Points",
            "items": issue_bullets,
            "missing": "NEEDS: Salesforce business issues and current pain points",
        },
        5: {
            "heading": "Rev.io Value & Solutions",
            "items": value_solution_bullets,
            "missing": "NEEDS: Salesforce value and solutions",
        },
    }


def qname(tag: str) -> str:
    prefix, local = tag.split(":", 1)
    return f"{{{NS[prefix]}}}{local}"


def rel_qname(local: str) -> str:
    return f"{{{RELS_NS}}}{local}"


def ensure_run_properties(run: ET.Element) -> ET.Element:
    rpr = run.find("a:rPr", NS)
    if rpr is None:
        rpr = ET.Element(qname("a:rPr"))
        run.insert(0, rpr)
    return rpr


def set_run_highlight(run: ET.Element, enabled: bool) -> None:
    rpr = ensure_run_properties(run)
    for highlight in list(rpr.findall("a:highlight", NS)):
        rpr.remove(highlight)
    if not enabled:
        return
    highlight = ET.SubElement(rpr, qname("a:highlight"))
    ET.SubElement(highlight, qname("a:srgbClr"), {"val": GREEN_HIGHLIGHT})


def set_run_font_color(run: ET.Element, color: str) -> None:
    rpr = ensure_run_properties(run)
    for fill in list(rpr.findall("a:solidFill", NS)):
        rpr.remove(fill)
    fill = ET.SubElement(rpr, qname("a:solidFill"))
    ET.SubElement(fill, qname("a:srgbClr"), {"val": color})


def set_run_font_size(run: ET.Element, size: int) -> None:
    rpr = ensure_run_properties(run)
    rpr.set("sz", str(size))


def set_run_bold(run: ET.Element, enabled: bool) -> None:
    rpr = ensure_run_properties(run)
    if enabled:
        rpr.set("b", "1")
    elif "b" in rpr.attrib:
        del rpr.attrib["b"]


def set_run_font_face(run: ET.Element, typeface: str = GENERATED_FONT) -> None:
    rpr = ensure_run_properties(run)
    for tag in ["a:latin", "a:ea", "a:cs"]:
        for child in list(rpr.findall(tag, NS)):
            rpr.remove(child)
    ET.SubElement(rpr, qname("a:latin"), {"typeface": typeface})
    ET.SubElement(rpr, qname("a:ea"), {"typeface": typeface})
    ET.SubElement(rpr, qname("a:cs"), {"typeface": typeface})


def make_run(
    text: str,
    *,
    color: str | None = None,
    size: int | None = None,
    bold: bool = False,
    highlight: bool = False,
    font: str | None = None,
) -> ET.Element:
    run = ET.Element(qname("a:r"))
    rpr = ET.SubElement(run, qname("a:rPr"), {"lang": "en-US"})
    if font:
        ET.SubElement(rpr, qname("a:latin"), {"typeface": font})
        ET.SubElement(rpr, qname("a:ea"), {"typeface": font})
        ET.SubElement(rpr, qname("a:cs"), {"typeface": font})
    if size is not None:
        rpr.set("sz", str(size))
    if bold:
        rpr.set("b", "1")
    if color:
        fill = ET.SubElement(rpr, qname("a:solidFill"))
        ET.SubElement(fill, qname("a:srgbClr"), {"val": color})
    if highlight:
        highlight_el = ET.SubElement(rpr, qname("a:highlight"))
        ET.SubElement(highlight_el, qname("a:srgbClr"), {"val": GREEN_HIGHLIGHT})
    ET.SubElement(run, qname("a:t")).text = text
    return run


def make_paragraph(runs: list[ET.Element], *, align: str | None = None) -> ET.Element:
    paragraph = ET.Element(qname("a:p"))
    if align:
        ppr = ET.SubElement(paragraph, qname("a:pPr"), {"algn": align})
        ET.SubElement(ppr, qname("a:buNone"))
    for run in runs:
        paragraph.append(run)
    end = ET.SubElement(paragraph, qname("a:endParaRPr"), {"lang": "en-US"})
    return paragraph


def set_shape_paragraphs(shape: ET.Element, paragraphs: list[ET.Element], *, anchor: str | None = None) -> None:
    tx_body = shape.find("p:txBody", NS)
    if tx_body is None:
        tx_body = ET.SubElement(shape, qname("p:txBody"))
    for child in list(tx_body):
        tx_body.remove(child)
    body_attrs = {"wrap": "square", "rtlCol": "0"}
    if anchor:
        body_attrs["anchor"] = anchor
    ET.SubElement(tx_body, qname("a:bodyPr"), body_attrs)
    ET.SubElement(tx_body, qname("a:lstStyle"))
    for paragraph in paragraphs:
        tx_body.append(paragraph)


def shape_id(shape: ET.Element) -> str | None:
    nv = shape.find("p:nvSpPr/p:cNvPr", NS)
    return nv.get("id") if nv is not None else None


def find_shape_by_id(root: ET.Element, wanted_id: str) -> ET.Element | None:
    for shape in root.findall(".//p:sp", NS):
        if shape_id(shape) == wanted_id:
            return shape
    return None


def remove_shape_by_id(root: ET.Element, wanted_id: str) -> bool:
    for parent in root.iter():
        for child in list(parent):
            if child.tag == qname("p:sp") and shape_id(child) == wanted_id:
                parent.remove(child)
                return True
    return False


def set_shape_geometry(shape: ET.Element, *, x: int | None = None, y: int | None = None, cx: int | None = None, cy: int | None = None) -> None:
    xfrm = shape.find("p:spPr/a:xfrm", NS)
    if xfrm is None:
        return
    off = xfrm.find("a:off", NS)
    ext = xfrm.find("a:ext", NS)
    if off is not None:
        if x is not None:
            off.set("x", str(x))
        if y is not None:
            off.set("y", str(y))
    if ext is not None:
        if cx is not None:
            ext.set("cx", str(cx))
        if cy is not None:
            ext.set("cy", str(cy))


def set_shape_fill(shape: ET.Element, color: str | None) -> None:
    shape_props = shape.find("p:spPr", NS)
    if shape_props is None:
        return
    for tag in ["a:noFill", "a:solidFill"]:
        for child in list(shape_props.findall(tag, NS)):
            shape_props.remove(child)
    if color is None:
        ET.SubElement(shape_props, qname("a:noFill"))
        return
    fill = ET.Element(qname("a:solidFill"))
    ET.SubElement(fill, qname("a:srgbClr"), {"val": color})
    insert_at = 0
    for index, child in enumerate(list(shape_props)):
        if child.tag == qname("a:prstGeom"):
            insert_at = index + 1
    shape_props.insert(insert_at, fill)


def set_shape_no_line(shape: ET.Element) -> None:
    shape_props = shape.find("p:spPr", NS)
    if shape_props is None:
        return
    for line in list(shape_props.findall("a:ln", NS)):
        shape_props.remove(line)
    line = ET.SubElement(shape_props, qname("a:ln"))
    ET.SubElement(line, qname("a:noFill"))


def set_shape_line_color(shape: ET.Element, color: str) -> None:
    shape_props = shape.find("p:spPr", NS)
    if shape_props is None:
        return
    for line in list(shape_props.findall("a:ln", NS)):
        shape_props.remove(line)
    line = ET.SubElement(shape_props, qname("a:ln"), {"w": "12700"})
    fill = ET.SubElement(line, qname("a:solidFill"))
    ET.SubElement(fill, qname("a:srgbClr"), {"val": color})


def apply_missing_box_style(shape: ET.Element) -> None:
    set_shape_fill(shape, GREEN_HIGHLIGHT)
    set_shape_no_line(shape)


def replacement_font_size(slide_number: int, replacement: Replacement) -> int | None:
    length = len(replacement.output)
    if slide_number == 3 and length > 75:
        return 900
    if slide_number == 3 and length > 55:
        return 1000
    if slide_number == 1 and replacement.missing:
        return 1200
    if slide_number == 4 and length > 45:
        return 1000
    return None


def apply_original_spacing(original: str, replacement: str) -> str:
    leading = re.match(r"^\s*", original).group(0)
    trailing = re.search(r"\s*$", original).group(0)
    return f"{leading}{replacement}{trailing}"


def replace_slide_text(
    xml_bytes: bytes,
    replacements: list[Replacement],
    slide_number: int,
    existing_brief_slide: dict | None = None,
) -> tuple[bytes, int]:
    root = ET.fromstring(xml_bytes)
    changed = 0
    parents = {child: parent for parent in root.iter() for child in parent}

    for node in root.findall(".//a:t", NS):
        if node.text is None:
            continue
        original = node.text
        replacement = next(
            (item for item in replacements if item.old == original or item.old == original.strip()),
            None,
        )
        if replacement is not None and apply_original_spacing(original, replacement.output) != original:
            node.text = apply_original_spacing(original, replacement.output)
            run = parents.get(node)
            if run is not None and run.tag == qname("a:r"):
                font_size = replacement_font_size(slide_number, replacement)
                if font_size is not None:
                    set_run_font_size(run, font_size)
                if replacement.missing:
                    set_run_font_color(run, GREEN_TEXT)
                elif replacement.selected is True:
                    set_run_font_color(run, GREEN_TEXT)
                elif replacement.selected is False:
                    set_run_font_color(run, MUTED_TEXT)
                set_run_highlight(run, replacement.missing)
            changed += 1

    changed += patch_shape_aware_slide(root, replacements, slide_number)
    if existing_brief_slide is not None:
        changed += patch_existing_template_brief_slide(root, existing_brief_slide)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True), changed


def patch_title_slide(root: ET.Element, replacements: list[Replacement]) -> int:
    changed = 0
    client = next((item for item in replacements if item.label == "Client name"), None)
    kickoff = next((item for item in replacements if item.label == "Kickoff date"), None)
    title_shape = find_shape_by_id(root, "5")
    if title_shape is not None and client is not None:
        set_shape_geometry(title_shape, cy=640000)
        set_shape_paragraphs(
            title_shape,
            [
                make_paragraph([make_run(client.output, color=WHITE_TEXT, size=1700)], align="l"),
                make_paragraph([make_run("Onboarding Kick-off Call", color=WHITE_TEXT, size=1800)], align="l"),
            ],
            anchor="ctr",
        )
        changed += 1
    date_shape = find_shape_by_id(root, "7")
    if date_shape is not None and kickoff is not None:
        set_shape_geometry(date_shape, y=2580000, cy=360000)
        if kickoff.missing:
            apply_missing_box_style(date_shape)
        set_shape_paragraphs(
            date_shape,
            [
                make_paragraph(
                    [
                        make_run(
                            kickoff.output,
                            color=DARK_TEXT if kickoff.missing else WHITE_TEXT,
                            size=1300 if kickoff.missing else 1500,
                            bold=kickoff.missing,
                            highlight=kickoff.missing,
                        )
                    ],
                    align="l",
                )
            ],
            anchor="ctr",
        )
        changed += 1
    return changed


def patch_recurring_fees(root: ET.Element, replacements: list[Replacement]) -> int:
    fees_shape = find_shape_by_id(root, "20")
    if fees_shape is None:
        return 0
    by_label = {item.label: item for item in replacements}
    standard_qty = by_label["Standard license count"]
    standard_price = by_label["Standard license price"]
    field_qty = by_label["Field license count"]
    field_price = by_label["Field license price"]

    def value_run(item: Replacement) -> ET.Element:
        return make_run(
            item.output,
            color=GREEN_TEXT if item.missing else WHITE_TEXT,
            size=1150,
            highlight=item.missing,
        )

    label = lambda text: make_run(text, color=WHITE_TEXT, size=1150)
    set_shape_geometry(fees_shape, cy=700000)
    set_shape_paragraphs(
        fees_shape,
        [
            make_paragraph(
                [
                    label("Standard Licenses: "),
                    value_run(standard_qty),
                    label(" at $"),
                    value_run(standard_price),
                    label(" per seat"),
                ]
            ),
            make_paragraph(
                [
                    label("Field Licenses: "),
                    value_run(field_qty),
                    label(" at $"),
                    value_run(field_price),
                    label(" per seat"),
                ]
            ),
        ],
    )
    return 1


def patch_billing_start_missing_box(root: ET.Element, replacements: list[Replacement]) -> int:
    billing_start = next((item for item in replacements if item.label == "Billing start date"), None)
    shape = find_shape_by_id(root, "23")
    if shape is None or billing_start is None or not billing_start.missing:
        return 0
    apply_missing_box_style(shape)
    set_shape_paragraphs(
        shape,
        [
            make_paragraph(
                [
                    make_run(
                        billing_start.output,
                        color=DARK_TEXT,
                        size=1300,
                        bold=True,
                        highlight=True,
                    )
                ]
            )
        ],
        anchor="ctr",
    )
    return 1


def patch_contract_only_slide(root: ET.Element) -> int:
    changed = 0
    title_shape = find_shape_by_id(root, "4")
    if title_shape is not None:
        set_shape_paragraphs(
            title_shape,
            [make_paragraph([make_run("Contract Specifics", color=WHITE_TEXT, size=2800)], align="l")],
            anchor="ctr",
        )
        changed += 1
    for old_shape_id in ["7", "8", "11", "12"]:
        if remove_shape_by_id(root, old_shape_id):
            changed += 1
    return changed


def patch_instance_url_missing_box(root: ET.Element, replacements: list[Replacement]) -> int:
    instance = next((item for item in replacements if item.label == "Instance URL"), None)
    shape = find_shape_by_id(root, "114")
    if shape is None or instance is None or not instance.missing:
        return 0
    apply_missing_box_style(shape)
    set_shape_paragraphs(
        shape,
        [
            make_paragraph(
                [
                    make_run("Instance URL:  ", color=DARK_TEXT, size=1400, bold=True),
                    make_run(
                        instance.output,
                        color=DARK_TEXT,
                        size=1400,
                        bold=True,
                        highlight=True,
                    ),
                ]
            )
        ],
        anchor="ctr",
    )
    return 1


def patch_module_checkboxes(root: ET.Element, replacements: list[Replacement]) -> int:
    modules = [item for item in replacements if item.selected is not None]
    checkbox_by_label = {
        "Quoting": "119",
        "Inventory": "121",
        "Project Management": "123",
        "Mobile App": "125",
    }
    changed = 0
    for item in modules:
        checkbox = find_shape_by_id(root, checkbox_by_label[item.old])
        if checkbox is not None:
            set_shape_paragraphs(
                checkbox,
                [
                    make_paragraph(
                        [
                            make_run(
                                "\u2713" if item.selected else "",
                                color=GREEN_TEXT,
                                size=1500,
                                bold=True,
                            )
                        ],
                        align="ctr",
                    )
                ],
                anchor="ctr",
            )
            changed += 1
        label_shape_id = {
            "Quoting": "120",
            "Inventory": "122",
            "Project Management": "124",
            "Mobile App": "126",
        }[item.old]
        label_shape = find_shape_by_id(root, label_shape_id)
        if label_shape is not None:
            set_shape_paragraphs(
                label_shape,
                [
                    make_paragraph(
                        [
                            make_run(
                                item.old,
                                color=WHITE_TEXT if item.selected else MUTED_TEXT,
                                size=1200,
                            )
                        ]
                    )
                ],
                anchor="ctr",
            )
            changed += 1
    return changed


def patch_shape_aware_slide(root: ET.Element, replacements: list[Replacement], slide_number: int) -> int:
    if slide_number == 1:
        return patch_title_slide(root, replacements)
    if slide_number == 3:
        return (
            patch_recurring_fees(root, replacements)
            + patch_billing_start_missing_box(root, replacements)
        )
    if slide_number in {4, 6}:
        return patch_module_checkboxes(root, replacements) + patch_instance_url_missing_box(root, replacements)
    return 0


def missing_text(text: str) -> bool:
    return text.startswith("NEEDS:")


def bullet_paragraph(text: str, *, size: int = 1150) -> ET.Element:
    if missing_text(text):
        return make_paragraph([
            make_run(text, color=DARK_TEXT, size=size, bold=True, highlight=True)
        ])
    return make_paragraph([
        make_run("\u2022 ", color=WHITE_TEXT, size=size, bold=True),
        make_run(text, color=WHITE_TEXT, size=size),
    ])


def section_paragraph(text: str) -> ET.Element:
    return make_paragraph([make_run(text, color=WHITE_TEXT, size=1350, bold=True)])


def template_section_paragraph(text: str) -> ET.Element:
    return make_paragraph([make_run(text, color=WHITE_TEXT, size=1100, bold=True, font=GENERATED_FONT)])


def template_bullet_paragraph(text: str, *, size: int = 1000) -> ET.Element:
    if missing_text(text):
        return make_paragraph([
            make_run(text, color=TEMPLATE_BODY_TEXT, size=size, bold=True, highlight=True, font=GENERATED_FONT)
        ])
    return make_paragraph([
        make_run("\u2022 ", color=TEMPLATE_BODY_TEXT, size=size, bold=True, font=GENERATED_FONT),
        make_run(text, color=TEMPLATE_BODY_TEXT, size=size, font=GENERATED_FONT),
    ])


def patch_brief_slide(base_slide_bytes: bytes, slide_def: dict) -> bytes:
    root = ET.fromstring(base_slide_bytes)

    title_shape = find_shape_by_id(root, "4")
    if title_shape is not None:
        set_shape_geometry(title_shape, x=446820, y=452855, cx=7600000, cy=620000)
        set_shape_paragraphs(
            title_shape,
            [make_paragraph([make_run(slide_def["title"], color=WHITE_TEXT, size=2500)], align="l")],
            anchor="ctr",
        )

    kicker_shape = find_shape_by_id(root, "40")
    if kicker_shape is not None:
        set_shape_paragraphs(
            kicker_shape,
            [make_paragraph([make_run(slide_def["kicker"], color=WHITE_TEXT, size=1250)], align="l")],
            anchor="ctr",
        )

    sections = slide_def["sections"]
    layout_by_count = {
        1: [("7", "8", 548640, 1600000, 7950000, 500000, 640080, 2250000, 7750000, 1900000)],
        3: [
            ("7", "8", 548640, 1450000, 7950000, 330000, 640080, 1880000, 7750000, 760000),
            ("11", "12", 548640, 2770000, 7950000, 330000, 640080, 3200000, 7750000, 760000),
            ("15", "17", 548640, 4090000, 7950000, 330000, 640080, 4520000, 7750000, 760000),
        ],
    }
    layout = layout_by_count.get(len(sections), layout_by_count[1])
    section_shape_ids = set()
    for index, section in enumerate(sections):
        heading_id, body_id, hx, hy, hcx, hcy, bx, by, bcx, bcy = layout[index]
        section_shape_ids.update({heading_id, body_id})
        heading_shape = find_shape_by_id(root, heading_id)
        body_shape = find_shape_by_id(root, body_id)
        if heading_shape is not None:
            set_shape_geometry(heading_shape, x=hx, y=hy, cx=hcx, cy=hcy)
            set_shape_fill(heading_shape, SECTION_BLUE)
            set_shape_line_color(heading_shape, SECTION_BLUE)
            set_shape_paragraphs(heading_shape, [section_paragraph(section["heading"])], anchor="ctr")
        if body_shape is not None:
            set_shape_geometry(body_shape, x=bx, y=by, cx=bcx, cy=bcy)
            items = [str(item).strip() for item in section["items"] if str(item).strip()]
            if not items:
                items = [section["missing"]]
                apply_missing_box_style(body_shape)
            else:
                set_shape_fill(body_shape, BODY_BLUE)
                set_shape_line_color(body_shape, BODY_BLUE)
            paragraph_size = 1200 if len(items) <= 2 else 1050
            set_shape_paragraphs(
                body_shape,
                [bullet_paragraph(item, size=paragraph_size) for item in items],
                anchor="ctr",
            )

    for old_shape_id in ["16", "19", "20", "22", "23"]:
        remove_shape_by_id(root, old_shape_id)
    for reusable_id in ["7", "8", "11", "12", "15", "17"]:
        if reusable_id not in section_shape_ids:
            remove_shape_by_id(root, reusable_id)

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def patch_existing_template_brief_slide(root: ET.Element, slide_def: dict) -> int:
    heading_shape = find_shape_by_id(root, "7")
    body_shape = find_shape_by_id(root, "8")
    if heading_shape is None or body_shape is None:
        return 0

    items = [str(item).strip() for item in slide_def["items"] if str(item).strip()]
    if not items:
        items = [slide_def["missing"]]
    set_shape_paragraphs(heading_shape, [template_section_paragraph(slide_def["heading"])], anchor="ctr")

    set_shape_paragraphs(
        body_shape,
        [template_bullet_paragraph(item, size=1200) for item in items],
        anchor="ctr",
    )
    return 2


def source_entry(config: dict, target: str) -> dict:
    return (config.get("_sourceFields") or {}).get(target, {})


def source_note_line(config: dict, target: str, label: str) -> str:
    entry = source_entry(config, target)
    source = entry.get("source") or "(no source field found)"
    value = entry.get("value")
    if isinstance(value, list):
        value_text = "; ".join(str(item) for item in value if str(item).strip())
    else:
        value_text = str(value or "").strip()
    if not value_text:
        value_text = "(missing)"
    return f"{label}: source field `{source}`; context/value: {value_text}"


def notes_for_slide(config: dict, slide_number: int) -> list[str]:
    lines_by_slide = {
        1: [
            source_note_line(config, "clientName", "Client name"),
            source_note_line(config, "kickoffDate", "Kickoff date"),
        ],
        3: [
            source_note_line(config, "packageDetails", "Package details"),
            source_note_line(config, "standardLicenseCount", "Standard license count"),
            source_note_line(config, "standardLicensePrice", "Standard license price"),
            source_note_line(config, "fieldLicenseCount", "Field license count"),
            source_note_line(config, "fieldLicensePrice", "Field license price"),
            source_note_line(config, "billingStartDate", "Billing start date"),
        ],
        4: [
            source_note_line(config, "salesforceBusinessIssuesDetails", "Salesforce Business Issues Details"),
            source_note_line(config, "salesforceBusinessIssuePickList", "Salesforce Business Issue Pick List"),
            source_note_line(config, "salesforceProblems", "Salesforce Problems"),
            source_note_line(config, "motivations", "Fallback motivation/pain-point context"),
        ],
        5: [
            source_note_line(config, "salesforceValue", "Salesforce Value"),
            source_note_line(config, "salesforceSolutions", "Salesforce Solutions"),
            source_note_line(config, "expectedValue", "Fallback expected value"),
            source_note_line(config, "solutions", "Fallback solution context"),
        ],
        6: [
            source_note_line(config, "instanceUrl", "Instance URL"),
            source_note_line(config, "priorityModules", "Priority modules"),
            source_note_line(config, "integrations", "Integrations"),
        ],
        13: [
            source_note_line(config, "nextSteps", "Next steps"),
        ],
    }
    lines = lines_by_slide.get(slide_number, [])
    if not lines:
        return []
    return ["Generated source context:", *lines]


def notes_target_for_slide_rels(rels_bytes: bytes) -> str:
    root = ET.fromstring(rels_bytes)
    for rel in root.findall("rel:Relationship", {"rel": RELS_NS}):
        if rel.get("Type", "").endswith("/notesSlide"):
            target = rel.get("Target", "")
            if target.startswith("../"):
                return f"ppt/{target[3:]}"
            if target.startswith("/"):
                return target[1:]
            return f"ppt/slides/{target}"
    return ""


def build_notes_map(source: zipfile.ZipFile, config: dict) -> dict[str, list[str]]:
    notes: dict[str, list[str]] = {}
    for slide_number in [1, 3, 4, 5, 6, 13]:
        rels_path = f"ppt/slides/_rels/slide{slide_number}.xml.rels"
        if rels_path not in source.namelist():
            continue
        target = notes_target_for_slide_rels(source.read(rels_path))
        lines = notes_for_slide(config, slide_number)
        if target and lines:
            notes[target] = lines
    return notes


def patch_notes_slide(notes_bytes: bytes, lines: list[str]) -> bytes:
    root = ET.fromstring(notes_bytes)
    notes_shape = find_shape_by_id(root, "3")
    if notes_shape is None:
        return notes_bytes
    paragraphs = [
        make_paragraph([make_run(lines[0], color=DARK_TEXT, size=1000, bold=True)])
    ]
    for line in lines[1:]:
        paragraphs.append(make_paragraph([make_run(line, color=DARK_TEXT, size=800)]))
    set_shape_paragraphs(notes_shape, paragraphs)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def logo_source(config: dict) -> str:
    return first_present(config, ["logoPath", "logoUrl"])


def load_logo_bytes(source: str) -> tuple[bytes, str]:
    if not source:
        return b"", ""
    if re.match(r"^https?://", source, re.I):
        with urllib.request.urlopen(source, timeout=20) as response:
            return response.read(), ".png"
    path = Path(source)
    if not path.is_absolute():
        path = Path.cwd() / path
    data = path.read_bytes()
    suffix = path.suffix.lower() or ".png"
    if suffix not in {".png", ".jpg", ".jpeg"}:
        raise ValueError(f"Unsupported logo file type: {path}")
    return data, suffix


def next_relationship_id(root: ET.Element) -> str:
    max_id = 0
    for rel in root.findall("rel:Relationship", {"rel": RELS_NS}):
        value = rel.get("Id", "")
        match = re.fullmatch(r"rId(\d+)", value)
        if match:
            max_id = max(max_id, int(match.group(1)))
    return f"rId{max_id + 1}"


def add_logo_relationship(rels_bytes: bytes, media_name: str) -> tuple[bytes, str]:
    root = ET.fromstring(rels_bytes)
    relationship_id = next_relationship_id(root)
    ET.SubElement(
        root,
        rel_qname("Relationship"),
        {
            "Id": relationship_id,
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
            "Target": f"../media/{media_name}",
        },
    )
    return ET.tostring(root, encoding="utf-8", xml_declaration=True), relationship_id


def max_shape_id(root: ET.Element) -> int:
    max_id = 0
    for c_nv_pr in root.findall(".//p:cNvPr", NS):
        try:
            max_id = max(max_id, int(c_nv_pr.get("id", "0")))
        except ValueError:
            continue
    return max_id


def picture_shape(relationship_id: str, shape_id_value: int) -> ET.Element:
    pic = ET.Element(qname("p:pic"))
    nv_pic_pr = ET.SubElement(pic, qname("p:nvPicPr"))
    ET.SubElement(
        nv_pic_pr,
        qname("p:cNvPr"),
        {
            "id": str(shape_id_value),
            "name": "Client Logo",
            "descr": "Client logo",
        },
    )
    c_nv_pic_pr = ET.SubElement(nv_pic_pr, qname("p:cNvPicPr"))
    ET.SubElement(c_nv_pic_pr, qname("a:picLocks"), {"noChangeAspect": "1"})
    ET.SubElement(nv_pic_pr, qname("p:nvPr"))

    blip_fill = ET.SubElement(pic, qname("p:blipFill"))
    ET.SubElement(blip_fill, qname("a:blip"), {qname("r:embed"): relationship_id})
    stretch = ET.SubElement(blip_fill, qname("a:stretch"))
    ET.SubElement(stretch, qname("a:fillRect"))

    sp_pr = ET.SubElement(pic, qname("p:spPr"))
    xfrm = ET.SubElement(sp_pr, qname("a:xfrm"))
    # Right-aligned above the title divider bar, below the Rev.io logo.
    ET.SubElement(xfrm, qname("a:off"), {"x": "4733254", "y": "991576"})
    ET.SubElement(xfrm, qname("a:ext"), {"cx": "1508760", "cy": "452628"})
    prst = ET.SubElement(sp_pr, qname("a:prstGeom"), {"prst": "rect"})
    ET.SubElement(prst, qname("a:avLst"))
    return pic


def add_logo_to_slide(slide_bytes: bytes, relationship_id: str) -> bytes:
    root = ET.fromstring(slide_bytes)
    tree = root.find("p:cSld/p:spTree", NS)
    if tree is None:
        return slide_bytes
    shape_id_value = max_shape_id(root) + 1
    pic = picture_shape(relationship_id, shape_id_value)
    insert_at = len(tree)
    for index, child in enumerate(list(tree)):
        if child.tag == qname("p:extLst"):
            insert_at = index
            break
    tree.insert(insert_at, pic)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def max_slide_number(names: list[str]) -> int:
    max_number = 0
    for name in names:
        match = re.fullmatch(r"ppt/slides/slide(\d+)\.xml", name)
        if match:
            max_number = max(max_number, int(match.group(1)))
    return max_number


def strip_notes_slide_relationship(rels_bytes: bytes) -> bytes:
    root = ET.fromstring(rels_bytes)
    for rel in list(root.findall("rel:Relationship", {"rel": RELS_NS})):
        if rel.get("Type", "").endswith("/notesSlide"):
            root.remove(rel)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def update_content_types(content_types_bytes: bytes, slide_numbers: list[int]) -> bytes:
    root = ET.fromstring(content_types_bytes)
    existing = {
        override.get("PartName")
        for override in root.findall(f"{{{CONTENT_TYPES_NS}}}Override")
    }
    for slide_number in slide_numbers:
        part_name = f"/ppt/slides/slide{slide_number}.xml"
        if part_name not in existing:
            ET.SubElement(
                root,
                f"{{{CONTENT_TYPES_NS}}}Override",
                {"PartName": part_name, "ContentType": SLIDE_CONTENT_TYPE},
            )
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def update_presentation_rels(rels_bytes: bytes, slide_numbers: list[int]) -> tuple[bytes, list[str]]:
    root = ET.fromstring(rels_bytes)
    max_id = 0
    for rel in root.findall("rel:Relationship", {"rel": RELS_NS}):
        match = re.fullmatch(r"rId(\d+)", rel.get("Id", ""))
        if match:
            max_id = max(max_id, int(match.group(1)))
    relationship_ids = []
    for slide_number in slide_numbers:
        max_id += 1
        relationship_id = f"rId{max_id}"
        ET.SubElement(
            root,
            rel_qname("Relationship"),
            {
                "Id": relationship_id,
                "Type": SLIDE_REL_TYPE,
                "Target": f"slides/slide{slide_number}.xml",
            },
        )
        relationship_ids.append(relationship_id)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True), relationship_ids


def update_presentation_xml(presentation_bytes: bytes, relationship_ids: list[str]) -> bytes:
    root = ET.fromstring(presentation_bytes)
    slide_list = root.find("p:sldIdLst", NS)
    if slide_list is None:
        return presentation_bytes
    max_id = 255
    for slide_id in slide_list.findall("p:sldId", NS):
        try:
            max_id = max(max_id, int(slide_id.get("id", "0")))
        except ValueError:
            continue
    insert_at = min(3, len(list(slide_list)))
    for relationship_id in relationship_ids:
        max_id += 1
        slide_id = ET.Element(qname("p:sldId"), {"id": str(max_id), qname("r:id"): relationship_id})
        slide_list.insert(insert_at, slide_id)
        insert_at += 1
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def update_app_slide_count(app_bytes: bytes, add_count: int) -> bytes:
    root = ET.fromstring(app_bytes)
    slides = root.find(f"{{{EXTENDED_PROPS_NS}}}Slides")
    if slides is not None and slides.text and slides.text.isdigit():
        slides.text = str(int(slides.text) + add_count)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def slide_contains(source: zipfile.ZipFile, slide_number: int, text: str) -> bool:
    path = f"ppt/slides/slide{slide_number}.xml"
    if path not in source.namelist():
        return False
    return text in source.read(path).decode("utf-8", errors="ignore")


def template_has_existing_brief_slides(source: zipfile.ZipFile) -> bool:
    return (
        slide_contains(source, 4, "Motivations for Investment")
        and slide_contains(source, 5, "Rev.io")
        and slide_contains(source, 6, "https://psademo.rev.io")
    )


def write_deck(
    template: Path,
    output: Path,
    config: dict,
    replacements: dict[int, list[Replacement]],
    brief_slides: list[dict],
    existing_brief_slides: dict[int, dict],
    logo: tuple[bytes, str] | None = None,
) -> dict[int, int]:
    output.parent.mkdir(parents=True, exist_ok=True)
    counts: dict[int, int] = {}

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_output = Path(tmp_dir) / output.name
        with zipfile.ZipFile(template, "r") as source, zipfile.ZipFile(
            tmp_output, "w", zipfile.ZIP_DEFLATED
        ) as dest:
            source_names = source.namelist()
            notes_map = build_notes_map(source, config)
            use_existing_brief_slides = template_has_existing_brief_slides(source)
            new_slide_numbers: list[int] = []
            new_slide_rels = b""
            new_slide_xml: list[bytes] = []
            presentation_rels_data = source.read("ppt/_rels/presentation.xml.rels")
            content_types_data = source.read("[Content_Types].xml")
            presentation_data = source.read("ppt/presentation.xml")
            app_data = source.read("docProps/app.xml")
            if not use_existing_brief_slides:
                max_number = max_slide_number(source_names)
                new_slide_numbers = list(range(max_number + 1, max_number + 1 + len(brief_slides)))
                presentation_rels_data, new_relationship_ids = update_presentation_rels(
                    presentation_rels_data,
                    new_slide_numbers,
                )
                content_types_data = update_content_types(content_types_data, new_slide_numbers)
                presentation_data = update_presentation_xml(presentation_data, new_relationship_ids)
                app_data = update_app_slide_count(app_data, len(brief_slides))
                new_slide_rels = strip_notes_slide_relationship(source.read("ppt/slides/_rels/slide3.xml.rels"))
                new_slide_xml = [
                    patch_brief_slide(source.read("ppt/slides/slide3.xml"), slide_def)
                    for slide_def in brief_slides
                ]
            logo_media_name = ""
            logo_relationship_id = ""
            logo_rels_data = None
            if logo is not None:
                suffix = ".jpg" if logo[1] == ".jpeg" else logo[1]
                logo_media_name = f"client-logo{suffix}"
                logo_rels_data, logo_relationship_id = add_logo_relationship(
                    source.read("ppt/slides/_rels/slide1.xml.rels"),
                    logo_media_name,
                )
            for info in source.infolist():
                data = source.read(info.filename)
                if info.filename == "[Content_Types].xml":
                    data = content_types_data
                elif info.filename == "ppt/presentation.xml":
                    data = presentation_data
                elif info.filename == "ppt/_rels/presentation.xml.rels":
                    data = presentation_rels_data
                elif info.filename == "docProps/app.xml":
                    data = app_data
                elif info.filename in notes_map:
                    data = patch_notes_slide(data, notes_map[info.filename])
                if logo_rels_data is not None and info.filename == "ppt/slides/_rels/slide1.xml.rels":
                    data = logo_rels_data
                match = re.fullmatch(r"ppt/slides/slide(\d+)\.xml", info.filename)
                if match:
                    slide_number = int(match.group(1))
                    if slide_number in replacements:
                        data, changed = replace_slide_text(data, replacements[slide_number], slide_number)
                        counts[slide_number] = changed
                    elif use_existing_brief_slides and slide_number in existing_brief_slides:
                        data, changed = replace_slide_text(
                            data,
                            [],
                            slide_number,
                            existing_brief_slide=existing_brief_slides[slide_number],
                        )
                        counts[slide_number] = changed
                    if logo is not None and slide_number == 1:
                        data = add_logo_to_slide(data, logo_relationship_id)
                dest.writestr(info, data)
            for slide_number, slide_xml in zip(new_slide_numbers, new_slide_xml):
                dest.writestr(f"ppt/slides/slide{slide_number}.xml", slide_xml)
                dest.writestr(f"ppt/slides/_rels/slide{slide_number}.xml.rels", new_slide_rels)
            if logo is not None:
                dest.writestr(f"ppt/media/{logo_media_name}", logo[0])

        shutil.move(str(tmp_output), output)

    return counts


def field_report(
    config: dict,
    replacements: dict[int, list[Replacement]],
    brief_slides: list[dict],
    existing_brief_slides: dict[int, dict] | None = None,
) -> dict:
    fields = []
    for slide_number, items in replacements.items():
        for item in items:
            fields.append({
                "slide": slide_number,
                "label": item.label,
                "templateText": item.old,
                "value": "" if item.missing else item.output,
                "renderedText": item.output,
                "status": "missing" if item.missing else "complete",
                "highlighted": item.missing,
            })
    if existing_brief_slides:
        for slide_number, slide_def in sorted(existing_brief_slides.items()):
            items = [str(item).strip() for item in slide_def["items"] if str(item).strip()]
            missing = not items
            fields.append({
                "slide": slide_number,
                "label": slide_def["heading"],
                "templateText": slide_def["heading"],
                "value": "" if missing else "\n".join(items),
                "renderedText": slide_def["missing"] if missing else "\n".join(items),
                "status": "missing" if missing else "complete",
                "highlighted": missing,
            })
    else:
        inserted_slide_start = 4
        for offset, slide_def in enumerate(brief_slides):
            slide_number = inserted_slide_start + offset
            for section in slide_def["sections"]:
                items = [str(item).strip() for item in section["items"] if str(item).strip()]
                missing = not items
                fields.append({
                    "slide": slide_number,
                    "label": section["heading"],
                    "templateText": section["heading"],
                    "value": "" if missing else "\n".join(items),
                    "renderedText": section["missing"] if missing else "\n".join(items),
                    "status": "missing" if missing else "complete",
                    "highlighted": missing,
                })
    missing = [field for field in fields if field["status"] == "missing"]
    complete = [field for field in fields if field["status"] == "complete"]
    return {
        "clientName": str(config.get("clientName", "")).strip(),
        "summary": {
            "totalFields": len(fields),
            "completeFields": len(complete),
            "missingFields": len(missing),
        },
        "missingFields": missing,
        "completeFields": complete,
        "fields": fields,
    }


def write_report(path: Path, report: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    if not args.template.exists():
        print(f"Template not found: {args.template}", file=sys.stderr)
        return 1
    if not args.config.exists():
        print(f"Config not found: {args.config}", file=sys.stderr)
        return 1

    with args.config.open("r", encoding="utf-8") as handle:
        config = json.load(handle)

    replacements = build_replacements(config)
    brief_slides = build_brief_slides(config)
    existing_brief_slides = build_existing_template_brief_slides(config)
    output = output_path_for(config, args.output)
    report = field_report(config, replacements, brief_slides, existing_brief_slides)
    logo = None
    logo_ref = logo_source(config)
    if logo_ref:
        logo = load_logo_bytes(logo_ref)

    print("Planned replacements:")
    for slide_number, items in replacements.items():
        complete = [item for item in items if not item.missing]
        missing = [item for item in items if item.missing]
        print(f"  Slide {slide_number}: {len(complete)} complete, {len(missing)} needs input")
        for item in items:
            status = "missing" if item.missing else "complete"
            print(f"    [{status}] {item.old!r} -> {item.output!r}")
    print(f"  Existing brief slide summaries: {len(existing_brief_slides)}")
    for slide_number, slide_def in sorted(existing_brief_slides.items()):
        status = "complete" if slide_def["items"] else "missing"
        print(f"    Slide {slide_number}: {slide_def['heading']} ({status})")

    if args.report_json:
        write_report(args.report_json, report)
        print(f"Wrote field report {args.report_json}")

    if args.dry_run:
        return 0

    counts = write_deck(args.template, output, config, replacements, brief_slides, existing_brief_slides, logo=logo)
    print(f"Wrote {output}")
    for slide_number in sorted(replacements):
        print(f"  Slide {slide_number}: {counts.get(slide_number, 0)} text node(s) changed")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
