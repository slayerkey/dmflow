import { DatabaseSync } from "node:sqlite";
import type { Repository, Statement } from "../../shared/src/index";
export class SQLiteRepository implements Repository {
  db: DatabaseSync;
  constructor(path: string, schema: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    this.db.exec(schema);
  }
  async all<T = Record<string, any>>(sql: string, args: unknown[] = []) {
    return this.db.prepare(sql).all(...(args as any[])) as T[];
  }
  async run(sql: string, args: unknown[] = []) {
    return Number(this.db.prepare(sql).run(...(args as any[])).changes);
  }
  async batch(statements: Statement[]) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const s of statements)
        this.db.prepare(s.sql).run(...((s.args ?? []) as any[]));
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
