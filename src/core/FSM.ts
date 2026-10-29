export interface State<C> {
  enter?(ctx: C, prev: string | null): void;
  update?(ctx: C, dt: number, time: number): string | void;
  exit?(ctx: C, next: string): void;
}

export class StateMachine<C> {
  current: string;
  time = 0;
  private prev: string | null = null;
  constructor(private ctx: C, private states: Record<string, State<C>>, initial: string) {
    this.current = initial;
    this.states[initial].enter?.(ctx, null);
  }
  get previous() {
    return this.prev;
  }
  go(name: string) {
    if (!this.states[name]) throw new Error(`Unknown state ${name}`);
    if (name === this.current) return;
    this.states[this.current].exit?.(this.ctx, name);
    this.prev = this.current;
    this.current = name;
    this.time = 0;
    this.states[name].enter?.(this.ctx, this.prev);
  }
  is(...names: string[]) {
    return names.includes(this.current);
  }
  update(dt: number) {
    this.time += dt;
    const next = this.states[this.current].update?.(this.ctx, dt, this.time);
    if (next && next !== this.current) this.go(next);
  }
}
