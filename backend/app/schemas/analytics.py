from pydantic import BaseModel


class SankeyNode(BaseModel):
    id: str
    name: str
    color: str | None = None


class SankeyLink(BaseModel):
    source: str
    target: str
    value: int


class SankeyData(BaseModel):
    nodes: list[SankeyNode]
    links: list[SankeyLink]


class HeatmapDay(BaseModel):
    date: str
    count: int


class HeatmapData(BaseModel):
    days: list[HeatmapDay]
    max_count: int
