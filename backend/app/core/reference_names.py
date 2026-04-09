def normalize_reference_name(name: str) -> str:
    return " ".join(name.strip().split())


def normalized_reference_name(name: str) -> str:
    return normalize_reference_name(name).casefold()
