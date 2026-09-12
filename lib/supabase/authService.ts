import { supabase, isSupabaseConfigured } from './client';

export type AppRole = 'rt' | 'radiologist' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  department: string;
  initial: string;
}

export function normalizeRole(rawRole?: string | null): AppRole | null {
  if (!rawRole) return null;
  const r = rawRole.toLowerCase().trim();
  if (r === 'rt' || r === '방사선사') return 'rt';
  if (r === 'radiologist' || r === '전문의') return 'radiologist';
  if (r === 'admin' || r === '관리자') return 'admin';
  return null;
}

export function roleDisplayLabel(role: AppRole): string {
  switch (role) {
    case 'rt':
      return '방사선사';
    case 'radiologist':
      return '영상의학과 전문의';
    case 'admin':
      return '관리자';
    default:
      return '사용자';
  }
}

export async function signInWithEmailPassword(
  identifier: string,
  password: string
): Promise<{ profile: UserProfile | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      profile: null,
      error: new Error('Supabase 클라이언트가 설정되지 않았습니다. 환경변수를 확인해주세요.'),
    };
  }

  let email = identifier.trim();
  if (!email.includes('@')) {
    email = `${email}@jesuslove.hospital`;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return {
        profile: null,
        error: new Error(error?.message || '로그인에 실패했습니다. 아이디/이메일과 비밀번호를 확인해주세요.'),
      };
    }

    const { data: profileRow, error: profileErr } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileErr) {
      await supabase.auth.signOut();
      return {
        profile: null,
        error: new Error(`프로필 조회 중 오류가 발생했습니다: ${profileErr.message}`),
      };
    }

    if (!profileRow) {
      await supabase.auth.signOut();
      return {
        profile: null,
        error: new Error('권한 프로필(profiles)이 등록되지 않은 사용자입니다. 접근이 거부되었습니다.'),
      };
    }

    const appRole = normalizeRole(profileRow.role);
    if (!appRole) {
      await supabase.auth.signOut();
      return {
        profile: null,
        error: new Error(`허용되지 않은 사용자 권한(${profileRow.role || '미지정'})입니다. rt, radiologist, admin 권한만 접근 가능합니다.`),
      };
    }

    const name = profileRow.name?.trim() || data.user.user_metadata?.name?.trim() || (
      appRole === 'rt' ? '방사선사' : appRole === 'radiologist' ? '영상의학과 전문의' : '관리자'
    );

    const profile: UserProfile = {
      id: data.user.id,
      email: data.user.email || email,
      name,
      role: appRole,
      department: appRole === 'admin' ? '의료정보팀 / PACS 운영' : appRole === 'radiologist' ? '영상의학과 판독실' : '영상의학팀',
      initial: name.charAt(0) || (appRole === 'rt' ? '방' : appRole === 'radiologist' ? '영' : '관'),
    };

    return { profile, error: null };
  } catch (err: any) {
    return {
      profile: null,
      error: new Error(err?.message || '로그인 처리 중 예외가 발생했습니다.'),
    };
  }
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return null;
    }

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profileRow) {
      return null;
    }

    const appRole = normalizeRole(profileRow.role);
    if (!appRole) {
      return null;
    }

    const name = profileRow.name?.trim() || user.user_metadata?.name?.trim() || (
      appRole === 'rt' ? '방사선사' : appRole === 'radiologist' ? '영상의학과 전문의' : '관리자'
    );

    return {
      id: user.id,
      email: user.email || '',
      name,
      role: appRole,
      department: appRole === 'admin' ? '의료정보팀 / PACS 운영' : appRole === 'radiologist' ? '영상의학과 판독실' : '영상의학팀',
      initial: name.charAt(0) || (appRole === 'rt' ? '방' : appRole === 'radiologist' ? '영' : '관'),
    };
  } catch (err) {
    console.error('[authService] getCurrentUser error:', err);
    return null;
  }
}

export async function signOut(): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: true, error: null };
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err?.message || '로그아웃 중 오류가 발생했습니다.' };
  }
}