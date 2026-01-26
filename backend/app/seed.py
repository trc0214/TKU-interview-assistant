from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models


def seed_if_empty(db: Session) -> None:
  has_job = db.scalars(select(models.Job.id).limit(1)).first()
  if has_job:
    return

  job1 = models.Job(
    title='前端工程師（React）',
    department='技術研發部',
    description='負責企業內部招募系統前端介面開發與維護。',
    required_skills=['React', 'TypeScript', 'REST API'],
    nice_to_have=['Tailwind CSS', 'Testing', '可用性/無障礙'],
    status='open',
    experience_level='2-3',
    education='大學',
    ai_resume_matching_enabled=True,
    ai_question_gen_enabled=True,
  )
  job2 = models.Job(
    title='後端工程師（Node.js）',
    department='平台服務部',
    description='負責 API 與資料服務開發、系統效能與可靠度優化。',
    required_skills=['Node.js', 'SQL', '系統設計'],
    nice_to_have=['Docker', 'Observability'],
    status='open',
    experience_level='4-6',
    education='大學',
    ai_resume_matching_enabled=True,
    ai_question_gen_enabled=False,
  )

  db.add_all([job1, job2])
  db.commit()
  db.refresh(job1)
  db.refresh(job2)

  resume1 = models.Resume(
    candidate_name='林怡君',
    job_id=job1.id,
    resume_text='具 3 年前端經驗，主要使用 React/TypeScript；有元件化與測試導入經驗。',
    status='received',
    education='國立大學 資工系',
    years_exp=3,
    skills=['React', 'TypeScript', 'Testing Library', 'CSS'],
  )
  resume2 = models.Resume(
    candidate_name='陳冠宇',
    job_id=job2.id,
    resume_text='具 Node.js/Express API 開發經驗，熟悉 PostgreSQL 與 Docker。',
    status='received',
    education='私立大學 資管系',
    years_exp=2,
    skills=['Node.js', 'Express', 'PostgreSQL', 'Docker'],
  )
  db.add_all([resume1, resume2])
  db.commit()
