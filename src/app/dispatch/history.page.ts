import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { PAYMENT_LABELS, STATUS_LABELS, dateTime, money, time, todayIso } from '../core/format';
import { DailyReportDto, OrderDto, OrderStatus } from '../core/models';
import { UiService } from '../core/ui.service';

@Component({
  selector: 'app-history-page',
  imports: [FormsModule],
  template: `
    <section class="page">
      <form class="filters panel" (ngSubmit)="load()">
        <label class="field"><span>Od</span><input type="date" name="from" [(ngModel)]="from" /></label>
        <label class="field"><span>Do</span><input type="date" name="to" [(ngModel)]="to" /></label>
        <label class="field">
          <span>Status</span>
          <select name="status" [(ngModel)]="status">
            <option value="">Svi</option>
            @for (entry of statusEntries; track entry[0]) {
              <option [value]="entry[0]">{{ entry[1] }}</option>
            }
          </select>
        </label>
        <button type="submit" class="button primary" [disabled]="ui.busy()">Prikazi</button>
      </form>

      @if (report(); as r) {
        <div class="panel">
          <h2>Dan {{ r.date }}</h2>
          <div class="stats">
            <div><strong>{{ r.created }}</strong><span>uneto</span></div>
            <div><strong>{{ r.delivered }}</strong><span>predato</span></div>
            <div><strong>{{ r.failed }}</strong><span>problem</span></div>
            <div><strong>{{ r.cancelled }}</strong><span>otkazano</span></div>
            <div><strong>{{ r.open }}</strong><span>u toku</span></div>
            <div><strong>{{ money(r.cashCollected) }}</strong><span>gotovina</span></div>
            <div><strong>{{ money(r.cardCollected) }}</strong><span>kartica</span></div>
            <div><strong>{{ r.averageDeliveryMinutes ?? '-' }}</strong><span>min prosecno do predaje</span></div>
          </div>
          <div class="two-tables">
            <table class="table">
              <thead><tr><th>Vozac</th><th>Predato</th><th>Problem</th><th>Gotovina (preda firmi)</th><th>Kartica</th><th>Prosek</th></tr></thead>
              <tbody>
                @for (line of r.drivers; track line.driverId) {
                  <tr>
                    <td>{{ line.driverName }}</td><td>{{ line.delivered }}</td><td>{{ line.failed }}</td>
                    <td><strong>{{ money(line.cashCollected) }}</strong></td><td>{{ money(line.cardCollected) }}</td>
                    <td>{{ line.averageDeliveryMinutes ?? '-' }} min</td>
                  </tr>
                } @empty { <tr><td colspan="6" class="empty small">Nema vozaca tog dana.</td></tr> }
              </tbody>
            </table>
            <table class="table">
              <thead><tr><th>Lokal</th><th>Predato</th><th>Otkazano</th><th>Ukupno</th></tr></thead>
              <tbody>
                @for (line of r.restaurants; track line.restaurantId) {
                  <tr><td>{{ line.restaurantName }}</td><td>{{ line.delivered }}</td><td>{{ line.cancelled }}</td><td>{{ line.total }}</td></tr>
                } @empty { <tr><td colspan="4" class="empty small">Nema porudzbina.</td></tr> }
              </tbody>
            </table>
          </div>
          @if (from !== to) {
            <p class="muted small-text">Izvestaj je za dan "Od"; spisak ispod pokriva ceo period.</p>
          }
        </div>
      }

      <div class="panel">
        <h2>Porudzbine ({{ orders().length }})</h2>
        <table class="table">
          <thead>
            <tr><th>#</th><th>Uneta</th><th>Lokal</th><th>Adresa</th><th>Vozac</th><th>Status</th><th>Preuzeta</th><th>Predata</th><th>Naplata</th></tr>
          </thead>
          <tbody>
            @for (order of orders(); track order.id) {
              <tr>
                <td>{{ order.id }}</td>
                <td>{{ dateTime(order.createdAt) }}</td>
                <td>{{ order.restaurantName }}@if (order.restaurantOrderRef) { <span class="muted"> br. {{ order.restaurantOrderRef }}</span> }</td>
                <td>{{ order.deliveryAddress }}</td>
                <td>{{ order.driverName || '-' }}</td>
                <td>
                  <span class="status" [attr.data-status]="order.status">{{ statusLabels[order.status] }}</span>
                  @if (order.problemNote) { <div class="muted small-text">{{ order.problemNote }}</div> }
                  @if (order.cancelReason) { <div class="muted small-text">{{ order.cancelReason }}</div> }
                </td>
                <td>{{ time(order.pickedUpAt) }}</td>
                <td>{{ time(order.deliveredAt) }}</td>
                <td>{{ money(order.amountToCollect) }} <span class="muted">{{ paymentLabels[order.paymentMethod] }}</span></td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="empty small">Nema porudzbina u periodu.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class HistoryPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly ui = inject(UiService);

  from = todayIso();
  to = todayIso();
  status: OrderStatus | '' = '';

  readonly orders = signal<OrderDto[]>([]);
  readonly report = signal<DailyReportDto | null>(null);
  readonly statusEntries = Object.entries(STATUS_LABELS);
  readonly statusLabels = STATUS_LABELS;
  readonly paymentLabels = PAYMENT_LABELS;
  readonly money = money;
  readonly time = time;
  readonly dateTime = dateTime;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    await this.ui.run(async () => {
      const [orders, report] = await Promise.all([
        this.api.history({ from: this.from, to: this.to || this.from, status: this.status }),
        this.api.dailyReport(this.from),
      ]);
      this.orders.set(orders);
      this.report.set(report);
    }, 'Istorija nije ucitana.');
  }
}
