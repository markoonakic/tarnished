"""Stable profile item identities and the single AI input allowlist."""

from uuid import UUID, uuid4

from sqlalchemy import select

from app.models.user_profile import UserProfile

ITEM_FIELDS = (
    "work_history",
    "education",
    "skill_items",
    "technologies",
    "projects",
    "certificates",
    "languages",
)
PROFILE_FIELDS = (
    "display_name",
    "desired_positions",
    "fields_of_work",
    "seniority",
    "work_modes",
    "employment_types",
    "years_experience",
    "location_restrictions",
    *ITEM_FIELDS,
    "ai_permissions",
    "revision",
    "permission_revision",
)
SECTIONS = {
    "job_preferences": (
        "desired_positions",
        "fields_of_work",
        "seniority",
        "work_modes",
        "employment_types",
        "years_experience",
    ),
    "work_authorization": (
        "authorized_to_work",
        "requires_sponsorship",
        "location_restrictions",
    ),
    "skills": ("skill_items", "technologies"),
    "work_history": ("work_history",),
    "projects": ("projects",),
    "education": ("education",),
    "certificates": ("certificates",),
    "languages": ("languages",),
}
ENTRY_KEYS = {
    "work_history": (
        "id",
        "company",
        "employer",
        "title",
        "description",
        "start_date",
        "end_date",
        "current",
    ),
    "projects": ("id", "name", "kind", "description", "technologies", "link"),
    "education": (
        "id",
        "institution",
        "degree",
        "qualification",
        "field",
        "start_date",
        "end_date",
    ),
    "certificates": ("id", "name", "issuer", "date", "link"),
    "languages": ("id", "name", "language", "level", "proficiency"),
    "skill_items": ("id", "name"),
    "technologies": ("id", "name"),
}


def normalize_items(value, old=None):
    """Keep unknown keys and malformed legacy data visible, never grant it to AI."""
    old = old or []
    output = []
    used = set()
    for entry in value or []:
        item = (
            dict(entry)
            if isinstance(entry, dict)
            else {"name": entry}
            if isinstance(entry, str)
            else {"legacy_value": entry, "needs_repair": True}
        )
        if not item.get("id"):
            match = next(
                (
                    previous
                    for previous in old
                    if isinstance(previous, dict)
                    and previous.get("id") not in used
                    and {k: v for k, v in previous.items() if k != "id"} == item
                ),
                None,
            )
            item["id"] = (match.get("id") if match else None) or str(uuid4())
        try:
            item["id"] = str(UUID(item["id"]))
        except (ValueError, TypeError, AttributeError):
            item["legacy_id"] = item["id"]
            item["id"] = str(uuid4())
        if item["id"] in used:
            raise ValueError("Profile item IDs must be unique")
        used.add(item["id"])
        output.append(item)
    return output


def allowed_profile(profile) -> dict:
    if profile is None:
        return {}
    get = (
        profile.get
        if isinstance(profile, dict)
        else lambda field, default=None: getattr(profile, field, default)
    )
    permissions = get("ai_permissions") or {}
    output = {}
    for section, fields in SECTIONS.items():
        if not permissions.get(section, True):
            continue
        for field in fields:
            if not permissions.get(field, True):
                continue
            value = get(field)
            if field in ITEM_FIELDS:
                # Legacy skills from pre-migration fixtures are supported, too.
                if field == "skill_items" and not value:
                    value = [
                        {"name": name}
                        for name in (get("skills") or [])
                        if isinstance(name, str)
                    ]
                value = [
                    {key: item[key] for key in ENTRY_KEYS[field] if key in item}
                    for item in (value or [])
                    if isinstance(item, dict)
                    and not item.get("needs_repair")
                    and permissions.get(item.get("id"), True)
                ]
            if value is not None and value != [] and value != "":
                output[field] = value
    return output


async def legacy_ai_profile(db, user_id):
    """Old reports keep their source IDs but use the same permission selector."""
    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
    allowed = allowed_profile(profile)
    result = {
        "work_history": [
            {k: v for k, v in item.items() if k != "id"}
            for item in allowed.get("work_history", [])
        ]
        or None,
        "skills": [
            item["name"] for item in allowed.get("skill_items", []) if item.get("name")
        ]
        or None,
    }
    import json

    from fastapi import HTTPException

    if len(json.dumps(result, ensure_ascii=False)) > 64_000:
        raise HTTPException(
            422,
            "Evidence exceeds analysis bounds; shorten or paste bounded relevant text",
        )
    return result
