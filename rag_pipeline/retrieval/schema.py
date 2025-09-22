# Import attributes for query construction
from langchain.chains.query_constructor.schema import AttributeInfo

# Define the attributes and description for documents in the vector store
ATTRIBUTES = [
    AttributeInfo(name="topic_id", description="UUID of the topic", type="string"),
    AttributeInfo(name="document_id", description="UUID of the source document", type="string"),
    AttributeInfo(name="file_name", description="Original filename of the document", type="string"),
    AttributeInfo(name="page", description="Page number within the document", type="integer"),
    AttributeInfo(name="is_active", description="Only true means included in RAG", type="boolean"),
]

# Define the description for document content
DOCUMENT_CONTENT_DESCRIPTION = "Study materials and notes chunks relevant to the user's topic."
