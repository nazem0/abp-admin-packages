
export interface IStringValueType {
  name?: string;
  item?: object | null;
  properties?: Record<string, object>;
  validator?: IValueValidator;
}

export interface IValueValidator {
  name?: string;
  item?: object | null;
  properties?: Record<string, object>;
}
