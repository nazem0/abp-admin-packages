import { mapEnumToOptions } from '@abp/ng.core';

export enum EventBoxKind {
  Outbox = 0,
  Inbox = 1,
}

export const eventBoxKindOptions = mapEnumToOptions(EventBoxKind);
