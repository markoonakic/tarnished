"""Provider schemas and exact, server-owned citation selections. No output repair."""

import copy
import json
import re

from app.schemas.interview_feedback import (
    ApplicationOutputSection,
    InterviewOutputSection,
    PipelineOutputSection,
)
from app.schemas.job_analysis import Extraction, Match, Preparation

MODELS = {
    "INTERVIEW": InterviewOutputSection,
    "APPLICATION": ApplicationOutputSection,
    "PIPELINE": PipelineOutputSection,
    "EXTRACTION": Extraction,
    "PROFILE_MATCH": Match,
    "PREPARATION": Preparation,
}


def citation_choices(sources, scope):
    """Select original substrings only; never serialize or reconstruct a quote."""
    choices = {}

    def add(reference, quote):
        if quote.strip() and len(quote) <= 2000:
            choices[len(choices)] = {**reference, "quote": quote}

    if scope == "PIPELINE":
        from app.services.interview_text import _record_value, unique_object

        decoder = json.JSONDecoder(object_pairs_hook=unique_object)
        for source in sources:
            passage = source["text"]
            reference = {"source_id": source["id"]}
            if source["kind"] == "pipeline_record":
                kind = (
                    "recorded_approaches"
                    if source["id"].startswith("pipeline:recorded_approaches:")
                    else "rounds"
                )
                for match in re.finditer(r"\{", passage):
                    try:
                        value, end = decoder.raw_decode(passage, match.start())
                        _record_value(value, kind)
                    except ValueError:
                        continue
                    add(reference, passage[match.start() : end])
            elif source["kind"] == "pipeline_metrics":
                # Include complete metric objects and exact key/value passages.
                # A source chunk can contain only part of a larger JSON container.
                covered_until = -1
                for match in re.finditer(r'\{|"(?:[^"\\]|\\.)*"\s*:', passage):
                    start = match.start()
                    if start < covered_until:
                        continue
                    value_start = match.end() if passage[start] == '"' else start
                    try:
                        while passage[value_start].isspace():
                            value_start += 1
                        _, end = decoder.raw_decode(passage, value_start)
                    except (ValueError, IndexError):
                        continue
                    if end - start <= 2000:
                        add(reference, passage[start:end])
                        covered_until = end
    elif scope in ("EXTRACTION", "PROFILE_MATCH", "PREPARATION"):
        data = sources[0]["data"]
        items = (
            [{"text": data["posting"]}]
            if scope == "EXTRACTION"
            else data.get("profile", [])
        )
        for item in items:
            reference = {} if scope == "EXTRACTION" else {"profile_id": item["id"]}
            # Preserve original sentences, including .NET and Node.js spellings.
            for match in re.finditer(r".+?(?:[.!?](?=\s|$)|\n|$)", item["text"], re.S):
                passage = match.group()
                for start in range(0, len(passage), 1000):
                    add(reference, passage[start : start + 1000])
    return choices


