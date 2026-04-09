FULL_ACCESS_PRESET = "full_access"
CLI_PRESET = "cli"
EXTENSION_PRESET = "extension"
READ_ONLY_PRESET = "read_only"
IMPORT_EXPORT_PRESET = "import_export"
CUSTOM_PRESET = "custom"

BASE_SCOPES = [
    "applications:read",
    "applications:write",
    "job_leads:read",
    "job_leads:write",
    "profile:read",
    "profile:write",
    "rounds:read",
    "rounds:write",
    "statuses:read",
    "statuses:write",
    "round_types:read",
    "round_types:write",
    "dashboard:read",
    "analytics:read",
    "preferences:read",
    "preferences:write",
    "user_settings:read",
    "user_settings:write",
    "files:read",
    "files:write",
    "export:read",
    "import:write",
]

PRIVILEGED_SCOPES = [
    "admin:read",
    "admin:write",
    "api_keys:manage",
]

ALL_SCOPES = BASE_SCOPES + PRIVILEGED_SCOPES

FULL_ACCESS_SCOPES = list(BASE_SCOPES)

CLI_SCOPES = [
    "applications:read",
    "applications:write",
    "job_leads:read",
    "job_leads:write",
    "profile:read",
    "profile:write",
    "rounds:read",
    "rounds:write",
    "statuses:read",
    "statuses:write",
    "round_types:read",
    "round_types:write",
    "dashboard:read",
    "analytics:read",
    "preferences:read",
    "preferences:write",
    "user_settings:read",
    "user_settings:write",
    "files:read",
    "files:write",
    "export:read",
    "import:write",
]

EXTENSION_SCOPES = [
    "applications:read",
    "applications:write",
    "job_leads:read",
    "job_leads:write",
    "profile:read",
    "statuses:read",
    "user_settings:read",
]

READ_ONLY_SCOPES = [
    "applications:read",
    "job_leads:read",
    "profile:read",
    "rounds:read",
    "statuses:read",
    "round_types:read",
    "dashboard:read",
    "analytics:read",
    "preferences:read",
    "user_settings:read",
    "files:read",
    "export:read",
]

IMPORT_EXPORT_SCOPES = [
    "applications:read",
    "job_leads:read",
    "export:read",
    "import:write",
]

PRESET_SCOPES = {
    FULL_ACCESS_PRESET: FULL_ACCESS_SCOPES,
    CLI_PRESET: CLI_SCOPES,
    EXTENSION_PRESET: EXTENSION_SCOPES,
    READ_ONLY_PRESET: READ_ONLY_SCOPES,
    IMPORT_EXPORT_PRESET: IMPORT_EXPORT_SCOPES,
    CUSTOM_PRESET: [],
}


def resolve_scopes_for_preset(preset: str) -> list[str]:
    return list(PRESET_SCOPES.get(preset, []))


def is_valid_scope(scope: str) -> bool:
    return scope in ALL_SCOPES
