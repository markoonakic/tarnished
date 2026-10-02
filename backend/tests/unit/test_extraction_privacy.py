import json
import logging
from types import SimpleNamespace

import pytest

from app.services import extraction


@pytest.mark.parametrize("response", ["invalid-json", "invalid-fields", "valid"])
def test_extraction_keeps_provider_content_out_of_logs_and_errors(
    monkeypatch, caplog, response
):
    private = "private-provider-content"
    content = {
        "invalid-json": private,
        "invalid-fields": json.dumps({"title": [private], "company": "Example"}),
        "valid": json.dumps({"title": private, "company": "Example"}),
    }[response]
    monkeypatch.setattr(
        extraction,
        "completion",
        lambda **kwargs: SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        ),
    )
    with caplog.at_level(logging.DEBUG, logger=extraction.__name__):
        if response == "valid":
            result = extraction.extract_with_llm(
                "Job page", "https://example.com/job", api_key="synthetic-key"
            )
            assert result.title == private
        else:
            with pytest.raises(extraction.ExtractionInvalidResponseError) as error:
                extraction.extract_with_llm(
                    "Job page", "https://example.com/job", api_key="synthetic-key"
                )
            assert private not in str(error.value)
            assert private not in str(error.value.details)
    assert private not in caplog.text
