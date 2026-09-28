import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from './core/api.service';
import { AuthService } from './core/auth.service';
import { errorMessage } from './core/format';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <main class="login-page">
      <section class="login-panel">
        <div class="brand">
          <span class="brand-mark">DH</span>
          <div>
            <h1>Dostava hrane</h1>
            <p class="muted">Dispecerska tabla i aplikacija za vozace</p>
          </div>
        </div>

        <form class="stack" (ngSubmit)="submit()">
          <label class="field">
            <span>Korisnicko ime ili telefon</span>
            <input name="username" autocomplete="username" [(ngModel)]="username" [disabled]="loading()" />
          </label>
          <label class="field">
            <span>Lozinka</span>
            <input
              name="password"
              type="password"
              autocomplete="current-password"
              [(ngModel)]="password"
              [disabled]="loading()"
            />
          </label>
          @if (error()) {
            <p class="alert error">{{ error() }}</p>
          }
          <button class="button primary block" type="submit" [disabled]="loading()">
            {{ loading() ? 'Prijava...' : 'Prijavi se' }}
          </button>
        </form>
      </section>
    </main>
  `,
})
export class LoginComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  username = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal('');

  async submit(): Promise<void> {
    if (!this.username.trim() || !this.password) {
      this.error.set('Unesi korisnicko ime i lozinku.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      this.auth.setAuth(await this.api.login(this.username, this.password));
      await this.router.navigateByUrl(this.auth.homeUrl);
    } catch (error: unknown) {
      this.error.set(errorMessage(error, 'Prijava nije uspela.'));
    } finally {
      this.loading.set(false);
    }
  }
}
