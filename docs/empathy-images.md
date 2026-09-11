# 공감능력테스트 — 제작 재료 및 프롬프트

표정 사진을 보고 감정을 맞히는 **공감능력테스트**(정서지능·표정인식) 기능의 제작 재료 모음입니다.
탑뱅커 스터디 "역량검사 게임 → 표정 감정 맞히기"에 실제 탑재된 것과 동일한 재료입니다.

## 1. 폴더 구성

| 폴더 | 내용 |
|---|---|
| `원본사진_2048/` | 힉스필드 생성 원본(2048×2048, webp q0.92 무손실급) — 다른 서비스에서 자유 크기로 재가공용 |
| `게임용이미지_400/` | 얼굴 중심 크롭 + 400×400 webp(q0.84) — 웹 게임에 바로 쓰는 경량판(각 12~26KB) |

파일명 규칙: `<감정영문>-<번호>.webp` — 감정마다 **서로 다른 인물 3명**(1~3번).
같은 감정을 매번 다른 얼굴로 보여줘 "얼굴 암기"를 방지합니다.

| 감정(한글) | 파일 접두어 | 인물 구성(1·2·3번) |
|---|---|---|
| 기쁨 | `joy` | 20대 여 · 30대 남 · 40대 여 |
| 슬픔 | `sad` | 중년 남 · 20대 여 · 20대 남 |
| 분노 | `anger` | 30대 남 · 30대 여 · 중년 남 |
| 놀람 | `surprise` | 20대 여 · 20대 남 · 중년 여 |
| 두려움 | `fear` | 20대 여 · 30대 남 · 20대 남 |
| 혐오 | `disgust` | 20대 남 · 20대 여 · 40대 남 |

## 2. 생성 도구·공통 설정

- 도구: **Higgsfield** 이미지 생성 (모델 `soul_2` = text2image_soul_v2)
- 설정: aspect_ratio `1:1`, quality `2k` (결과물 2048×2048 PNG)
- 공통 프롬프트 골격(모든 장에 포함):

```
Photorealistic studio portrait headshot of a(n) [인물 묘사] East Asian [man/woman],
[감정 표현 상세], head and shoulders centered, looking directly at camera,
plain light gray seamless studio background, soft even lighting,
natural skin texture, sharp focus, professional photography, no text, no watermark
```

핵심 요령:
- 배경을 `plain light gray seamless studio background`로 고정 → 18장이 한 세트처럼 보임
- 감정 묘사는 **눈썹·눈·입을 구체적으로** 지정해야 표정이 확실하게 나옴(아래 감정별 표현부 참고)
- `East Asian` + 연령/성별을 장마다 바꿔 인물 다양성 확보

## 3. 감정별 표현부 프롬프트 (18장 전체)

각 장의 [감정 표현 상세] 부분입니다. 인물 묘사만 위 표대로 바꿔 끼우면 동일하게 재현됩니다.

### 기쁨 (joy)
- joy-1 (young East Asian woman in her 20s): `genuine bright happy smile showing teeth, cheerful sparkling joyful eyes`
- joy-2 (East Asian man in his 30s): `genuine bright happy smile showing teeth, cheerful joyful crinkled eyes`
- joy-3 (East Asian woman in her 40s): `warm genuine happy smile, delighted cheerful eyes`

### 슬픔 (sad)
- sad-1 (middle-aged East Asian man): `deeply sad sorrowful expression, downturned mouth, glistening downcast eyes, inner eyebrows raised, melancholic`
- sad-2 (young East Asian woman in her 20s): `deeply sad sorrowful expression, downturned mouth, teary downcast eyes, inner eyebrows raised, melancholic`
- sad-3 (East Asian man in his 20s): `sad unhappy sorrowful expression, downturned mouth corners, downcast gloomy eyes, inner eyebrows raised`

### 분노 (anger)
- anger-1 (East Asian man in his 30s): `angry furious expression, tightly furrowed eyebrows pulled down, intense glaring eyes, clenched tense jaw`
- anger-2 (East Asian woman in her 30s): `angry furious expression, tightly furrowed eyebrows pulled down, intense glaring eyes, tense jaw`
- anger-3 (middle-aged East Asian man): `angry enraged expression, deeply furrowed brows, fierce glaring eyes, clenched tense jaw`

### 놀람 (surprise)
- surprise-1 (young East Asian woman): `shocked surprised expression, very wide open eyes, eyebrows raised high, mouth open in astonishment`
- surprise-2 (East Asian man in his 20s): `shocked surprised expression, very wide open eyes, eyebrows raised high, mouth open in astonishment`
- surprise-3 (middle-aged East Asian woman): `shocked surprised astonished expression, wide open eyes, raised eyebrows, mouth open in an O shape`

### 두려움 (fear)
- fear-1 (East Asian woman in her 20s): `frightened fearful expression, wide worried eyes, eyebrows raised and drawn together, tense scared anxious face`
- fear-2 (East Asian man in his 30s): `frightened fearful expression, wide worried eyes, eyebrows raised and drawn together, tense scared anxious face`
- fear-3 (young East Asian man in his 20s): `scared fearful frightened expression, wide anxious eyes, eyebrows raised and pulled together, tense worried face`

### 혐오 (disgust)
- disgust-1 (East Asian man in his 20s): `strong disgusted expression, wrinkled nose, raised upper lip sneer, squinting eyes, repulsed grimace`
- disgust-2 (East Asian woman in her 20s): `strong disgusted expression, wrinkled nose, raised upper lip, squinting eyes, repulsed grimace`
- disgust-3 (East Asian man in his 40s): `disgusted revolted expression, strongly wrinkled nose, raised upper lip sneer, narrowed squinting eyes, grimace of distaste`

표정 구분 포인트(프롬프트 설계 근거):
- **놀람 vs 두려움**: 놀람은 `eyebrows raised high` + `mouth open in O shape`(둥근 입), 두려움은 `eyebrows raised AND drawn together`(눈썹이 안쪽으로 몰림) + `tense`(긴장)
- **분노 vs 혐오**: 분노는 `furrowed brows pulled down`(눈썹 내림) + `glaring`, 혐오는 `wrinkled nose`(코 찡그림) + `raised upper lip`(윗입술 들림)

## 4. 게임용 이미지 후처리 레시피

원본 2048px → 게임용 400px 변환 값(브라우저 canvas 또는 아무 이미지 툴):

```
크롭: 원본에서 (x=374, y=300) 시작, 1320×1320 정사각 (얼굴 중심)
리사이즈: 400×400
포맷: webp, 품질 0.84  → 장당 12~26KB
```

## 5. 게임 설계 참고 (탑뱅커 탑재 사양)

- 라운드 1: 기본 4감정(기쁨·슬픔·분노·놀람), 보기 4개
- 라운드 2~3: 6감정 전체, 보기 6개, 제한시간 단축(4.5초 → 라운드당 −0.7초, 최소 2.8초)
- 라운드당 8문항 × 3라운드, 문항마다 감정·인물(1~3번)을 무작위 배정
- 채점: 정답률 기준 S(90%+) / A(75%+) / B(60%+) / C
- 측정 역량 표기: "정서 지능 · 표정 인식" (공감능력)

## 6. 이용 주의

- 사진은 전부 AI 생성 가상 인물입니다(실존 인물 아님). 상업 서비스 탑재 시 힉스필드 계정 약관의 상업적 이용 조건을 따릅니다.
- 인물이 실존 인물처럼 오인될 문구("실제 고객", "임직원" 등)와 함께 쓰지 않습니다.
