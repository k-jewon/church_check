import { html, raw, type Raw } from './layout.js';
import { normalizeBirthYear } from '../domain/members.js';
import { isRoute, ROUTES, type NewProfile } from '../domain/newfamily.js';

// 새가족 등록 폼과 그 파싱. 두 화면이 같은 것을 쓴다 — 주일 현장(입력)과 사역자
// (관리자) 둘 다 등록하기 때문이다.
//
// **등록은 두 곳, 열람은 한 곳이다.** 방금 만난 사람에게 물어 받아 적는 것과
// 남의 개인정보를 목록으로 훑는 것은 다른 일이라, 입력 화면에는 이 폼만 있고
// 목록은 `/admin/newfamily` 에만 있다.
// 근거: context/wayfinder/tickets/12-방문-새가족-등록-경로-통합.md

export interface ProfileFormValues {
  name: string;
  birth_year: string;
  phone: string;
  gender: string;
  inviter: string;
  route: string;
  route_note: string;
}

export function profileValues(body: Record<string, unknown>): ProfileFormValues {
  const s = (k: string) => String(body[k] ?? '').trim();
  return {
    name: s('name'),
    birth_year: s('birth_year'),
    phone: s('phone'),
    gender: s('gender'),
    inviter: s('inviter'),
    route: s('route'),
    route_note: s('route_note'),
  };
}

const GENDERS = ['남', '여'];

export function profileForm(action: string, v?: ProfileFormValues, submit = '등록'): Raw {
  return html`
    <form method="post" action="${action}">
      <label>이름<input name="name" value="${v?.name ?? ''}" required /></label>
      <label>출생연도 (2자리 또는 4자리 · 미입력 가능)<input name="birth_year" value="${v?.birth_year ?? ''}" /></label>
      <label>연락처<input name="phone" value="${v?.phone ?? ''}" /></label>
      <label>성별
        <select name="gender">
          <option value="">— 선택 —</option>
          ${GENDERS.map((g) => html`<option value="${g}" ${v?.gender === g ? raw('selected') : raw('')}>${g}</option>`)}
        </select>
      </label>
      <label>인도자<input name="inviter" value="${v?.inviter ?? ''}" /></label>
      <label>방문경로
        <select name="route">
          <option value="">— 선택 —</option>
          ${ROUTES.map((r) => html`<option value="${r}" ${v?.route === r ? raw('selected') : raw('')}>${r}</option>`)}
        </select>
      </label>
      <label>방문경로 상세 (<code>기타</code>일 때만 저장됩니다)<input name="route_note" value="${v?.route_note ?? ''}" /></label>
      <button type="submit">${submit}</button>
    </form>`;
}

export type ParsedProfile =
  | { member: { name: string; birth_year: number | null }; profile: NewProfile }
  | { error: string };

export function parseProfileForm(body: Record<string, unknown>): ParsedProfile {
  const v = profileValues(body);
  if (!v.name) return { error: '이름을 입력하세요.' };
  const birth = v.birth_year === '' ? null : normalizeBirthYear(v.birth_year);
  if (v.birth_year !== '' && birth === null) return { error: '출생연도가 올바르지 않습니다.' };
  if (v.route !== '' && !isRoute(v.route)) return { error: '방문경로가 올바르지 않습니다.' };
  return {
    member: { name: v.name, birth_year: birth },
    profile: {
      phone: v.phone || null,
      gender: v.gender || null,
      inviter: v.inviter || null,
      route: isRoute(v.route) ? v.route : null,
      route_note: v.route_note || null,
    },
  };
}
