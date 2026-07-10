#!/usr/bin/env python3
"""Build PSA kickoff deck config from a normalized sales brief/Salesforce payload."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a normalized source payload into PSA kickoff deck JSON."
    )
    parser.add_argument("--source-json", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--report-json", type=Path)
    return parser.parse_args()


def get_path(data: dict[str, Any], path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def first_value(data: dict[str, Any], paths: list[str]) -> tuple[str, str]:
    for path in paths:
        value = get_path(data, path)
        if value is None:
            continue
        if isinstance(value, list):
            items = [str(item).strip() for item in value if str(item).strip()]
            if items:
                return ", ".join(items), path
        else:
            text = str(value).strip()
            if text:
                return text, path
    return "", ""


def first_list(data: dict[str, Any], paths: list[str], limit: int | None = None) -> tuple[list[str], str]:
    for path in paths:
        value = get_path(data, path)
        if not value:
            continue
        if isinstance(value, list):
            items = [str(item).strip() for item in value if str(item).strip()]
        else:
            items = [part.strip() for part in re.split(r"[,;\n]", str(value)) if part.strip()]
        if items:
            return (items[:limit] if limit else items), path
    return [], ""


def map_field(
    data: dict[str, Any],
    report: list[dict[str, Any]],
    target: str,
    paths: list[str],
    default: str = "",
) -> str:
    value, source = first_value(data, paths)
    status = "complete" if value else "missing"
    report.append({
        "target": target,
        "source": source,
        "status": status,
        "value": value,
        "candidateSources": paths,
    })
    return value or default


def map_list(
    data: dict[str, Any],
    report: list[dict[str, Any]],
    target: str,
    paths: list[str],
    limit: int | None = None,
) -> list[str]:
    value, source = first_list(data, paths, limit=limit)
    status = "complete" if value else "missing"
    report.append({
        "target": target,
        "source": source,
        "status": status,
        "value": value,
        "candidateSources": paths,
    })
    return value


def build_config(data: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    fields: list[dict[str, Any]] = []

    client_name = map_field(data, fields, "clientName", [
        "client.name",
        "account.name",
        "companyName",
    ])
    mrr = map_field(data, fields, "mrr", [
        "deal.mrr",
        "opportunity.mrr",
        "mrr",
    ])
    package_details = map_field(data, fields, "packageDetails", [
        "deal.packageDetails",
        "opportunity.packageDetails",
        "packageDetails",
        "package",
    ], default=f"PSA onboarding - {mrr}" if mrr else "TBD - package details")

    config = {
        "clientName": client_name,
        "kickoffDate": map_field(data, fields, "kickoffDate", [
            "deal.kickoffDate",
            "opportunity.kickoffDate",
            "kickoffDate",
        ], default="TBD - kickoff date"),
        "mainBuyingMotivator": map_field(data, fields, "mainBuyingMotivator", [
            "brief.mainBuyingMotivator",
            "brief.buyingMotivator",
            "salesforce.mainBuyingMotivator",
            "mainBuyingMotivator",
            "buyingMotivator",
        ]),
        "expectedValue": map_field(data, fields, "expectedValue", [
            "brief.expectedValue",
            "brief.businessOutcome",
            "salesforce.expectedValue",
            "expectedValue",
            "businessOutcome",
            "value",
        ]),
        "priorityModules": map_list(data, fields, "priorityModules", [
            "brief.priorityModules",
            "brief.modules",
            "salesforce.priorityModules",
            "priorityModules",
            "modules",
        ], limit=4),
        "motivations": map_list(data, fields, "motivations", [
            "brief.motivations",
            "brief.painPoints",
            "salesforce.painPoints",
            "motivations",
            "painPoints",
        ], limit=2),
        "solutions": map_list(data, fields, "solutions", [
            "brief.solutions",
            "salesforce.solutions",
            "solutions",
        ], limit=2),
        "packageDetails": package_details,
        "standardLicenseCount": map_field(data, fields, "standardLicenseCount", [
            "contract.standardLicenseCount",
            "deal.standardLicenseCount",
            "standardLicenseCount",
        ], default="TBD - standard license count"),
        "standardLicensePrice": map_field(data, fields, "standardLicensePrice", [
            "contract.standardLicensePrice",
            "deal.standardLicensePrice",
            "standardLicensePrice",
        ], default="TBD - standard license price"),
        "fieldLicenseCount": map_field(data, fields, "fieldLicenseCount", [
            "contract.fieldLicenseCount",
            "deal.fieldLicenseCount",
            "fieldLicenseCount",
        ], default="TBD - field license count"),
        "fieldLicensePrice": map_field(data, fields, "fieldLicensePrice", [
            "contract.fieldLicensePrice",
            "deal.fieldLicensePrice",
            "fieldLicensePrice",
        ], default="TBD - field license price"),
        "billingStartDate": map_field(data, fields, "billingStartDate", [
            "contract.billingStartDate",
            "deal.billingStartDate",
            "billingStartDate",
            "contract.startDate",
        ], default="TBD - billing start date"),
        "instanceUrl": map_field(data, fields, "instanceUrl", [
            "instance.url",
            "psa.instanceUrl",
            "instanceUrl",
        ], default="TBD - instance URL"),
        "integrations": map_list(data, fields, "integrations", [
            "brief.integrations",
            "salesforce.integrations",
            "integrations",
        ]),
        "nextSteps": map_list(data, fields, "nextSteps", [
            "brief.nextSteps",
            "nextSteps",
            "openItems",
        ], limit=7),
        "logoPath": map_field(data, fields, "logoPath", [
            "brand.logoPath",
            "logoPath",
        ]),
        "logoUrl": map_field(data, fields, "logoUrl", [
            "brand.logoUrl",
            "account.logoUrl",
            "logoUrl",
        ]),
        "logoSourceUrl": map_field(data, fields, "logoSourceUrl", [
            "brand.logoSourceUrl",
            "logoSourceUrl",
        ]),
        "briefUrl": map_field(data, fields, "briefUrl", [
            "links.briefUrl",
            "brief.url",
            "briefUrl",
        ]),
        "notionProjectUrl": map_field(data, fields, "notionProjectUrl", [
            "links.notionProjectUrl",
            "notionProjectUrl",
        ]),
        "orderFormUrl": map_field(data, fields, "orderFormUrl", [
            "links.orderFormUrl",
            "orderFormUrl",
        ]),
    }

    report = {
        "clientName": client_name,
        "summary": {
            "totalTargets": len(fields),
            "completeTargets": sum(1 for field in fields if field["status"] == "complete"),
            "missingTargets": sum(1 for field in fields if field["status"] == "missing"),
        },
        "fields": fields,
        "missingFields": [field for field in fields if field["status"] == "missing"],
    }
    return config, report


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    source = json.loads(args.source_json.read_text(encoding="utf-8"))
    config, report = build_config(source)
    write_json(args.output, config)
    if args.report_json:
        write_json(args.report_json, report)
    print(json.dumps({
        "ok": True,
        "clientName": config.get("clientName"),
        "output": str(args.output),
        "report": str(args.report_json) if args.report_json else None,
        "summary": report["summary"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
