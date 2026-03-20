from __future__ import annotations

from livekit import api

from app.core.config import settings
from app.schemas import InterviewMeetingTokenOut, CandidateMeetingTokenOut


def issue_meeting_token(*, room_name: str, current_user, participant_name: str | None = None) -> InterviewMeetingTokenOut:
  user_id = getattr(current_user, 'id', 'unknown')
  username = getattr(current_user, 'username', 'interviewer')
  participant_identity = f'interviewer-{user_id}'
  participant_display_name = participant_name or username

  token = (
    api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
    .with_identity(participant_identity)
    .with_name(participant_display_name)
    .with_grants(
      api.VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=True,
        can_publish_data=True,
        can_subscribe=True,
      )
    )
    .to_jwt()
  )

  return InterviewMeetingTokenOut(
    room_name=room_name,
    ws_url=settings.livekit_url,
    token=token,
    participant_identity=participant_identity,
    participant_display_name=participant_display_name,
  )


def issue_candidate_meeting_token(
  *, room_name: str, candidate_name: str, interview_id: int, meeting_hash: str
) -> CandidateMeetingTokenOut:
  """為候選人生成 meeting token（不需要身份驗證）"""
  participant_identity = f'candidate-{interview_id}-{meeting_hash[:8]}'
  participant_display_name = candidate_name.strip() or '候選人'

  token = (
    api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
    .with_identity(participant_identity)
    .with_name(participant_display_name)
    .with_grants(
      api.VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=True,
        can_publish_data=True,
        can_subscribe=True,
      )
    )
    .to_jwt()
  )

  return CandidateMeetingTokenOut(
    room_name=room_name,
    ws_url=settings.livekit_url,
    token=token,
    participant_identity=participant_identity,
    participant_display_name=participant_display_name,
    interview_id=interview_id,
    meeting_hash=meeting_hash,
  )