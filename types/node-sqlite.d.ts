// Compatibility declaration for the project's @types/node 20.
// Runtime is Node >=22.13; remove this file when upgrading to @types/node 22+.
declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      get(...values: (string | number)[]): any;
      run(...values: (string | number | null)[]): unknown;
    };
  }
}
