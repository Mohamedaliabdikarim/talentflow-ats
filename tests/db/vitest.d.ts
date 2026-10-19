// Values handed from tests/db/global-setup.ts to the test files via project.provide().
declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

export {};
