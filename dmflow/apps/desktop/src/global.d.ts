import type { ApiClient } from "../../../packages/shared/src/index";
declare global {
  interface Window {
    DMFLOW_WEB?: boolean;
    dmflow: ApiClient & {
      open(url: string): Promise<void>;
      mode(
        next?: "demo" | "live",
      ): Promise<{ mode: string; paired: boolean; url: string }>;
      pair(url: string, code: string): Promise<void>;
      reset(): Promise<boolean>;
    };
  }
}
