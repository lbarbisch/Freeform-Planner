/** Union-find with path halving and union by rank, keyed by strings. */
export class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  add(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: string): string {
    this.add(x);
    let p = this.parent.get(x)!;
    while (p !== x) {
      const gp = this.parent.get(p)!;
      this.parent.set(x, gp);
      x = gp;
      p = this.parent.get(x)!;
    }
    return x;
  }

  /** Returns true when the two sets were separate. */
  union(a: string, b: string): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    const ka = this.rank.get(ra)!;
    const kb = this.rank.get(rb)!;
    if (ka < kb) this.parent.set(ra, rb);
    else if (ka > kb) this.parent.set(rb, ra);
    else {
      this.parent.set(rb, ra);
      this.rank.set(ra, ka + 1);
    }
    return true;
  }

  items(): string[] {
    return [...this.parent.keys()];
  }
}
