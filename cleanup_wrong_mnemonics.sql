BEGIN;

-- 1) 잘못 생성된 "내 암기법"을 선호 버전으로 가리키는
--    현재 사용자 preference가 있으면 제거
DELETE FROM user_mnemonic_preferences ump
USING "user" u, crude_drugs cd
WHERE ump.user_id = u.id
  AND ump.drug_id = cd.id
  AND u.email = 'ssgeness12@yonsei.ac.kr'
  AND ump.preferred_mnemonic_user_id = u.id
  AND cd.korean_name IN (
    '개자','행인','보골지','산조인','결명자','괄루인','아마인',
    '견우자','육두구','차전자','카라발두','커피두','비자',
    '백자인','스트로판투스','내복자','백편두'
  );

-- 2) 첫 import 때 윤형진 계정으로 잘못 저장된 mnemonic만 삭제
DELETE FROM user_drug_mnemonics udm
USING "user" u, crude_drugs cd
WHERE udm.user_id = u.id
  AND udm.drug_id = cd.id
  AND u.email = 'ssgeness12@yonsei.ac.kr'
  AND cd.korean_name IN (
    '개자','행인','보골지','산조인','결명자','괄루인','아마인',
    '견우자','육두구','차전자','카라발두','커피두','비자',
    '백자인','스트로판투스','내복자','백편두'
  );

-- 3) 정말 다 지워졌는지 확인
SELECT
  u.name AS user_name,
  u.email,
  cd.korean_name,
  udm.id AS mnemonic_id
FROM user_drug_mnemonics udm
JOIN "user" u
  ON u.id = udm.user_id
JOIN crude_drugs cd
  ON cd.id = udm.drug_id
WHERE u.email = 'ssgeness12@yonsei.ac.kr'
  AND cd.korean_name IN (
    '개자','행인','보골지','산조인','결명자','괄루인','아마인',
    '견우자','육두구','차전자','카라발두','커피두','비자',
    '백자인','스트로판투스','내복자','백편두'
  )
ORDER BY cd.korean_name;

COMMIT;
