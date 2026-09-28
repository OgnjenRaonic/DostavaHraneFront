import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiError } from './api.service';
import { AuthService } from './auth.service';
import { errorMessage } from './format';

/** Poruka na vrhu strane i zauzetost tokom radnje; jedno mesto za sve strane. */
@Injectable({ providedIn: 'root' })
export class UiService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  readonly notice = signal('');
  readonly error = signal('');
  readonly busy = signal(false);

  showNotice(message: string): void {
    this.error.set('');
    this.notice.set(message);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 4000);
  }

  showError(message: string): void {
    this.notice.set('');
    this.error.set(message);
  }

  clear(): void {
    this.notice.set('');
    this.error.set('');
  }

  /** Izvrsava radnju; vraca false ako je druga vec u toku ili je pala. */
  async run(work: () => Promise<void>, fallbackMessage: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    this.error.set('');
    try {
      await work();
      return true;
    } catch (error: unknown) {
      await this.handleError(error, fallbackMessage);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Istekla sesija vodi na prijavu, sve ostalo se prikazuje kao poruka. */
  async handleError(error: unknown, fallbackMessage: string): Promise<void> {
    if (error instanceof ApiError && error.status === 401) {
      this.auth.clearAuth();
      await this.router.navigateByUrl('/login');
      return;
    }
    this.showError(errorMessage(error, fallbackMessage));
  }
}
