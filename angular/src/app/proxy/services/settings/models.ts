
export interface SettingGroupDto {
  name?: string;
  settings?: SettingItemDto[];
}

export interface SettingItemDto {
  name?: string;
  displayName?: string;
  description?: string | null;
  type?: string;
  value?: string | null;
  defaultValue?: string | null;
}

export interface SettingValueDto {
  name?: string;
  displayName?: string;
  description?: string | null;
  group?: string;
  type?: string;
  isEncrypted?: boolean;
  isEditable?: boolean;
  defaultValue?: string | null;
  configurationValue?: string | null;
  globalValue?: string | null;
  tenantValue?: string | null;
  value?: string | null;
}

export interface UpdateSettingDto {
  name?: string;
  value?: string | null;
}
