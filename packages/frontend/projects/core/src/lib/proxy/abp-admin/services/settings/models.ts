
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

export interface UpdateSettingDto {
  name?: string;
  value?: string | null;
}
