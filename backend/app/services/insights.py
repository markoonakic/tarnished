import json
import logging
from typing import Any

from litellm import completion
from sqlalchemy.orm import Session

from app.core.security import decrypt_api_key
from app.models.system_settings import SystemSettings
from app.schemas.insights import GraceInsights, SectionInsight

logger = logging.getLogger(__name__)


INSIGHTS_SYSTEM_PROMPT = """You are a job search advisor with an Elden Ring-inspired tone.
Provide concise, actionable insights based on job search analytics data.

Guidelines:
- Be direct but not harsh
- Always pair problems with suggestions
- Focus on funnel diagnosis: identify WHERE the problem is
- Keep insights concise and actionable
- Use the Elden Ring "grace" theme in the overall_grace field

Output valid JSON matching this structure:
{
  "overall_grace": "2-3 sentence Elden Ring styled guidance",
  "pipeline_overview": {
    "key_insight": "One sentence main takeaway",
    "trend": "Direction and context (e.g., 'Response rate up 15%')",
    "priority_actions": ["action 1", "action 2", "action 3"],
    "pattern": "optional observation about correlations"
  },
  "interview_analytics": { ... same structure ... },
  "activity_tracking": { ... same structure ... }
}"""


def get_ai_config(db: Session) -> tuple[str, str | None, str | None]:
    """Get AI configuration from system settings.

    Returns:
        Tuple of (model, api_key, base_url)
    """
    settings_map: dict[str, str] = {}
    for setting in db.query(SystemSettings).all():
        if setting.key == "litellm_api_key":
            try:
                settings_map["api_key"] = decrypt_api_key(setting.value)  # type: ignore[arg-type]
            except Exception:
                logger.warning("Failed to decrypt API key")
                settings_map["api_key"] = ""
        else:
            settings_map[setting.key] = setting.value or ""

    return (
        settings_map.get("litellm_model", "gpt-4o-mini"),
        settings_map.get("api_key") or None,
        settings_map.get("litellm_base_url") or None,
    )


def build_analytics_prompt_data(
    pipeline_data: dict[str, Any],
    interview_data: dict[str, Any],
    activity_data: dict[str, Any],
    period: str,
) -> str:
    """Build the user prompt with analytics data."""
    return f"""Here is the user's job search analytics for the past {period}:

PIPELINE OVERVIEW:
- Total applications: {pipeline_data.get("total_applications", 0)}
- Interviews: {pipeline_data.get("interviews", 0)}
- Offers: {pipeline_data.get("offers", 0)}
- Response rate: {pipeline_data.get("response_rate", 0):.1f}%
- Interview rate: {pipeline_data.get("interview_rate", 0):.1f}%
- Active applications: {pipeline_data.get("active_applications", 0)}
- Stage breakdown: {pipeline_data.get("stage_breakdown", {})}

INTERVIEW ANALYTICS:
- Conversion rates by round: {interview_data.get("conversion_rates", {})}
- Interview outcomes: {interview_data.get("outcomes", {})}
- Average days between rounds: {interview_data.get("avg_days_between_rounds", {})}
- Process speed indicators: {interview_data.get("speed_indicators", {})}

ACTIVITY TRACKING:
- Weekly application counts: {activity_data.get("weekly_applications", [])}
- Weekly interview counts: {activity_data.get("weekly_interviews", [])}
- Activity patterns: {activity_data.get("patterns", {})}
- Most active days: {activity_data.get("active_days", [])}

Generate insights that help diagnose where to focus improvement efforts."""


def generate_insights(
    db: Session,
    pipeline_data: dict[str, Any],
    interview_data: dict[str, Any],
    activity_data: dict[str, Any],
    period: str,
) -> GraceInsights:
    """Generate AI insights from analytics data."""
    model, api_key, base_url = get_ai_config(db)

    if not api_key:
        raise ValueError(
            "AI not configured. Please configure AI settings in admin panel."
        )

    user_prompt = build_analytics_prompt_data(
        pipeline_data, interview_data, activity_data, period
    )

    try:
        logger.info(f"Generating insights with model: {model}")
        response = completion(
            model=model,
            messages=[
                {"role": "system", "content": INSIGHTS_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            api_key=api_key,
            base_url=base_url,
            timeout=60,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content  # type: ignore[union-attr]
        if not content:
            raise ValueError("AI returned empty response")

        insights_json = json.loads(content)

        # Validate required fields exist
        def _validate_section(data: dict, name: str) -> dict:
            required = ["key_insight", "trend", "priority_actions"]
            if not all(k in data for k in required):
                raise ValueError(f"AI response missing required fields for {name}")
            return data

        return GraceInsights(
            overall_grace=insights_json.get("overall_grace", ""),
            pipeline_overview=SectionInsight(
                **_validate_section(
                    insights_json.get("pipeline_overview", {}), "pipeline_overview"
                )
            ),
            interview_analytics=SectionInsight(
                **_validate_section(
                    insights_json.get("interview_analytics", {}), "interview_analytics"
                )
            ),
            activity_tracking=SectionInsight(
                **_validate_section(
                    insights_json.get("activity_tracking", {}), "activity_tracking"
                )
            ),
        )

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {e}")
        raise ValueError(f"Failed to parse AI response: {e}")
    except Exception as e:
        logger.error(f"AI service error: {e}")
        raise ValueError(f"AI service error: {e}")
