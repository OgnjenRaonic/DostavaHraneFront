import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { PAYMENT_LABELS, mapsUrl, money, time } from '../core/format';
import { DriverDayDto, DriverRouteDto, MeDto, RouteStopDto } from '../core/models';
import { RealtimeService } from '../core/realtime.service';
import { UiService } from '../core/ui.service';

/** Uzastopna preuzimanja u istom lokalu su jedna kartica sa jednim dugmetom. */
type StopGroup = { key: string; kind: 'PICKUP' | 'DROPOFF'; stops: RouteStopDto[] };

const POLL_MS = 30_000;
const LOCATION_EVERY_MS = 30_000;

@Component({
  selector: 'app-driver-page',
  template: `
    <div class="driver-app">
      <header class="driver-top">
        <div>
          <strong>{{ me()?.name ?? 'Vozac' }}</strong>
          <span class="live" [class.on]="realtime.connected()">{{ realtime.connected() ? 'uzivo' : 'bez veze' }}</span>
        </div>
        <div class="driver-top-actions">
          @if (route()?.onShift) {
            <button type="button" class="button small ghost" (click)="setShift(false)">Zavrsi smenu</button>
          }
          <button type="button" class="button small ghost" (click)="logout()">Odjava</button>
        </div>
      </header>

      @if (ui.error()) {
        <p class="alert error" role="alert">{{ ui.error() }} <button type="button" class="link" (click)="ui.clear()">ok</button></p>
      } @else if (ui.notice()) {
        <p class="alert notice" role="status">{{ ui.notice() }}</p>
      }

      @if (!route()) {
        <p class="empty">Ucitavanje...</p>
      } @else if (!route()!.onShift && route()!.stops.length === 0) {
        <section class="shift-start">
          <p>Nisi u smeni.</p>
          <button type="button" class="button primary big" (click)="setShift(true)">Zapocni smenu</button>
          <p class="muted small-text">U smeni aplikacija salje tvoju lokaciju dispeceru, da bi dobijao porudzbine blizu sebe.</p>
        </section>
      } @else {
        @if (unacknowledgedIds().length > 0) {
          <section class="new-banner">
            <strong>Nove porudzbine: {{ unacknowledgedIds().length }}</strong>
            <button type="button" class="button primary" (click)="acknowledge()" [disabled]="ui.busy()">Video sam</button>
          </section>
        }

        <div class="driver-summary">
          <span>U torbi: <strong>{{ route()!.ordersOnBoard }}</strong></span>
          <span>Za preuzeti: <strong>{{ route()!.ordersToPickUp }}</strong></span>
          @if (route()!.estimatedFinishAt) { <span>Kraj ~{{ time(route()!.estimatedFinishAt) }}</span> }
        </div>

        @for (group of groups(); track group.key; let first = $first) {
          <article class="driver-card" [class.pickup]="group.kind === 'PICKUP'" [class.dropoff]="group.kind === 'DROPOFF'" [class.next]="first">
            @if (first) { <span class="next-label">SLEDECE</span> }
            @if (group.kind === 'PICKUP') {
              <div class="driver-card-head">
                <span class="kind">PREUZMI {{ group.stops.length > 1 ? '(' + group.stops.length + ')' : '' }}</span>
                <span class="eta">~{{ time(group.stops[0].etaAt) }}</span>
              </div>
              <h3>{{ group.stops[0].order.restaurantName }}</h3>
              <p>{{ group.stops[0].order.restaurantAddress }}</p>
              <ul class="plain">
                @for (stop of group.stops; track stop.orderId) {
                  <li>
                    #{{ stop.orderId }}
                    @if (stop.order.restaurantOrderRef) { <strong>br. {{ stop.order.restaurantOrderRef }}</strong> }
                    · gotovo {{ time(stop.order.readyAt) }}
                    @if (stop.order.customerName) { · za {{ stop.order.customerName }} }
                  </li>
                }
              </ul>
              @if (group.stops[0].order.note) { <p class="note">{{ group.stops[0].order.note }}</p> }
              <div class="driver-actions">
                <button type="button" class="button primary big" (click)="pickUp(group)" [disabled]="ui.busy()">
                  Preuzeo sam{{ group.stops.length > 1 ? ' sve (' + group.stops.length + ')' : '' }}
                </button>
                <a class="button ghost" target="_blank" rel="noopener"
                  [href]="mapsUrl(group.stops[0].order.restaurantLatitude, group.stops[0].order.restaurantLongitude, group.stops[0].order.restaurantAddress)">Navigacija</a>
                @if (group.stops[0].order.restaurantPhone) {
                  <a class="button ghost" [href]="'tel:' + group.stops[0].order.restaurantPhone">Pozovi lokal</a>
                }
              </div>
            } @else {
              @let stop = group.stops[0];
              <div class="driver-card-head">
                <span class="kind">PREDAJ #{{ stop.orderId }}</span>
                <span class="eta">~{{ time(stop.etaAt) }}</span>
              </div>
              <h3>{{ stop.order.deliveryAddress }}</h3>
              <p>{{ stop.order.customerName || 'Kupac' }} · {{ stop.order.customerPhone }}</p>
              <p class="amount">
                @if (stop.order.paymentMethod === 'PREPAID') { Placeno unapred } @else {
                  Naplati <strong>{{ money(stop.order.amountToCollect) }}</strong> ({{ paymentLabels[stop.order.paymentMethod] }})
                }
              </p>
              @if (stop.order.note) { <p class="note">{{ stop.order.note }}</p> }
              @if (stop.order.status !== 'PICKED_UP') {
                <p class="muted small-text">Prvo preuzmi u lokalu {{ stop.order.restaurantName }}.</p>
              }
              <div class="driver-actions">
                <button type="button" class="button primary big" (click)="deliver(stop)"
                  [disabled]="ui.busy() || stop.order.status !== 'PICKED_UP'">Predato</button>
                <a class="button ghost" target="_blank" rel="noopener"
                  [href]="mapsUrl(stop.order.deliveryLatitude, stop.order.deliveryLongitude, stop.order.deliveryAddress)">Navigacija</a>
                <a class="button ghost" [href]="'tel:' + stop.order.customerPhone">Pozovi</a>
                <button type="button" class="button ghost danger-text" (click)="problem(stop)">Problem</button>
              </div>
            }
          </article>
        } @empty {
          <p class="empty">Nema stanica. Dispecer ce ti poslati porudzbinu.</p>
        }
      }

      @if (day(); as d) {
        <footer class="driver-day">
          Danas: predato <strong>{{ d.deliveredCount }}</strong> · gotovina <strong>{{ money(d.cashCollected) }}</strong>
          · kartica {{ money(d.cardCollected) }}
        </footer>
      }
    </div>
  `,
})
export class DriverPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly realtime = inject(RealtimeService);
  readonly ui = inject(UiService);

  readonly me = signal<MeDto | null>(null);
  readonly route = signal<DriverRouteDto | null>(null);
  readonly day = signal<DriverDayDto | null>(null);

  readonly time = time;
  readonly money = money;
  readonly mapsUrl = mapsUrl;
  readonly paymentLabels = PAYMENT_LABELS;

  private watchId: number | null = null;
  private lastLocationSentAt = 0;
  private lastUnacknowledged = 0;

  readonly unacknowledgedIds = computed(() => {
    const ids = new Set<number>();
    for (const stop of this.route()?.stops ?? []) {
      if (stop.order.status === 'ASSIGNED' && !stop.order.acknowledgedAt) ids.add(stop.orderId);
    }
    return [...ids];
  });

  readonly groups = computed<StopGroup[]>(() => {
    const groups: StopGroup[] = [];
    for (const stop of this.route()?.stops ?? []) {
      const last = groups[groups.length - 1];
      if (stop.kind === 'PICKUP' && last?.kind === 'PICKUP' && last.stops[0].order.restaurantId === stop.order.restaurantId) {
        last.stops.push(stop);
      } else {
        groups.push({ key: `${stop.kind}-${stop.orderId}`, kind: stop.kind, stops: [stop] });
      }
    }
    return groups;
  });

  constructor() {
    effect(() => {
      if (this.realtime.tick() > 0) untracked(() => void this.reload());
    });
    // Nova dodela: kratka vibracija, da vozac pogleda telefon.
    effect(() => {
      const count = this.unacknowledgedIds().length;
      if (count > this.lastUnacknowledged && 'vibrate' in navigator) navigator.vibrate?.([200, 100, 200]);
      this.lastUnacknowledged = count;
    });
  }

  async ngOnInit(): Promise<void> {
    await this.ui.run(async () => {
      const me = await this.api.me();
      this.me.set(me);
      await this.loadRoute();
      const disconnect = this.realtime.subscribe([`/topic/driver/${me.id}`]);
      this.destroyRef.onDestroy(disconnect);
    }, 'Ruta nije ucitana.');

    const poll = setInterval(() => void this.reload(), POLL_MS);
    this.destroyRef.onDestroy(() => {
      clearInterval(poll);
      this.stopLocation();
    });
  }

  async reload(): Promise<void> {
    try {
      await this.loadRoute();
    } catch (error: unknown) {
      await this.ui.handleError(error, 'Osvezavanje nije uspelo.');
    }
  }

  async setShift(onShift: boolean): Promise<void> {
    if (!onShift && !window.confirm('Zavrsiti smenu?')) return;
    await this.ui.run(async () => this.applyRoute(await this.api.driverShift(onShift)), 'Promena smene nije uspela.');
  }

  async acknowledge(): Promise<void> {
    await this.ui.run(async () => this.applyRoute(await this.api.driverAcknowledge(this.unacknowledgedIds())), 'Potvrda nije uspela.');
  }

  async pickUp(group: StopGroup): Promise<void> {
    const ids = group.stops.map((stop) => stop.orderId);
    const ok = await this.ui.run(async () => this.applyRoute(await this.api.driverPickUp(ids)), 'Preuzimanje nije uspelo.');
    if (ok) this.ui.showNotice(ids.length > 1 ? `Preuzeto ${ids.length} porudzbine.` : `Preuzeto #${ids[0]}.`);
  }

  async deliver(stop: RouteStopDto): Promise<void> {
    const ok = await this.ui.run(async () => this.applyRoute(await this.api.driverDeliver(stop.orderId)), 'Predaja nije uspela.');
    if (ok) {
      this.ui.showNotice(`#${stop.orderId} predato.`);
      await this.loadDay();
    }
  }

  async problem(stop: RouteStopDto): Promise<void> {
    const reason = window.prompt(`Sta se desilo sa #${stop.orderId}? (npr. kupac se ne javlja)`, '');
    if (!reason || !reason.trim()) return;
    const ok = await this.ui.run(
      async () => this.applyRoute(await this.api.driverProblem(stop.orderId, reason.trim())),
      'Prijava problema nije uspela.',
    );
    if (ok) this.ui.showNotice('Dispecer je obavesten.');
  }

  async logout(): Promise<void> {
    this.stopLocation();
    await this.api.logout();
    this.auth.clearAuth();
    await this.router.navigateByUrl('/login');
  }

  private async loadRoute(): Promise<void> {
    this.applyRoute(await this.api.driverRoute());
    await this.loadDay();
  }

  private async loadDay(): Promise<void> {
    this.day.set(await this.api.driverDay());
  }

  private applyRoute(route: DriverRouteDto): void {
    this.route.set(route);
    if (route.onShift) this.startLocation();
    else this.stopLocation();
  }

  /** Lokacija ide dispeceru najvise jednom u pola minuta, samo dok je vozac u smeni. */
  private startLocation(): void {
    if (this.watchId !== null || !('geolocation' in navigator)) return;
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - this.lastLocationSentAt < LOCATION_EVERY_MS) return;
        this.lastLocationSentAt = now;
        void this.api.driverLocation(position.coords.latitude, position.coords.longitude).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
  }

  private stopLocation(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}
