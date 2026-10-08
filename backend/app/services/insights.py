import json
import logging
from typing import Any

from litellm import completion
from starlette.concurrency import run_in_threadpool

from app.schemas.insights import GraceInsights, SectionInsight
from app.services.ai_settings import AISettingsState

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


def build_analytics_prompt_data(
    pipeline_data: dict[str, Any],
    interview_data: dict[str, Any],
    activity_data: dict[str, Any],
    period: str,
) -> str:
    """Use deterministic denominators/coverage; null is unavailable, not zero."""
    pipeline_keys = (
        "scope",
        "current_record_basis",
        "total_applications",
        "responded",
        "response_rate",
        "response_unknown",
        "response_undated",
        "interviews",
        "offers",
        "interview_rate",
        "offer_rate",
        "active_applications",
        "current_stage_breakdown",
        "unknown_applications",
        "coverage",
        "stage_totals",
    )
    data = {
        "pipeline": {key: pipeline_data.get(key) for key in pipeline_keys},
        "stage_visits": pipeline_data.get("visits", []),
        "rounds": {
            key: interview_data.get(key)
            for key in (
                "scope",
                "conversion_rates",
                "outcomes",
                "avg_scheduled_to_completed_days",
                "duration_basis",
            )
        },
        "activity": activity_data,
    }
    return (
        "Diagnose the recorded applied-date cohort, not employer motives. "
        "Interviews/offers mean distinct ever-reached evidence, not current stage. "
        "Response means recorded substantive evidence, not automatic receipts; "
        "undated recording time is availability, not occurrence. Null percentages "
        "and missing intervals are unavailable, never zero. Cite sample sizes, "
        "as-of and duration coverage; do not invent benchmarks or speed targets. "
        "Separate current-record classification from historical as-of residence. "
        "Repeated visits are separate; stage totals sum only observed hours. "
        "Round scheduling/completion are not response time or stage residence.\n"
        + json.dumps(data, default=str)
    )


def _validate_section(data: dict, name: str) -> dict:
    required = ["key_insight", "trend", "priority_actions"]
    if not all(k in data for k in required):
        raise ValueError(f"AI response missing required fields for {name}")
    return data


from app.services.output_language import output_language_instruction


def generate_insights_from_settings(
    settings: AISettingsState,
    pipeline_data: dict[str, Any],
    interview_data: dict[str, Any],
    activity_data: dict[str, Any],
    period: str,
    output_language: str = "en",
) -> GraceInsights:
    """Generate AI insights from analytics data using preloaded settings."""
    model = settings.effective_model or "openai/gpt-4o-mini"
    api_key = settings.dispatch_api_key
    base_url = settings.base_url

    user_prompt = build_analytics_prompt_data(
        pipeline_data, interview_data, activity_data, period
    )

    try:
        logger.info("Generating requested text insights")
        response = completion(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": INSIGHTS_SYSTEM_PROMPT
                    + output_language_instruction(output_language),
                },
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

    except Exception:
        logger.warning("Text insights generation failed")
        raise ValueError(
            "Text service failed. Ask an administrator to check the unverified configuration or retry explicitly."
        ) from None


async def generate_insights_async(
    settings: AISettingsState,
    pipeline_data: dict[str, Any],
    interview_data: dict[str, Any],
    activity_data: dict[str, Any],
    period: str,
    output_language: str = "en",
) -> GraceInsights:
    """Run blocking insights generation off the event loop."""
    return await run_in_threadpool(
        generate_insights_from_settings,
        settings,
        pipeline_data,
        interview_data,
        activity_data,
        period,
        output_language,
    )
