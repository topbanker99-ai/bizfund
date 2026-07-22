// 자금진단(자금 피칭 리허설) 전용 경량 manifest — active 프롬프트 파일만 지정.
export const ACTIVE_PROMPTS = {
  'video-interview.content.system': new URL('../prompt-files/video-interview/content.system/20260721-01.md', import.meta.url),
  'video-interview.content.user': new URL('../prompt-files/video-interview/content.user/20260721-01.md', import.meta.url),
  'video-interview.attitude.system': new URL('../prompt-files/video-interview/attitude.system/20260721-01.md', import.meta.url),
};
