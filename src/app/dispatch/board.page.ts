import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { ApiService } from '../core/api.service';
import { PAYMENT_LABELS, mapsUrl, minutesSince, money, relative, time, toDate } from '../core/format';
import {
  BoardDto,
  DriverRouteDto,
  OptimizationDto,
  OrderDto,
  RestaurantDto,
  RouteStopDto,
  StopRef,
  SuggestionDto,
} from '../core/models';
import { RealtimeService } from '../core/realtime.service';
import { UiService } from '../core/ui.service';
import { OrderFormComponent } from './order-form.component';

/** Sta se prevlaci: nedodeljena porudzbina ili stanica iz necije rute. */
type DragItem = { type: 'order'; order: OrderDto } | { type: 'stop'; stop: RouteStopDto; driverId: number };

const POLL_MS = 30_000;
const CLOCK_MS = 20_000;
/** Porudzbina koja ovoliko ceka vozaca se istice. */
const WAITING_WARN_MINUTES = 10;

@Component({
  selector: 'app-board-page',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, OrderFormComponent],
  templateUrl: './board.page.html',
})
export class BoardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  readonly ui = inject(UiService);

  readonly board = signal<BoardDto | null>(null);
  readonly restaurants = signal<RestaurantDto[]>([]);
  readonly now = signal(Date.now());
  readonly showIdleDrivers = signal(false);

  readonly formOrder = signal<OrderDto | 'new' | null>(null);
  readonly suggestionOrder = signal<OrderDto | null>(null);
  readonly suggestions = signal<SuggestionDto[] | null>(null);
  readonly optimizationDriver = signal<DriverRouteDto | null>(null);
  readonly optimization = signal<OptimizationDto | null>(null);

  private dragging = false;
  private reloadPending = false;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  readonly paymentLabels = PAYMENT_LABELS;
  readonly time = time;
  readonly money = money;
  readonly mapsUrl = mapsUrl;

  /** U smeni ili sa stanicama; ostali vozaci su skriveni dok se ne zatraze. */
  readonly visibleDrivers = computed(() => {
    const drivers = this.board()?.drivers ?? [];
    return this.showIdleDrivers() ? drivers : drivers.filter((driver) => driver.onShift || driver.stops.length > 0);
  });
  readonly hiddenDriverCount = computed(() => (this.board()?.drivers.length ?? 0) - this.visibleDrivers().length);
  readonly onShiftCount = computed(() => (this.board()?.drivers ?? []).filter((driver) => driver.onShift).length);

  constructor() {
    // Obavestenje sa servera -> ponovo ucitaj (sa malim zakasnjenjem, jer stizu u naletima).
    effect(() => {
      if (this.realtime.tick() > 0) untracked(() => this.scheduleReload());
    });
  }

  async ngOnInit(): Promise<void> {
    await this.ui.run(async () => {
      const [board, restaurants] = await Promise.all([this.api.board(), this.api.restaurants()]);
      this.board.set(board);
      this.restaurants.set(restaurants);
      this.now.set(Date.now());
    }, 'Tabla nije ucitana.');

    const poll = setInterval(() => this.scheduleReload(), POLL_MS);
    const clock = setInterval(() => this.now.set(Date.now()), CLOCK_MS);
    this.destroyRef.onDestroy(() => {
      clearInterval(poll);
      clearInterval(clock);
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
    });
  }

  // ---------------------------------------------------------------- ucitavanje

  async reload(): Promise<void> {
    try {
      this.board.set(await this.api.board());
      this.now.set(Date.now());
    } catch (error: unknown) {
      await this.ui.handleError(error, 'Osvezavanje table nije uspelo.');
    }
  }

  /** Dok dispecer nesto prevlaci, tabla se ne menja ispod njega. */
  private scheduleReload(): void {
    if (this.dragging) {
      this.reloadPending = true;
      return;
    }
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => void this.reload(), 250);
  }

  dragStarted(): void {
    this.dragging = true;
  }

  dragEnded(): void {
    this.dragging = false;
    if (this.reloadPending) {
      this.reloadPending = false;
      this.scheduleReload();
    }
  }

  // ---------------------------------------------------------------- prevlacenje

  listId(driverId: number): string {
    return `driver-${driverId}`;
  }

  orderItem(order: OrderDto): DragItem {
    return { type: 'order', order };
  }

  stopItem(stop: RouteStopDto, driverId: number): DragItem {
    return { type: 'stop', stop, driverId };
  }

  async dropOnDriver(event: CdkDragDrop<unknown, unknown, DragItem>, driver: DriverRouteDto): Promise<void> {
    const item = event.item.data;
    if (item.type === 'order') {
      await this.assign(item.order, driver, 'BEST', 'Ubaceno na najbolje mesto; prevuci stanice ako hoces drugaciji redosled.');
      return;
    }
    if (item.driverId === driver.driverId) {
      await this.reorder(driver, event.previousIndex, event.currentIndex);
      return;
    }
    // Stanica prevucena kod drugog vozaca: cela porudzbina (preuzimanje i predaja) prelazi kod njega.
    if (item.stop.order.status === 'PICKED_UP') {
      this.ui.showError(`Porudzbina #${item.stop.orderId} je vec kod vozaca; ne moze drugom.`);
      return;
    }
    await this.assign(item.stop.order, driver, 'BEST', `Porudzbina #${item.stop.orderId} prebacena: ${driver.driverName}.`);
  }

  async dropOnUnassigned(event: CdkDragDrop<unknown, unknown, DragItem>): Promise<void> {
    const item = event.item.data;
    if (item.type === 'stop') await this.unassign(item.stop.order);
  }

  async moveStop(driver: DriverRouteDto, index: number, delta: number): Promise<void> {
    const target = index + delta;
    if (target < 0 || target >= driver.stops.length) return;
    await this.reorder(driver, index, target);
  }

  private async reorder(driver: DriverRouteDto, from: number, to: number): Promise<void> {
    if (from === to) return;
    const refs = driver.stops.map((stop) => ({ orderId: stop.orderId, kind: stop.kind }) as StopRef);
    moveItemInArray(refs, from, to);
    const problem = precedenceProblem(refs);
    if (problem) {
      this.ui.showError(problem);
      return;
    }
    // Odmah pomeri u prikazu; server vraca konacnu rutu sa novim procenama.
    moveItemInArray(driver.stops, from, to);
    await this.saveRoute(driver.driverId, driver.routeVersion, refs, 'Redosled sacuvan.');
  }

  // ---------------------------------------------------------------- radnje

  async assign(order: OrderDto, driver: DriverRouteDto, placement: 'BEST' | 'END', notice: string): Promise<void> {
    const ok = await this.ui.run(async () => {
      const route = await this.api.assign(order.id, driver.driverId, placement);
      this.replaceRoute(route);
    }, 'Dodela nije uspela.');
    if (ok) this.ui.showNotice(notice);
    await this.reload();
  }

  async unassign(order: OrderDto): Promise<void> {
    if (order.status === 'PICKED_UP') {
      this.ui.showError(`Porudzbina #${order.id} je vec kod vozaca.`);
      return;
    }
    const ok = await this.ui.run(() => this.api.unassign(order.id), 'Vracanje nije uspelo.');
    if (ok) this.ui.showNotice(`Porudzbina #${order.id} je ponovo nedodeljena.`);
    await this.reload();
  }

  async openSuggestions(order: OrderDto): Promise<void> {
    this.suggestionOrder.set(order);
    this.suggestions.set(null);
    const ok = await this.ui.run(async () => this.suggestions.set(await this.api.suggestions(order.id)), 'Predlog nije ucitan.');
    if (!ok) this.suggestionOrder.set(null);
  }

  async applySuggestion(suggestion: SuggestionDto): Promise<void> {
    const order = this.suggestionOrder();
    this.closeSuggestions();
    await this.saveRoute(suggestion.driverId, suggestion.routeVersion, suggestion.stops,
      `Porudzbina #${order?.id} dodeljena: ${suggestion.driverName}.`);
  }

  async appendTo(suggestion: SuggestionDto): Promise<void> {
    const order = this.suggestionOrder();
    const driver = this.board()?.drivers.find((item) => item.driverId === suggestion.driverId);
    this.closeSuggestions();
    if (order && driver) await this.assign(order, driver, 'END', `Porudzbina #${order.id} na kraj rute: ${driver.driverName}.`);
  }

  closeSuggestions(): void {
    this.suggestionOrder.set(null);
    this.suggestions.set(null);
  }

  async openOptimization(driver: DriverRouteDto): Promise<void> {
    this.optimizationDriver.set(driver);
    this.optimization.set(null);
    const ok = await this.ui.run(
      async () => this.optimization.set(await this.api.optimization(driver.driverId)),
      'Predlog redosleda nije ucitan.',
    );
    if (!ok) this.optimizationDriver.set(null);
  }

  async applyOptimization(): Promise<void> {
    const result = this.optimization();
    const driver = this.optimizationDriver();
    this.closeOptimization();
    if (result && driver) await this.saveRoute(driver.driverId, result.routeVersion, result.stops, 'Predlozeni redosled primenjen.');
  }

  closeOptimization(): void {
    this.optimizationDriver.set(null);
    this.optimization.set(null);
  }

  async toggleShift(driver: DriverRouteDto): Promise<void> {
    const ok = await this.ui.run(async () => {
      this.replaceRoute(await this.api.setDriverShift(driver.driverId, !driver.onShift));
    }, 'Promena smene nije uspela.');
    if (ok) this.ui.showNotice(`${driver.driverName}: ${driver.onShift ? 'smena zavrsena' : 'u smeni'}.`);
  }

  async cancel(order: OrderDto): Promise<void> {
    const reason = window.prompt(`Otkazivanje porudzbine #${order.id}. Razlog (nije obavezno):`, '');
    if (reason === null) return;
    const ok = await this.ui.run(() => this.api.cancelOrder(order.id, reason).then(() => undefined), 'Otkazivanje nije uspelo.');
    if (ok) this.ui.showNotice(`Porudzbina #${order.id} je otkazana.`);
    await this.reload();
  }

  async reopen(order: OrderDto): Promise<void> {
    const ok = await this.ui.run(() => this.api.reopenOrder(order.id).then(() => undefined), 'Vracanje u red nije uspelo.');
    if (ok) this.ui.showNotice(`Porudzbina #${order.id} ponovo ceka vozaca.`);
    await this.reload();
  }

  openNewOrder(): void {
    this.formOrder.set('new');
  }

  editOrder(order: OrderDto): void {
    this.formOrder.set(order);
  }

  async orderSaved(order: OrderDto): Promise<void> {
    const wasNew = this.formOrder() === 'new';
    this.formOrder.set(null);
    this.ui.showNotice(wasNew ? `Porudzbina #${order.id} je uneta.` : `Porudzbina #${order.id} je izmenjena.`);
    await this.reload();
    if (wasNew && order.status === 'NEW') await this.openSuggestions(order);
  }

  formOrderValue(): OrderDto | null {
    const value = this.formOrder();
    return value === 'new' ? null : value;
  }

  // ---------------------------------------------------------------- prikaz

  waitingMinutes(order: OrderDto): number {
    return Math.max(0, minutesSince(order.createdAt, this.now()));
  }

  round(value: number): number {
    return Math.round(value);
  }

  isWaitingLong(order: OrderDto): boolean {
    return this.waitingMinutes(order) >= WAITING_WARN_MINUTES;
  }

  /** Hrana je gotova, a jos niko nije krenuo po nju. */
  isFoodWaiting(order: OrderDto): boolean {
    const ready = toDate(order.readyAt);
    return !!ready && ready.getTime() <= this.now();
  }

  readyText(order: OrderDto): string {
    const ready = toDate(order.readyAt);
    if (!ready) return '';
    return ready.getTime() <= this.now() ? `gotovo od ${time(order.readyAt)}` : `gotovo ${time(order.readyAt)} (${relative(order.readyAt, this.now())})`;
  }

  /** ETA kasni u odnosu na spremnost hrane vise od 10 min: hrana ce se ohladiti. */
  isLatePickup(stop: RouteStopDto): boolean {
    const ready = toDate(stop.order.readyAt);
    const eta = toDate(stop.etaAt);
    return stop.kind === 'PICKUP' && !!ready && !!eta && eta.getTime() - ready.getTime() > 10 * 60_000;
  }

  describeRef(ref: StopRef): string {
    const all = [
      ...(this.board()?.drivers.flatMap((driver) => driver.stops) ?? []),
      ...(this.board()?.unassigned.map((order) => ({ orderId: order.id, order }) as RouteStopDto) ?? []),
    ];
    const found = all.find((stop) => stop.orderId === ref.orderId);
    if (!found) return `#${ref.orderId}`;
    return ref.kind === 'PICKUP'
      ? `Preuzmi #${ref.orderId} - ${found.order.restaurantName}`
      : `Predaj #${ref.orderId} - ${found.order.deliveryAddress}`;
  }

  // ---------------------------------------------------------------- pomocno

  private async saveRoute(driverId: number, version: number, stops: StopRef[], notice: string): Promise<void> {
    const ok = await this.ui.run(async () => {
      this.replaceRoute(await this.api.setRoute(driverId, version, stops));
    }, 'Ruta nije sacuvana.');
    if (ok) this.ui.showNotice(notice);
    // I posle greske (npr. ROUTE_CHANGED): tabla se vraca na stanje sa servera.
    await this.reload();
  }

  private replaceRoute(route: DriverRouteDto): void {
    const board = this.board();
    if (!board) return;
    this.board.set({
      ...board,
      drivers: board.drivers.map((driver) => (driver.driverId === route.driverId ? route : driver)),
    });
  }
}

/** Ista provera kao na serveru, da dispecer odmah vidi zasto potez ne moze. */
function precedenceProblem(stops: StopRef[]): string | null {
  const pickups = new Set(stops.filter((stop) => stop.kind === 'PICKUP').map((stop) => stop.orderId));
  const picked = new Set<number>();
  for (const stop of stops) {
    if (stop.kind === 'PICKUP') {
      picked.add(stop.orderId);
    } else if (pickups.has(stop.orderId) && !picked.has(stop.orderId)) {
      return `Porudzbina #${stop.orderId}: predaja ne moze pre preuzimanja.`;
    }
  }
  return null;
}

