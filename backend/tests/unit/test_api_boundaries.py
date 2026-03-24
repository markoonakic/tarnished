from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_applications_router_does_not_import_private_job_leads_helpers():
    source = (ROOT / "app/api/applications.py").read_text()

    assert "from app.api.job_leads import _fetch_html" not in source
    assert "from app.api.job_leads import _get_ai_settings" not in source


def test_main_does_not_define_dead_cors_validator():
    source = (ROOT / "app/main.py").read_text()

    assert "def cors_origin_validator" not in source
