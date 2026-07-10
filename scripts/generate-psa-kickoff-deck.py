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

DEFAULT_TEMPLATE = Path("templates/revio-psa-onboarding-kickoff-template.pptx")
GREEN_TEXT = "6EBE4F"
GREEN_HIGHLIGHT = "00FF00"
WHITE_TEXT = "FFFFFF"
MUTED_TEXT = "B0B4CC"
DARK_TEXT = "1D3756"


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
    main_buying_motivator = first_present(config, ["mainBuyingMotivator", "buyingMotivator"])
    expected_value = first_present(config, ["expectedValue", "businessOutcome", "value"])
    modules = first_list(config, ["priorityModules", "optionalModules"], expected=4)
    integrations = string_list(config, "integrations")
    motivations = string_list(config, "motivations", expected=2)
    solutions = string_list(config, "solutions", expected=2)
    next_steps = string_list(config, "nextSteps", expected=7)
    motivation_1 = main_buying_motivator or (motivations[0] if len(motivations) > 0 else "")
    motivation_2 = expected_value or (motivations[1] if len(motivations) > 1 else "")
    solution_1 = solutions[0] if len(solutions) > 0 else ""
    solution_2 = solutions[1] if len(solutions) > 1 else expected_value

    replacements: dict[int, list[Replacement]] = {
        1: [
            repl("Customer Name", require_text(config, "clientName"), "Client name"),
            repl("January 30, 2026", require_text(config, "kickoffDate"), "Kickoff date"),
        ],
        3: [
            repl(
                "Using Separate Platforms",
                motivation_1,
                "Main buying motivator",
            ),
            repl(
                "No Way to Track Work Orders/Tickets",
                motivation_2,
                "Expected value / business outcome",
            ),
            repl(
                "Consolidated Platform including Dispatch Board",
                solution_1,
                "Rev.io solution point 1",
            ),
            repl(
                "Centralized Ticketing Management Dashboard",
                solution_2,
                "Rev.io solution point 2",
            ),
            repl("Basic Implementation Package", require_text(config, "packageDetails"), "Package details"),
            compact_missing_repl("6", optional_text(config, "standardLicenseCount", "6"), "Standard license count", "NEEDS: Qty"),
            compact_missing_repl("100", optional_text(config, "standardLicensePrice", "100"), "Standard license price", "NEEDS: Price"),
            compact_missing_repl("17", optional_text(config, "fieldLicenseCount", "17"), "Field license count", "NEEDS: Qty"),
            compact_missing_repl("25", optional_text(config, "fieldLicensePrice", "25"), "Field license price", "NEEDS: Price"),
            compact_missing_repl("02/01/2026", require_text(config, "billingStartDate"), "Billing start date", "NEEDS: Start date"),
        ],
        4: [
            repl("https://psademo.rev.io", require_text(config, "instanceUrl"), "Instance URL"),
            module_repl("Quoting", modules),
            module_repl("Inventory", modules),
            module_repl("Project Management", modules),
            module_repl("Mobile App", modules),
            repl("Acronis, HubSpot, QuickBooks Online", ", ".join(integrations), "Interested integrations"),
        ],
        11: [
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


def make_run(text: str, *, color: str | None = None, size: int | None = None, bold: bool = False, highlight: bool = False) -> ET.Element:
    run = ET.Element(qname("a:r"))
    rpr = ET.SubElement(run, qname("a:rPr"), {"lang": "en-US"})
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


def replace_slide_text(xml_bytes: bytes, replacements: list[Replacement], slide_number: int) -> tuple[bytes, int]:
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
        return patch_recurring_fees(root, replacements) + patch_billing_start_missing_box(root, replacements)
    if slide_number == 4:
        return patch_module_checkboxes(root, replacements) + patch_instance_url_missing_box(root, replacements)
    return 0


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


def write_deck(template: Path, output: Path, replacements: dict[int, list[Replacement]], logo: tuple[bytes, str] | None = None) -> dict[int, int]:
    output.parent.mkdir(parents=True, exist_ok=True)
    counts: dict[int, int] = {}

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_output = Path(tmp_dir) / output.name
        with zipfile.ZipFile(template, "r") as source, zipfile.ZipFile(
            tmp_output, "w", zipfile.ZIP_DEFLATED
        ) as dest:
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
                if logo_rels_data is not None and info.filename == "ppt/slides/_rels/slide1.xml.rels":
                    data = logo_rels_data
                match = re.fullmatch(r"ppt/slides/slide(\d+)\.xml", info.filename)
                if match:
                    slide_number = int(match.group(1))
                    if slide_number in replacements:
                        data, changed = replace_slide_text(data, replacements[slide_number], slide_number)
                        counts[slide_number] = changed
                    if logo is not None and slide_number == 1:
                        data = add_logo_to_slide(data, logo_relationship_id)
                dest.writestr(info, data)
            if logo is not None:
                dest.writestr(f"ppt/media/{logo_media_name}", logo[0])

        shutil.move(str(tmp_output), output)

    return counts


def field_report(config: dict, replacements: dict[int, list[Replacement]]) -> dict:
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
    output = output_path_for(config, args.output)
    report = field_report(config, replacements)
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

    if args.report_json:
        write_report(args.report_json, report)
        print(f"Wrote field report {args.report_json}")

    if args.dry_run:
        return 0

    counts = write_deck(args.template, output, replacements, logo=logo)
    print(f"Wrote {output}")
    for slide_number in sorted(replacements):
        print(f"  Slide {slide_number}: {counts.get(slide_number, 0)} text node(s) changed")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
