from pydantic import BaseModel
from typing import Optional


class UploadResponse(BaseModel):
    upload_id: str
    rows_processed: int
    period_date: str
    status: str
    errors: list[str]


class UploadRecord(BaseModel):
    id: str
    upload_type: str
    filename: str
    period_date: str
    rows_processed: int
    status: str
    uploaded_at: str

    class Config:
        from_attributes = True
