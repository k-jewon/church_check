import { createInterface } from 'node:readline';
import { DB_PATH, openDbFile } from './index.js';
import { ensureCurrent, isEmpty, LATEST_VERSION, migrate, pendingSteps, userVersion } from './migrate.js';

// `--migrate`: 데이터가 든 DB의 스키마를 명시적으로 올린다. 올라갈 단계와 각 단계가 지우는
// 데이터를 먼저 보이고, '업데이트'를 입력해야 진행한다. 반환값은 프로세스 종료 코드다.
export async function runMigrateCli(): Promise<number> {
  const db = openDbFile();
  try {
    if (isEmpty(db)) {
      ensureCurrent(db);
      console.log(`빈 DB를 스키마 v${userVersion(db)}로 만들었습니다: ${DB_PATH}`);
      return 0;
    }

    const from = userVersion(db);
    const steps = pendingSteps(db);
    if (steps.length === 0) {
      console.log(`DB 스키마가 이미 v${from}입니다. 올릴 것이 없습니다.`);
      return 0;
    }

    console.log(`\nDB: ${DB_PATH}`);
    console.log(`스키마를 v${from} → v${LATEST_VERSION} 로 올립니다.`);
    for (const s of steps) console.log(`  - v${s.version}: ${s.describe}`);
    console.log('\n이 작업은 되돌릴 수 없습니다. 백업이 없다면 지금 멈추고 백업.bat 을 먼저 실행하세요.');
    const answer = await ask("진행하려면 '업데이트'를 입력하세요 (그 밖은 취소): ");
    if (answer.normalize('NFC') !== '업데이트') {
      console.log('취소했습니다. DB는 바뀌지 않았습니다.');
      return 1;
    }

    console.log(`완료: DB 스키마 v${migrate(db)}`);
    return 0;
  } finally {
    db.close();
  }
}

// 한 줄을 읽는다. 입력이 닫히면(EOF) 빈 값으로 본다 — 취소다.
function ask(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.on('close', () => {
      if (!answered) resolve('');
    });
    rl.question(query, (a) => {
      answered = true;
      rl.close();
      resolve(a.trim());
    });
  });
}
