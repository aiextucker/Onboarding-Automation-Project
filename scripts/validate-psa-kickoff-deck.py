#!/usr/bin/env python3
"""Validate high-risk formatting in a generated PSA kickoff deck."""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
}

GREEN_TEXT = "6EBE4F"
GREEN_HIGHLIGHT = "00FF00"
DARK_TEXT = "1D3756"
CHECKBOX_SHAPES = {
    "119": "Quoting",
    "121": "Inventory",
    "123": "Project Management",
    "125": "Mobile App",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate PSA kickoff deck formatting.")
    parser.add_argument("deck", type=Path, help="Generated PPTX path.")
    parser.add_argument("--json", type=Path, help="Optional validation report path.")
    return parser.parse_args()


def shape_id(shape: ET.Element) -> str | None:
    nv = shape.find("p:nvSpPr/p:cNvPr", NS)
    return nv.get("id") if nv is not None else None


def text_for(shape: ET.Element) -> str:
    return "".join(text.text or "" for text in shape.findall(".//a:t", NS))


def containing_shape(parents: dict[ET.Element, ET.Element], node: ET.Element) -> ET.Element | None:
    current = node
    while current in parents:
        current = parents[current]
        if current.tag == f"{{{NS['p']}}}sp":
            return current
    return None


def shape_fill(shape: ET.Element | None) -> str | None:
    if shape is None:
        return None
    fill = shape.find("p:spPr/a:solidFill/a:srgbClr", NS)
    return fill.get("val") if fill is not None else None


def run_report(run: ET.Element, slide_number: int, parents: dict[ET.Element, ET.Element]) -> dict | None:
    text = run.find("a:t", NS)
    if text is None or "NEEDS:" not in (text.text or ""):
        return None
    rpr = run.find("a:rPr", NS)
    color = None
    highlight = None
    if rpr is not None:
        color_node = rpr.find("a:solidFill/a:srgbClr", NS)
        if color_node is not None:
            color = color_node.get("val")
        highlight_node = rpr.find("a:highlight/a:srgbClr", NS)
        if highlight_node is not None:
            highlight = highlight_node.get("val")
    parent_shape = containing_shape(parents, run)
    return {
        "slide": slide_number,
        "text": text.text,
        "color": color,
        "highlight": highlight,
        "shapeFill": shape_fill(parent_shape),
    }


def main() -> int:
    args = parse_args()
    errors: list[str] = []
    needs: list[dict] = []
    checkboxes: list[dict] = []
    inline_checkbox_labels: list[dict] = []

    if not args.deck.exists():
        print(f"Deck not found: {args.deck}", file=sys.stderr)
        return 1

    with zipfile.ZipFile(args.deck) as deck:
        bad_member = deck.testzip()
        if bad_member:
            errors.append(f"PPTX zip integrity failed at {bad_member}")

        for slide_number in [1, 3, 4]:
            root = ET.fromstring(deck.read(f"ppt/slides/slide{slide_number}.xml"))
            parents = {child: parent for parent in root.iter() for child in parent}
            for run in root.findall(".//a:r", NS):
                item = run_report(run, slide_number, parents)
                if item is None:
                    continue
                needs.append(item)
                if item["color"] not in {GREEN_TEXT, DARK_TEXT}:
                    errors.append(
                        f"Slide {slide_number} {item['text']!r} has color {item['color']}, expected {GREEN_TEXT} or {DARK_TEXT}"
                    )
                if item["color"] == DARK_TEXT and item["shapeFill"] != GREEN_HIGHLIGHT:
                    errors.append(
                        f"Slide {slide_number} {item['text']!r} uses dark text but containing shape fill is {item['shapeFill']}, expected {GREEN_HIGHLIGHT}"
                    )
                if item["highlight"] != GREEN_HIGHLIGHT:
                    errors.append(
                        f"Slide {slide_number} {item['text']!r} has highlight {item['highlight']}, expected {GREEN_HIGHLIGHT}"
                    )

            if slide_number == 4:
                for shape in root.findall(".//p:sp", NS):
                    sid = shape_id(shape)
                    text = text_for(shape)
                    if sid in CHECKBOX_SHAPES:
                        checkboxes.append({"shapeId": sid, "label": CHECKBOX_SHAPES[sid], "text": text})
                    elif text.startswith(("\u2713 ", "\u2610 ")):
                        inline_checkbox_labels.append({"shapeId": sid, "text": text})

    if inline_checkbox_labels:
        errors.append(f"Inline checkbox label text found: {inline_checkbox_labels}")

    report = {
        "deck": str(args.deck),
        "needs": needs,
        "checkboxes": checkboxes,
        "inlineCheckboxLabels": inline_checkbox_labels,
        "errors": errors,
    }

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
