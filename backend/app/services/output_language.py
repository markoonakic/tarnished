"""Output language applies to new explicit text requests, never source quotes."""


def output_language_instruction(language: str = "en") -> str:
    name = (
        "Serbian, Latin script with č ć š ž đ" if language == "sr-Latn" else "English"
    )
    return (
        f"\nWrite explanations, summaries and advice in {name}. "
        "Keep JSON keys, machine enum values, names, identifiers and all quoted source "
        "passages unchanged and in their original language. Do not translate or rewrite evidence."
    )
