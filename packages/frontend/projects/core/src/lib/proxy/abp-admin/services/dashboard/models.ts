
export interface DashboardDto {
  users?: DashboardUsersDto | null;
  roles?: number | null;
  applications?: number | null;
  requests?: DashboardRequestsDto | null;
  signIns?: DashboardSignInsDto | null;
  jobs?: DashboardJobsDto | null;
}

export interface DashboardJobsDto {
  waiting?: number;
  abandoned?: number;
}

export interface DashboardRequestsDto {
  last24Hours?: number;
  failed?: number;
  averageMs?: number;
}

export interface DashboardSignInsDto {
  succeeded?: number;
  failed?: number;
  lockouts?: number;
}

export interface DashboardUsersDto {
  total?: number;
  inactive?: number;
  locked?: number;
  newLast7Days?: number;
}
