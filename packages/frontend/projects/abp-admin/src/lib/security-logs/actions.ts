/** Human wording, tone and icon for ABP's IdentitySecurityLogActionConsts values. */
/** `labelKey` is an ABP localization key for known actions; unknown ones fall back to the derived `label` text. */
export interface ActionInfo { labelKey?: string; label?: string; tone: 'ok' | 'err' | 'warn' | 'info' | 'accent'; icon: string }

const IN = 'M15 4h4v16h-4M10 8l4 4-4 4M14 12H4';
const OUT = 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10';
const X = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6';
const LOCK = 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z';
const KEY = 'M15 7a4 4 0 1 1-3.9 4.9L4 19v-3h3v-3h3l1.1-1.1A4 4 0 0 1 15 7z';
const EDIT = 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4';
const SHIELD = 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z';

const KNOWN: Record<string, ActionInfo> = {
  LoginSucceeded: { labelKey: 'AbpAdmin::SecurityLogs:Action:LoginSucceeded', tone: 'ok', icon: IN },
  LoginInvalidUserName: { labelKey: 'AbpAdmin::SecurityLogs:Action:LoginInvalidUserName', tone: 'err', icon: X },
  LoginInvalidUserNameOrPassword: { labelKey: 'AbpAdmin::SecurityLogs:Action:LoginInvalidUserNameOrPassword', tone: 'err', icon: X },
  LoginFailed: { labelKey: 'AbpAdmin::SecurityLogs:Action:LoginFailed', tone: 'err', icon: X },
  LoginLockedout: { labelKey: 'AbpAdmin::SecurityLogs:Action:LoginLockedout', tone: 'warn', icon: LOCK },
  LoginNotAllowed: { labelKey: 'AbpAdmin::SecurityLogs:Action:LoginNotAllowed', tone: 'err', icon: X },
  LoginRequiresTwoFactor: { labelKey: 'AbpAdmin::SecurityLogs:Action:LoginRequiresTwoFactor', tone: 'info', icon: SHIELD },
  Logout: { labelKey: 'AbpAdmin::SecurityLogs:Action:Logout', tone: 'info', icon: OUT },
  ChangePassword: { labelKey: 'AbpAdmin::SecurityLogs:Action:ChangePassword', tone: 'accent', icon: KEY },
  ChangeEmail: { labelKey: 'AbpAdmin::SecurityLogs:Action:ChangeEmail', tone: 'accent', icon: EDIT },
  ChangePhoneNumber: { labelKey: 'AbpAdmin::SecurityLogs:Action:ChangePhoneNumber', tone: 'accent', icon: EDIT },
  ChangeUserName: { labelKey: 'AbpAdmin::SecurityLogs:Action:ChangeUserName', tone: 'accent', icon: EDIT },
};

export function describeAction(action?: string | null): ActionInfo {
  if (action && KNOWN[action]) return KNOWN[action];
  const words = (action ?? 'Unknown').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return { label: words[0].toUpperCase() + words.slice(1), tone: action?.startsWith('Login') ? 'err' : 'accent', icon: SHIELD };
}

/** Failed sign-in = any Login* action except success (same rule as the API's FailedOnly filter). */
export const isFailure = (action?: string | null) => !!action?.startsWith('Login') && action !== 'LoginSucceeded';
