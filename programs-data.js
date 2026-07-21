/* 정책자금·지원금 티어 1 데이터
   ------------------------------------------------------------
   DATA_STATUS 가 'draft' 인 동안 프론트에 검수 전 배너가 표시된다.
   각 항목의 금액·요건은 반드시 소관기관 공고 원문으로 대조한 뒤
   verifiedAt 을 채우고 DATA_STATUS 를 'verified' 로 바꿀 것.
   진단(diagnose)에는 tier === 1 만 투입한다.
   [2026-07 검증 메모] 희망리턴 철거비 한도 400만→600만원(2025.7.11 이후 접수분) 반영.
   ------------------------------------------------------------ */
const DATA_STATUS = 'draft';

const PROGRAMS = [
  /* ---------- 대출·보증 (운영 중 전용: bizStatus '운영') ---------- */
  {
    id: 'sbiz-ilban', tier: 1, source: 'manual', verifiedAt: null,
    category: 'loan', agency: '소상공인시장진흥공단',
    name: '소상공인 정책자금 · 일반경영안정자금',
    summary: '운전자금 목적의 저리 대출',
    amountMax: 70000000, terms: '5년 이내(거치 포함)',
    applyUrl: 'https://ols.sbiz.or.kr', sourceUrl: 'https://www.sbiz.or.kr',
    require: {
      bizStatus: { include: ['운영'] },
      employees: { max: 9 }, revenue: { max: 12000000000 },
      industry: { exclude: ['유흥', '도박', '금융', '부동산임대'] },
      purpose: ['운전'], taxOk: { eq: '예' }
    },
    boost: [
      { when: { ownerAge: { max: 39 } }, score: 15, label: '청년 사업자 우대' },
      { when: { bizAge: { max: 3 } }, score: 10, label: '초기 창업 우대' }
    ],
    docs: ['사업자등록증', '부가가치세 과세표준증명', '국세·지방세 완납증명', '임대차계약서']
  },
  {
    id: 'sbiz-start', tier: 1, source: 'manual', verifiedAt: null,
    category: 'loan', agency: '소상공인시장진흥공단',
    name: '소상공인 정책자금 · 창업기반지원자금',
    summary: '업력이 짧은 사업자의 시설·운전 자금',
    amountMax: 100000000, terms: '5년 이내',
    applyUrl: 'https://ols.sbiz.or.kr', sourceUrl: 'https://www.sbiz.or.kr',
    require: {
      bizStatus: { include: ['운영'] },
      bizAge: { max: 3 }, employees: { max: 9 },
      industry: { exclude: ['유흥', '도박', '금융', '부동산임대'] },
      purpose: ['운전', '시설'], taxOk: { eq: '예' }
    },
    boost: [{ when: { ownerAge: { max: 39 } }, score: 20, label: '청년 창업 우대' }],
    docs: ['사업자등록증', '임대차계약서', '사업계획서']
  },
  {
    id: 'kosmes-youth', tier: 1, source: 'manual', verifiedAt: null,
    category: 'loan', agency: '중소벤처기업진흥공단',
    name: '청년전용창업자금',
    summary: '만 39세 이하 대표의 창업 초기 자금',
    amountMax: 100000000, terms: '6년 이내(거치 3년)',
    applyUrl: 'https://www.kosmes.or.kr', sourceUrl: 'https://www.kosmes.or.kr',
    require: {
      bizStatus: { include: ['운영'] },
      ownerAge: { max: 39 }, bizAge: { max: 3 },
      industry: { exclude: ['유흥', '도박', '금융', '부동산임대'] },
      taxOk: { eq: '예' }
    },
    boost: [], docs: ['사업자등록증', '사업계획서', '재무제표']
  },
  {
    id: 'sgi-guarantee', tier: 1, source: 'manual', verifiedAt: null,
    category: 'loan', agency: '지역신용보증재단',
    name: '소상공인 신용보증 (보증부 은행대출)',
    summary: '담보가 부족한 소상공인의 은행 대출 보증',
    amountMax: 100000000, terms: '보증비율 85~100%, 보증료 별도',
    applyUrl: 'https://www.koreg.or.kr', sourceUrl: 'https://www.koreg.or.kr',
    require: { bizStatus: { include: ['운영'] }, employees: { max: 9 }, taxOk: { eq: '예' } },
    boost: [], docs: ['사업자등록증', '금융거래확인서', '부가가치세 과세표준증명', '대표자 신분증']
  },

  /* ---------- 지원금·바우처 (운영 중) ---------- */
  {
    id: 'smart-store', tier: 1, source: 'manual', verifiedAt: null,
    category: 'voucher', agency: '소상공인시장진흥공단',
    name: '스마트상점 기술보급',
    summary: '키오스크·테이블오더 등 스마트 기술 도입비 지원',
    amountMax: 5000000, terms: '자부담 일부, 공급기업 풀 내 선택',
    applyUrl: 'https://www.sbiz.or.kr', sourceUrl: 'https://www.sbiz.or.kr',
    require: { bizStatus: { include: ['운영'] }, employees: { max: 9 }, industry: { include: ['음식점', '소매', '서비스'] } },
    boost: [], docs: ['사업자등록증', '견적서', '사업장 사진']
  },
  {
    id: 'online', tier: 1, source: 'manual', verifiedAt: null,
    category: 'voucher', agency: '소상공인시장진흥공단',
    name: '소상공인 온라인 판로지원',
    summary: '온라인 입점·라이브커머스·콘텐츠 제작 지원',
    amountMax: 3000000, terms: '항목별 바우처',
    applyUrl: 'https://www.sbiz.or.kr', sourceUrl: 'https://www.sbiz.or.kr',
    require: { bizStatus: { include: ['운영'] }, employees: { max: 9 }, onlineSales: { eq: '예' } },
    boost: [], docs: ['사업자등록증', '온라인몰 운영 확인서']
  },
  {
    id: 'durunuri', tier: 1, source: 'manual', verifiedAt: null,
    category: 'grant', agency: '근로복지공단',
    name: '두루누리 사회보험료 지원',
    summary: '소규모 사업장 저임금 근로자의 국민연금·고용보험료 일부 지원',
    amountMax: null, terms: '보험료의 일정 비율, 근로자 요건 충족 시',
    applyUrl: 'https://insurancesupport.or.kr', sourceUrl: 'https://insurancesupport.or.kr',
    require: { bizStatus: { include: ['운영'] }, employees: { max: 9 }, hasWorker: { eq: '예' } },
    boost: [], docs: ['보험료 지원 신청서', '근로자 보수 자료', '4대보험 가입자명부']
  },
  {
    id: 'flex-work', tier: 1, source: 'manual', verifiedAt: null,
    category: 'grant', agency: '고용노동부',
    name: '유연근무 장려금',
    summary: '재택·시차출퇴근 등 유연근무 도입 사업주 장려금',
    amountMax: null, terms: '근로자당 월 단위 지원',
    applyUrl: 'https://www.ei.go.kr', sourceUrl: 'https://www.moel.go.kr',
    require: { bizStatus: { include: ['운영'] }, hasWorker: { eq: '예' } },
    boost: [], docs: ['취업규칙', '근태 기록', '유연근무 운영 내역', '근로계약서']
  },
  {
    id: 'youth-jump', tier: 1, source: 'manual', verifiedAt: null,
    category: 'grant', agency: '고용노동부',
    name: '청년일자리도약장려금',
    summary: '취업애로 청년 정규직 채용 시 인건비 지원',
    amountMax: null, terms: '채용 유지 기간에 따라 분할 지급',
    applyUrl: 'https://www.work24.go.kr', sourceUrl: 'https://www.moel.go.kr',
    require: { bizStatus: { include: ['운영'] }, hasWorker: { eq: '예' }, taxOk: { eq: '예' } },
    boost: [], docs: ['사업자등록증', '근로계약서', '급여이체 내역', '4대보험 가입자명부']
  },
  {
    id: 'noran', tier: 1, source: 'manual', verifiedAt: null,
    category: 'grant', agency: '중소기업중앙회',
    name: '노란우산공제 희망장려금',
    summary: '공제 신규 가입 소상공인 납입액 일부 지원 (지자체)',
    amountMax: 1200000, terms: '지자체별 상이',
    applyUrl: 'https://www.8899.or.kr', sourceUrl: 'https://www.8899.or.kr',
    require: { bizStatus: { include: ['운영'] }, employees: { max: 9 }, revenue: { max: 300000000 } },
    boost: [], docs: ['사업자등록증', '공제 가입증서', '소득금액증명']
  },

  /* ---------- 휴폐업·재기 ---------- */
  {
    id: 'hope-cleanup', tier: 1, source: 'manual', verifiedAt: null,
    category: 'grant', agency: '소상공인시장진흥공단',
    name: '희망리턴패키지 · 점포철거비 지원',
    summary: '폐업 시 점포 철거·원상복구 비용 지원 (3.3㎡당 20만원)',
    amountMax: 6000000, terms: '면적 기준 산정, 실비 지원 · 자력 철거 제외',
    applyUrl: 'https://hope.sbiz.or.kr', sourceUrl: 'https://hope.sbiz.or.kr',
    require: { bizStatus: { include: ['폐업예정', '폐업완료'] } },
    boost: [], docs: ['사업자등록증', '임대차계약서', '철거 견적서', '폐업사실증명(폐업 완료 시)']
  },
  {
    id: 'hope-restart', tier: 1, source: 'manual', verifiedAt: null,
    category: 'grant', agency: '소상공인시장진흥공단',
    name: '희망리턴패키지 · 재도전 지원',
    summary: '사업정리 컨설팅, 재취업·재창업 교육과 장려금',
    amountMax: null, terms: '교육 이수 연계, 항목별 상이',
    applyUrl: 'https://hope.sbiz.or.kr', sourceUrl: 'https://hope.sbiz.or.kr',
    require: { bizStatus: { include: ['폐업예정', '폐업완료'] } },
    boost: [], docs: ['사업자등록증', '폐업사실증명', '교육 신청서']
  },
  {
    id: 'fresh-start', tier: 1, source: 'manual', verifiedAt: null,
    category: 'debt', agency: '한국자산관리공사(캠코)',
    name: '새출발기금 채무조정',
    summary: '폐업·부실 소상공인 대출 채무조정(기간 연장·금리 인하·원금 감면)',
    amountMax: null, terms: '심사에 따라 조정 내용 결정',
    applyUrl: 'https://www.kamco.or.kr', sourceUrl: 'https://www.kamco.or.kr',
    require: { bizStatus: { include: ['운영', '폐업예정', '폐업완료'] }, repayHard: { eq: '예' } },
    boost: [], docs: ['채무 확인 서류', '소득 증빙', '사업자등록증 또는 폐업사실증명']
  },
  {
    id: 'noran-close', tier: 1, source: 'manual', verifiedAt: null,
    category: 'grant', agency: '중소기업중앙회',
    name: '노란우산 폐업공제금',
    summary: '노란우산 가입자가 폐업 시 납입 공제금 수령(압류 방지 자산)',
    amountMax: null, terms: '납입액+이자, 폐업 사유 발생 시',
    applyUrl: 'https://www.8899.or.kr', sourceUrl: 'https://www.8899.or.kr',
    require: { bizStatus: { include: ['폐업예정', '폐업완료'] }, yellowUmbrella: { eq: '예' } },
    boost: [], docs: ['공제금 지급 청구서', '폐업사실증명']
  }
];

if (typeof module !== 'undefined') module.exports = { DATA_STATUS, PROGRAMS };
