"""Counts from confirmed requirements and saved matrix rows, never model arithmetic."""

from collections import Counter


def requirement_insights(applications, matches_by_application=None):
    """The analysis publisher supplies current, permission-checked saved matrices.

    A missing matrix is unknown, not missing evidence. Denominators are the
    applications that have the required saved data, not all applications.
    """
    matches_by_application = matches_by_application or {}
    repeated = Counter()
    missing = Counter()
    labels = {}
    reviewed_count = matched_count = 0
    for application in applications:
        items = application.confirmed_requirements or []
        requirements = {
            item["id"]: item["text"].strip()
            for item in items
            if isinstance(item, dict)
            and isinstance(item.get("id"), str)
            and isinstance(item.get("text"), str)
            and item["text"].strip()
        }
        if not requirements:
            continue
        reviewed_count += 1
        for text in requirements.values():
            labels.setdefault(text.casefold(), text)
        repeated.update({text.casefold() for text in requirements.values()})
        rows = matches_by_application.get(application.id)
        if rows is None:
            continue
        matched_count += 1
        missing.update(
            {
                requirements[row["requirement_id"]].casefold()
                for row in rows
                if row.get("state") == "no_evidence"
                and row.get("requirement_id") in requirements
            }
        )

    def table(counter, denominator):
        return {
            "items": [
                {"label": labels[label], "count": count}
                for label, count in sorted(
                    counter.items(), key=lambda entry: (-entry[1], entry[0])
                )
            ],
            "denominator": denominator,
        }

    return {
        "repeated_requirements": table(repeated, reviewed_count),
        "missing_evidence": table(missing, matched_count),
    }
