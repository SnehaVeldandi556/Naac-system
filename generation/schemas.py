from pydantic import BaseModel, Field
from typing import List

class QualitativeExtractionSchema(BaseModel):
    metric_id: str = Field(description="The NAAC Metric ID (e.g. '1.1.1', '1.3.1')")
    
    narrative_draft: str = Field(
        default="Data not available",
        description="A formal, descriptive academic response of 300-500 words explaining the college's actions. MUST ONLY contain information directly found in the context. If no relevant information is present in the context, output exactly 'Data not available' - DO NOT hallucinate or guess."
    )
    
    key_initiatives: List[str] = Field(
        default_factory=list,
        description="A list of 3-5 specific bullet points of policies, programs, facilities, or initiatives extracted from the text."
    )
    
    data_available: bool = Field(
        default=False,
        description="Set to True if the text context contains sufficient and valid information to write the response. Set to False if the context lacks relevant information."
    )
    
    supporting_documents: List[str] = Field(
        default_factory=list,
        description="A list of specific document titles or evidence files referenced in the text (e.g., 'Academic Calendar 2019-20', 'Nature Club Minutes', 'Remedial Class Attendance Register')."
    )
