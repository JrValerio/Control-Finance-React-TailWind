export interface ApiHealth {
  ok: boolean;
  version: string;
  commit: string;
}

export interface ApiErrorResponse {
  message?: string;
}
