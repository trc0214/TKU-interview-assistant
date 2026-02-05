from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud, models
from app.deps import get_current_user
from app.db import get_db
from app.schemas import AIAnalysisCreate, AIAnalysisOut
from app.services.gemini import PROMPT_VERSION, build_prompt, generate_analysis


router = APIRouter(prefix='/ai-analyses', tags=['ai-analyses'])


@router.get('', response_model=list[AIAnalysisOut])
def list_analyses(
  job_id: int | None = Query(default=None),
  resume_id: int | None = Query(default=None),
  db: Session = Depends(get_db),
  _current_user: models.User = Depends(get_current_user),
):
  return crud.list_analyses(db, job_id=job_id, resume_id=resume_id)


@router.get('/{analysis_id}', response_model=AIAnalysisOut)
def get_analysis(analysis_id: int, db: Session = Depends(get_db), _current_user: models.User = Depends(get_current_user)):
  item = crud.get_analysis(db, analysis_id)
  if not item:
    raise HTTPException(status_code=404, detail='AIAnalysis not found')
  return item


@router.post('', response_model=AIAnalysisOut)
async def create_analysis(data: AIAnalysisCreate, db: Session = Depends(get_db), _current_user: models.User = Depends(get_current_user)):
  job = crud.get_job(db, data.job_id)
  if not job:
    raise HTTPException(status_code=400, detail='Invalid job_id')
  resume = crud.get_resume(db, data.resume_id)
  if not resume:
    raise HTTPException(status_code=400, detail='Invalid resume_id')
  if resume.job_id != job.id:
    raise HTTPException(status_code=400, detail='Resume is not linked to the given job')

  existing = crud.get_analysis_by_pair(db, job_id=job.id, resume_id=resume.id)
  if existing and not data.force:
    return existing

  prompt = build_prompt(
    job_title=job.title,
    job_department=job.department,
    job_description=job.description,
    required_skills=job.required_skills,
    nice_to_have=job.nice_to_have,
    resume_text=resume.resume_text,
    extra_conditions=data.extra_conditions,
  )

  parsed, is_mock, model_used = await generate_analysis(prompt=prompt)

  def int_score(key: str) -> int:
    try:
      return int(max(0, min(100, int(parsed.get(key, 0)))))
    except Exception:
      return 0

  analysis = models.AIAnalysis(
    job_id=job.id,
    resume_id=resume.id,
    model=model_used,
    prompt_version=PROMPT_VERSION,
    overall_score=int_score('overall_score'),
    professional_score=int_score('professional_score'),
    communication_score=int_score('communication_score'),
    problem_solving_score=int_score('problem_solving_score'),
    summary=str(parsed.get('summary', '')).strip(),
    strengths=list(parsed.get('strengths') or []),
    risks=list(parsed.get('risks') or []),
    suggested_questions=list(parsed.get('suggested_questions') or []),
    raw_response=parsed,
    is_mock=is_mock,
  )

  if existing:
    db.delete(existing)
    db.flush()

  db.add(analysis)
  db.commit()
  db.refresh(analysis)

  resume.status = 'analyzed'
  db.add(resume)
  db.commit()

  return analysis