def output_schema(scope, choices, *, requirement_ids=None):
    schema = MODELS[scope].model_json_schema()
    if scope == "PROFILE_MATCH" and requirement_ids is not None:
        row = schema["$defs"]["MatchRow"]
        row["properties"].pop("requirement_id")
        schema["properties"]["rows"] = {
            "type": "object",
            "properties": {
                identity: {"$ref": "#/$defs/MatchRow"} for identity in requirement_ids
            },
        }
    selection = {
        "type": "integer",
        "minimum": 0,
        "maximum": max(len(choices) - 1, 0),
        "description": "Select the index of an exact supplied citation choice. Do not write a quote.",
    }
    if scope in ("PIPELINE", "PROFILE_MATCH", "PREPARATION"):
        schema["$defs"]["Citation"] = selection
    if scope == "EXTRACTION":
        schema["$defs"]["Proposal"]["properties"]["quote"] = selection
    if scope == "PIPELINE":
        applications = [
            key
            for key, value in choices.items()
            if value["source_id"].startswith("pipeline:recorded_approaches:")
        ]
        rounds = [
            key
            for key, value in choices.items()
            if value["source_id"].startswith("pipeline:rounds:")
        ]
        metrics = [
            key for key in choices if key not in applications and key not in rounds
        ]
        record = schema["$defs"]["RecordStep"]["properties"]
        record.pop("record_citation")
        record.pop("round_citations")
        record["application_choice"] = {"type": "integer", "enum": applications or [-1]}
        record["round_choices"] = {
            "type": "array",
            "items": {"type": "integer", "enum": rounds or [-1]},
            "maxItems": 4,
        }
        finding = schema["$defs"]["PipelineOutputFinding"]["properties"]
        finding["citations"]["items"] = {"type": "integer", "enum": metrics or [-1]}
        if not applications:
            finding["coaching"] = {"type": "null"}

    def strict(node):
        if isinstance(node, dict):
            node.pop("default", None)
            node.pop("discriminator", None)
            if "oneOf" in node:
                node["anyOf"] = node.pop("oneOf")
            if "const" in node:
                node["enum"] = [node.pop("const")]
            if "properties" in node:
                node["required"] = list(node["properties"])
                node["additionalProperties"] = False
            for value in node.values():
                strict(value)
        elif isinstance(node, list):
            for value in node:
                strict(value)

    strict(schema)
    return schema


def resolve_citations(output, choices, scope):
    """Materialize selected original evidence, then run the unchanged validators."""
    from app.services.interview_text import SectionValidationError, ValidationRule

    value = copy.deepcopy(output)

    def resolve(citation):
        if type(citation) not in (str, int):
            # Older compatible services can return the original citation object.
            # It still passes every schema, quote, record and ownership check.
            return citation
        if citation not in choices:
            raise SectionValidationError(ValidationRule.UNKNOWN_SOURCE)
        return dict(choices[citation])

    def position(citations, choice):
        citation = resolve(choice)
        if citation not in citations:
            citations.append(citation)
        return citations.index(citation)

    if not isinstance(value, dict):
        return value
    if scope == "PIPELINE":
        findings = value.get("findings")
        for finding in findings if isinstance(findings, list) else []:
            if not isinstance(finding, dict) or not isinstance(
                finding.get("citations"), list
            ):
                continue
            citations = [resolve(c) for c in finding["citations"]]
            finding["citations"] = citations
            coaching = finding.get("coaching")
            records = coaching.get("records") if isinstance(coaching, dict) else None
            for step in records if isinstance(records, list) else []:
                if not isinstance(step, dict) or "application_choice" not in step:
                    continue

                step["record_citation"] = position(
                    citations, step.pop("application_choice")
                )
                rounds = step.pop("round_choices", [])
                if not isinstance(rounds, list):
                    raise SectionValidationError(ValidationRule.RECORD_INDEX)
                step["round_citations"] = [
                    position(citations, choice) for choice in rounds
                ]
    elif scope == "EXTRACTION":
        items = value.get("items")
        for item in items if isinstance(items, list) else []:
            if isinstance(item, dict) and type(item.get("quote")) is int:
                item["quote"] = resolve(item["quote"])["quote"]
    elif scope == "PROFILE_MATCH":
        rows = value.get("rows")
        if isinstance(rows, dict):
            value["rows"] = [
                {**row, "requirement_id": identity} if isinstance(row, dict) else row
                for identity, row in rows.items()
            ]
        rows = value.get("rows")
        for row in rows if isinstance(rows, list) else []:
            if isinstance(row, dict) and isinstance(row.get("evidence"), list):
                row["evidence"] = [resolve(c) for c in row["evidence"]]
    elif scope == "PREPARATION":
        for items in value.values():
            if not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("evidence"), list):
                    item["evidence"] = [resolve(c) for c in item["evidence"]]
    return value
