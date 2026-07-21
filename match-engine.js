/* 매칭 엔진 — 진단 답변(a)과 프로그램 요건(require)을 대조해
   신청 가능(eligible) / 확인 필요(conditional) / 해당 없음(ineligible) 3단 분류.
   규칙: 미응답·'모름' 은 null → conditional 로 분류 (탈락 아님). */

const LABELS = {
  bizStatus: '사업 상태', industry: '업종', bizAge: '업력',
  employees: '상시근로자', revenue: '연매출', ownerAge: '대표 나이',
  purpose: '자금 용도', hasWorker: '직원 유무', onlineSales: '온라인 판매',
  yellowUmbrella: '노란우산 가입', taxOk: '세금 체납'
};

function numOk(rule, v) {
  if (v == null || v === '') return null;
  v = +v;
  if (rule.min != null && v < rule.min) return false;
  if (rule.max != null && v > rule.max) return false;
  return true;
}
function listOk(rule, v) {
  if (v == null || v === '모름') return null;
  if (rule.include && !rule.include.includes(v)) return false;
  if (rule.exclude && rule.exclude.includes(v)) return false;
  return true;
}
function eqOk(rule, v) {
  if (v == null || v === '모름') return null;
  return v === rule.eq;
}
function purposeOk(rule, v) {
  if (v == null) return null;
  if (v === '지원금') return null; // 지원금 위주 희망 → 대출 요건은 판단 유보
  return rule.includes(v);
}

function checkProgram(p, a) {
  const r = p.require || {};
  const checks = {
    bizStatus: r.bizStatus ? listOk(r.bizStatus, a.bizStatus) : true,
    industry: r.industry ? listOk(r.industry, a.industry) : true,
    bizAge: r.bizAge ? numOk(r.bizAge, a.bizAge) : true,
    employees: r.employees ? numOk(r.employees, a.employees) : true,
    revenue: r.revenue ? numOk(r.revenue, a.revenue) : true,
    ownerAge: r.ownerAge ? numOk(r.ownerAge, a.ownerAge) : true,
    purpose: r.purpose ? purposeOk(r.purpose, a.purpose) : true,
    hasWorker: r.hasWorker ? eqOk(r.hasWorker, a.hasWorker) : true,
    onlineSales: r.onlineSales ? eqOk(r.onlineSales, a.onlineSales) : true,
    yellowUmbrella: r.yellowUmbrella ? eqOk(r.yellowUmbrella, a.yellowUmbrella) : true,
    taxOk: r.taxOk ? eqOk(r.taxOk, a.taxOk) : true
  };
  const failed = [], unknown = [], reasons = [];
  for (const k in checks) {
    if (checks[k] === false) failed.push(LABELS[k]);
    else if (checks[k] === null) unknown.push(LABELS[k]);
  }
  (p.boost || []).forEach(b => {
    let hit = true;
    for (const k in b.when) {
      if (numOk(b.when[k], a[k]) !== true) hit = false;
    }
    if (hit) reasons.push(b.label);
  });
  return { failed, unknown, reasons };
}

function diagnose(programs, a) {
  const eligible = [], conditional = [], ineligible = [];
  programs.filter(p => p.tier === 1).forEach(p => {   // 티어1 수기검수 데이터만 진단 투입
    const { failed, unknown, reasons } = checkProgram(p, a);
    const item = { ...p, failed, unknown, reasons };
    if (failed.length) ineligible.push(item);
    else if (unknown.length) conditional.push(item);
    else eligible.push(item);
  });
  return { eligible, conditional, ineligible };
}

if (typeof module !== 'undefined') module.exports = { LABELS, checkProgram, diagnose };
