import { Injectable, signal } from '@angular/core';
import { StoredAuth } from './models';

const AUTH_KEY = 'dostava-hrane-auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly auth = signal<StoredAuth | null>(this.readStoredAuth());

  get snapshot(): StoredAuth | null {
    return this.auth();
  }

  get isDispatcher(): boolean {
    return this.auth()?.role === 'DISPATCHER';
  }

  get isDriver(): boolean {
    return this.auth()?.role === 'DRIVER';
  }

  /** Pocetna strana prema ulozi. */
  get homeUrl(): string {
    if (this.isDispatcher) return '/dispecer';
    if (this.isDriver) return '/vozac';
    return '/login';
  }

  setAuth(auth: StoredAuth): void {
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    } catch {
      // Bez storage-a prijava traje dok je tab otvoren.
    }
    this.auth.set(auth);
  }

  clearAuth(): void {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      // nema sta da se obrise
    }
    this.auth.set(null);
  }

  private readStoredAuth(): StoredAuth | null {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? (JSON.parse(raw) as StoredAuth) : null;
    } catch {
      return null;
    }
  }
}
