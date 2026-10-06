export type MnemonicAssignment = {
  label: string;
  userNames: string[];
  drugs: string[];
};

export const mnemonicAssignments: MnemonicAssignment[] = [
  {
    label: "은재",
    userNames: ["은재", "이은재"],
    drugs: [
      "개자", "행인", "도인", "대추", "지실", "진피", "회향", "팔각회향", "후추",
      "보골지", "산조인", "청피", "귤핵", "등피", "지구자", "결명자", "괄루인", "부소맥",
      "아마인", "정력자", "토사자", "오매", "익지", "인진호", "애엽", "청호", "광곽향",
      "당약", "사향초", "구절초", "대계", "자소엽", "포공영",
    ],
  },
  {
    label: "형진",
    userNames: ["형진", "윤형진"],
    drugs: [
      "빈랑자", "콜히쿰자", "파두", "호미카", "고추", "마리아엉겅퀴", "산사", "산수유", "산초",
      "소두구", "백두구", "초과", "초두구", "연자육", "의이인", "구기자", "복분자", "영실",
      "사군자", "사상자", "사인", "여정실", "예지자", "대마", "로베리아초", "마황", "현초",
      "용아초", "상기생", "백굴채", "석곡", "용규",
    ],
  },
  {
    label: "서현",
    userNames: ["서현", "숭숭라이드"],
    drugs: [
      "견우자", "차전자", "카라발두", "커피두", "연교", "오미자", "치자", "홉·호프", "육두구",
      "비자", "여지핵", "백자인", "스트로판투스", "오수유", "우방자", "용안육", "내복자", "대풍자",
      "백편두", "자실", "질려자", "창이자", "천련자", "박하", "빈카", "음양곽", "히페리시초",
      "삼백초", "어성초", "익모초", "육종용(열당)", "향유",
    ],
  },
];

export function assignmentForUser(name: string) {
  const normalized = normalizeAssignmentName(name);
  return mnemonicAssignments.find((assignment) => assignment.userNames.some((userName) => normalized === normalizeAssignmentName(userName)));
}

export function assignmentNameVariants(name: string) {
  const withoutParenthetical = name.replace(/\([^)]*\)/g, "");
  return [...new Set([name, withoutParenthetical, ...withoutParenthetical.split(/[·/,]/)])]
    .map(normalizeAssignmentName)
    .filter(Boolean);
}

export function normalizeAssignmentName(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s·/()\[\]{}_-]/g, "");
}
