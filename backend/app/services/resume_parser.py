from __future__ import annotations

from io import BytesIO

from fastapi import HTTPException, UploadFile
from pypdf import PdfReader

from app.schemas import ResumePdfParseOut


async def parse_resume_pdf(file: UploadFile) -> ResumePdfParseOut:
  filename = file.filename or 'resume.pdf'
  if not filename.lower().endswith('.pdf'):
    raise HTTPException(status_code=400, detail='Only PDF files are supported')

  content = await file.read()
  if not content:
    raise HTTPException(status_code=400, detail='Uploaded PDF is empty')

  try:
    reader = PdfReader(BytesIO(content))
    pages = [page.extract_text() or '' for page in reader.pages]
  except Exception as error:
    raise HTTPException(status_code=400, detail=f'Failed to parse PDF: {error}') from error

  extracted_text = '\n\n'.join(part.strip() for part in pages if part and part.strip()).strip()
  if not extracted_text:
    raise HTTPException(status_code=400, detail='No selectable text found in PDF')

  return ResumePdfParseOut(
    filename=filename,
    extracted_text=extracted_text,
    page_count=len(reader.pages),
  )
