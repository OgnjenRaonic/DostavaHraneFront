import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { RealtimeService } from '../core/realtime.service';
import { UiService } from '../core/ui.service';

@Component({
  selector: 'app-dispatch-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <header class="topbar">
        <div class="brand small">
          <span class="brand-mark">DH</span>
          <strong>Dostava hrane</strong>
        </div>
        <nav class="tabs">
          <a routerLink="tabla" routerLinkActive="active">Tabla</a>
          <a routerLink="istorija" routerLinkActive="active">Istorija</a>
          <a routerLink="lokali" routerLinkActive="active">Lokali</a>
          <a routerLink="nalozi" routerLinkActive="active">Vozaci</a>
        </nav>
        <div class="topbar-right">
          <span class="live" [class.on]="realtime.connected()" title="Veza za obavestenja uzivo">
            {{ realtime.connected() ? 'uzivo' : 'bez veze' }}
          </span>
          <span class="muted">{{ username() }}</span>
          <button type="button" class="button ghost small" (click)="logout()">Odjava</button>
        </div>
      </header>

      @if (ui.error()) {
        <div class="alert error floating" role="alert">
          {{ ui.error() }}
          <button type="button" class="link" (click)="ui.clear()">zatvori</button>
        </div>
      } @else if (ui.notice()) {
        <div class="alert notice floating" role="status">{{ ui.notice() }}</div>
      }

      <main class="workspace" [attr.aria-label]="title()">
        <router-outlet />
      </main>
    </div>
  `,
})
export class DispatchShellComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly ui = inject(UiService);
  readonly realtime = inject(RealtimeService);

  readonly title = signal('Tabla');
  readonly username = signal(this.auth.snapshot?.username ?? '');

  ngOnInit(): void {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.ui.clear();
        this.updateTitle();
      });
    this.updateTitle();

    const disconnect = this.realtime.subscribe(['/topic/dispatch']);
    this.destroyRef.onDestroy(disconnect);
  }

  async logout(): Promise<void> {
    await this.api.logout();
    this.auth.clearAuth();
    await this.router.navigateByUrl('/login');
  }

  private updateTitle(): void {
    let current = this.route.snapshot;
    while (current.firstChild) current = current.firstChild;
    const title = String(current.data['title'] ?? 'Dispecer');
    this.title.set(title);
    document.title = `${title} - Dostava hrane`;
  }
}
